//! Durable metadata for remote transcription work accepted by the desktop.
//!
//! Audio is written separately under Handy's recordings directory. Persisting the
//! small job record lets a phone reconnect after a network interruption without
//! blindly uploading the same recording again.

use crate::remote::auth::{now_secs, uuid_simple};
use crate::remote::dto::TranscriptionResponse;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

pub const REMOTE_JOB_STORE_PATH: &str = "remote_jobs.json";
const JOBS_KEY: &str = "jobs";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteJobStatus {
    Queued,
    Decoding,
    Transcribing,
    PostProcessing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteJob {
    pub id: String,
    pub device_id: String,
    pub recording_id: String,
    pub file_name: String,
    /// Original capture segments. Older single-file jobs deserialize with an
    /// empty vector and transparently fall back to `file_name`.
    #[serde(default)]
    pub file_names: Vec<String>,
    #[serde(default)]
    pub post_process: bool,
    pub status: RemoteJobStatus,
    pub created_at: u64,
    pub updated_at: u64,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub transcription: Option<TranscriptionResponse>,
}

pub trait JobStorage: Send + Sync {
    fn load(&self) -> Vec<RemoteJob>;
    fn save(&self, jobs: &[RemoteJob]);
}

#[derive(Default)]
struct InMemoryStorage;

impl JobStorage for InMemoryStorage {
    fn load(&self) -> Vec<RemoteJob> {
        Vec::new()
    }

    fn save(&self, _jobs: &[RemoteJob]) {}
}

struct TauriStorage {
    app: AppHandle,
}

impl JobStorage for TauriStorage {
    fn load(&self) -> Vec<RemoteJob> {
        let store = match self
            .app
            .store(crate::portable::store_path(REMOTE_JOB_STORE_PATH))
        {
            Ok(store) => store,
            Err(error) => {
                log::warn!("Remote jobs: could not open persistent store ({error})");
                return Vec::new();
            }
        };
        store
            .get(JOBS_KEY)
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default()
    }

    fn save(&self, jobs: &[RemoteJob]) {
        let store = match self
            .app
            .store(crate::portable::store_path(REMOTE_JOB_STORE_PATH))
        {
            Ok(store) => store,
            Err(error) => {
                log::warn!("Remote jobs: could not open persistent store ({error})");
                return;
            }
        };
        match serde_json::to_value(jobs) {
            Ok(value) => {
                store.set(JOBS_KEY, value);
                if let Err(error) = store.save() {
                    log::warn!("Remote jobs: could not save persistent store ({error})");
                }
            }
            Err(error) => log::warn!("Remote jobs: could not serialize jobs ({error})"),
        }
    }
}

pub struct RemoteJobStore {
    jobs: Mutex<HashMap<String, RemoteJob>>,
    storage: Box<dyn JobStorage>,
}

impl RemoteJobStore {
    pub fn new() -> Self {
        Self::with_storage(Box::new(InMemoryStorage))
    }

    pub fn with_app(app: AppHandle) -> Self {
        Self::with_storage(Box::new(TauriStorage { app }))
    }

    pub fn with_storage(storage: Box<dyn JobStorage>) -> Self {
        let jobs = storage
            .load()
            .into_iter()
            .map(|job| (job.id.clone(), job))
            .collect();
        Self {
            jobs: Mutex::new(jobs),
            storage,
        }
    }

    pub fn create_or_get(
        &self,
        device_id: impl Into<String>,
        recording_id: impl Into<String>,
        file_names: Vec<String>,
        post_process: bool,
    ) -> RemoteJob {
        let device_id = device_id.into();
        let recording_id = recording_id.into();
        let mut jobs = self.jobs.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(job) = jobs
            .values()
            .find(|job| job.device_id == device_id && job.recording_id == recording_id)
            .cloned()
        {
            return job;
        }

        let now = now_secs();
        let file_name = file_names
            .first()
            .cloned()
            .unwrap_or_else(|| "upload.audio".to_string());
        let job = RemoteJob {
            id: format!("job_{}", uuid_simple()),
            device_id,
            recording_id,
            file_name,
            file_names,
            post_process,
            status: RemoteJobStatus::Queued,
            created_at: now,
            updated_at: now,
            error_code: None,
            error_message: None,
            transcription: None,
        };
        jobs.insert(job.id.clone(), job.clone());
        drop(jobs);
        self.persist();
        job
    }

    pub fn get(&self, job_id: &str) -> Option<RemoteJob> {
        self.jobs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get(job_id)
            .cloned()
    }

    pub fn set_status(&self, job_id: &str, status: RemoteJobStatus) {
        if let Some(job) = self
            .jobs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get_mut(job_id)
        {
            job.status = status;
            job.updated_at = now_secs();
            job.error_code = None;
            job.error_message = None;
        }
        self.persist();
    }

    pub fn fail(&self, job_id: &str, code: impl Into<String>, message: impl Into<String>) {
        if let Some(job) = self
            .jobs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get_mut(job_id)
        {
            job.status = RemoteJobStatus::Failed;
            job.updated_at = now_secs();
            job.error_code = Some(code.into());
            job.error_message = Some(message.into());
            job.transcription = None;
        }
        self.persist();
    }

    /// Start a new attempt for an accepted recording after a transient desktop
    /// failure. Completed and still-running work deliberately remains immutable
    /// so normal network retries cannot duplicate a history entry.
    pub fn requeue_failed(&self, job_id: &str) -> Option<RemoteJob> {
        let requeued = self
            .jobs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get_mut(job_id)
            .and_then(|job| {
                if job.status != RemoteJobStatus::Failed {
                    return None;
                }
                job.status = RemoteJobStatus::Queued;
                job.updated_at = now_secs();
                job.error_code = None;
                job.error_message = None;
                Some(job.clone())
            });
        if requeued.is_some() {
            self.persist();
        }
        requeued
    }

    pub fn complete(&self, job_id: &str, transcription: TranscriptionResponse) {
        if let Some(job) = self
            .jobs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get_mut(job_id)
        {
            job.status = RemoteJobStatus::Completed;
            job.updated_at = now_secs();
            job.error_code = None;
            job.error_message = None;
            job.transcription = Some(transcription);
        }
        self.persist();
    }

    /// Jobs that were accepted before a desktop restart and still have their
    /// temporary audio file can safely be resumed by the server.
    pub fn resumable(&self) -> Vec<RemoteJob> {
        self.jobs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .values()
            .filter(|job| {
                matches!(
                    job.status,
                    RemoteJobStatus::Queued
                        | RemoteJobStatus::Decoding
                        | RemoteJobStatus::Transcribing
                        | RemoteJobStatus::PostProcessing
                )
            })
            .cloned()
            .collect()
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.jobs.lock().unwrap().len()
    }

    fn persist(&self) {
        let jobs = self
            .jobs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .values()
            .cloned()
            .collect::<Vec<_>>();
        self.storage.save(&jobs);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creating_the_same_recording_twice_reuses_the_original_job() {
        let store = RemoteJobStore::new();

        let first = store.create_or_get(
            "device_a",
            "recording_123",
            vec!["audio.m4a".to_string()],
            false,
        );
        let second = store.create_or_get(
            "device_a",
            "recording_123",
            vec!["audio.m4a".to_string()],
            false,
        );

        assert_eq!(first.id, second.id);
        assert_eq!(store.len(), 1);
        assert_eq!(first.status, RemoteJobStatus::Queued);
    }

    #[test]
    fn failed_job_exposes_a_sanitized_error_without_audio_details() {
        let store = RemoteJobStore::new();
        let job = store.create_or_get(
            "device_a",
            "recording_123",
            vec!["audio.m4a".to_string()],
            false,
        );

        store.fail(&job.id, "invalid_audio", "could not decode audio");

        let failed = store.get(&job.id).expect("job should remain queryable");
        assert_eq!(failed.status, RemoteJobStatus::Failed);
        assert_eq!(failed.error_code.as_deref(), Some("invalid_audio"));
        assert_eq!(
            failed.error_message.as_deref(),
            Some("could not decode audio")
        );
    }

    #[test]
    fn failed_recording_can_be_requeued_without_changing_its_idempotency_key() {
        let store = RemoteJobStore::new();
        let job = store.create_or_get(
            "device_a",
            "recording_123",
            vec!["audio.m4a".to_string()],
            false,
        );
        store.fail(&job.id, "transcription_failed", "desktop was busy");

        let retried = store
            .requeue_failed(&job.id)
            .expect("failed job should be requeueable");

        assert_eq!(retried.id, job.id);
        assert_eq!(retried.status, RemoteJobStatus::Queued);
        assert!(retried.error_code.is_none());
    }
}
