use crate::audio_toolkit::wav_duration_ms;
use crate::post_processing::process_transcription_output;
use crate::remote::cache::BoundedCache;
use crate::remote::dto::TranscriptionJobResponse;
use crate::remote::dto::TranscriptionResponse;
use crate::remote::jobs::RemoteJobStatus;
use crate::remote::routes::health::json_error;
use crate::remote::routes::require_auth;
use crate::remote::state::RemoteServerState;
use crate::settings::get_settings;
use axum::extract::{Multipart, Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use log::{error, info};
use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::sync::Arc;

/// Freshly produced responses, kept only until history can answer for them.
/// Bounded so a long-running desktop session cannot accumulate every
/// transcription ever sent from a paired device.
static TRANSCRIPTION_CACHE: Lazy<BoundedCache<TranscriptionResponse>> =
    Lazy::new(BoundedCache::new);

pub async fn create_transcription(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<
    (StatusCode, Json<TranscriptionJobResponse>),
    (StatusCode, Json<crate::remote::dto::ApiError>),
> {
    let device = require_auth(&state, &headers)?;

    let mut audios: Vec<(String, Vec<u8>)> = Vec::new();
    let mut post_process = false;
    let mut recording_id: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| json_error(StatusCode::BAD_REQUEST, "multipart", e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" | "audio" => {
                let filename = field
                    .file_name()
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| format!("upload-{}.audio", audios.len() + 1));
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| json_error(StatusCode::BAD_REQUEST, "read_file", e.to_string()))?
                    .to_vec();
                if bytes.is_empty() {
                    return Err(json_error(
                        StatusCode::BAD_REQUEST,
                        "invalid_audio",
                        "audio file is empty",
                    ));
                }
                audios.push((filename, bytes));
            }
            "postProcess" | "post_process" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| json_error(StatusCode::BAD_REQUEST, "field", e.to_string()))?;
                post_process = matches!(text.as_str(), "1" | "true" | "True" | "yes");
            }
            "recordingId" | "recording_id" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| json_error(StatusCode::BAD_REQUEST, "field", e.to_string()))?;
                if !text.trim().is_empty() {
                    recording_id = Some(text);
                }
            }
            _ => {}
        }
    }

    if audios.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "missing_file",
            "audio file is required",
        ));
    }

    let upload_bytes = audios.iter().map(|(_, bytes)| bytes.len()).sum::<usize>();
    if upload_bytes > 25 * 1024 * 1024 {
        return Err(json_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "too_large",
            "upload exceeds 25MB limit",
        ));
    }

    let recording_id =
        recording_id.unwrap_or_else(|| format!("recording_{}", crate::remote::auth::uuid_simple()));
    let file_names = audios
        .iter()
        .map(|(filename, _)| filename.clone())
        .collect::<Vec<_>>();
    let job = state
        .jobs
        .create_or_get(&device.id, recording_id, file_names, post_process);
    if job.status != RemoteJobStatus::Queued {
        return Ok((StatusCode::ACCEPTED, Json(job_response(job))));
    }
    let raw_paths = job_audio_paths(&state, &job);

    if raw_paths.iter().any(|path| !path.exists()) {
        if raw_paths.len() != audios.len() {
            return Err(json_error(
                StatusCode::CONFLICT,
                "idempotency_conflict",
                "recording id was already accepted with different audio segments",
            ));
        }
        for ((_, bytes), raw_path) in audios.into_iter().zip(&raw_paths) {
            std::fs::write(raw_path, bytes).map_err(|e| {
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "save_upload",
                    e.to_string(),
                )
            })?;
        }
        spawn_job(state.clone(), job.id.clone(), raw_paths, post_process);
    }

    info!(
        "Remote job {} accepted: {} bytes (device={})",
        job.id, upload_bytes, device.id
    );

    let current = state.jobs.get(&job.id).unwrap_or(job);
    Ok((StatusCode::ACCEPTED, Json(job_response(current))))
}

/// Resume work accepted before a desktop restart. It is deliberately called
/// only after the listener is live, so an immediately reconnecting phone can
/// query the same idempotent job id while recovery is underway.
pub(crate) fn resume_pending_jobs(state: Arc<RemoteServerState>) {
    for job in state.jobs.resumable() {
        let raw_paths = job_audio_paths(&state, &job);
        if raw_paths.iter().all(|path| path.exists()) {
            info!("Remote job {}: resuming after restart", job.id);
            spawn_job(state.clone(), job.id, raw_paths, job.post_process);
        } else {
            state.jobs.fail(
                &job.id,
                "recovery_missing_audio",
                "the temporary audio was unavailable after restart",
            );
        }
    }
}

pub async fn get_transcription_job(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<TranscriptionJobResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let device = require_auth(&state, &headers)?;
    let job = state.jobs.get(&id).ok_or_else(|| {
        json_error(
            StatusCode::NOT_FOUND,
            "not_found",
            "transcription job was not found",
        )
    })?;
    if job.device_id != device.id {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "not_found",
            "transcription job was not found",
        ));
    }
    Ok(Json(job_response(job)))
}

fn job_response(job: crate::remote::jobs::RemoteJob) -> TranscriptionJobResponse {
    TranscriptionJobResponse {
        id: job.id,
        status: job.status,
        error_code: job.error_code,
        error_message: job.error_message,
        transcription: job.transcription,
    }
}

fn job_audio_paths(
    state: &RemoteServerState,
    job: &crate::remote::jobs::RemoteJob,
) -> Vec<PathBuf> {
    if job.file_names.is_empty() {
        return vec![legacy_job_audio_path(state, &job.id, &job.file_name)];
    }
    job.file_names
        .clone()
        .into_iter()
        .enumerate()
        .map(|(index, filename)| job_audio_path(state, &job.id, &filename, index))
        .collect()
}

fn legacy_job_audio_path(state: &RemoteServerState, job_id: &str, filename: &str) -> PathBuf {
    let extension = file_extension(filename);
    state
        .history
        .recordings_dir()
        .join(format!("handy-remote-job-{job_id}.{extension}"))
}

fn job_audio_path(
    state: &RemoteServerState,
    job_id: &str,
    filename: &str,
    index: usize,
) -> PathBuf {
    let extension = file_extension(filename);
    state
        .history
        .recordings_dir()
        .join(format!("handy-remote-job-{job_id}-{index}.{extension}"))
}

fn file_extension(filename: &str) -> &str {
    std::path::Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| value.len() <= 8 && value.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("audio")
}

fn spawn_job(
    state: Arc<RemoteServerState>,
    job_id: String,
    raw_paths: Vec<PathBuf>,
    post_process: bool,
) {
    tauri::async_runtime::spawn(async move {
        state.jobs.set_status(&job_id, RemoteJobStatus::Decoding);
        let decode_started = std::time::Instant::now();
        let decode_paths = raw_paths.clone();
        let samples = match tokio::task::spawn_blocking(move || {
            let mut samples = Vec::new();
            for path in decode_paths {
                let bytes = std::fs::read(path)?;
                let decoded = crate::audio_toolkit::decode_audio_to_samples(bytes)
                    .map_err(std::io::Error::other)?;
                samples.extend(decoded);
            }
            Ok::<_, std::io::Error>(samples)
        })
        .await
        {
            Ok(Ok(samples)) if !samples.is_empty() => samples,
            Ok(Ok(_)) => {
                state.jobs.fail(
                    &job_id,
                    "invalid_audio",
                    "uploaded audio produced no samples",
                );
                return;
            }
            Ok(Err(error)) => {
                state.jobs.fail(
                    &job_id,
                    "invalid_audio",
                    format!("could not decode uploaded audio: {error}"),
                );
                return;
            }
            Err(error) => {
                state.jobs.fail(&job_id, "job_failed", error.to_string());
                return;
            }
        };
        info!(
            "Remote job {job_id}: decoded {} samples in {} ms",
            samples.len(),
            decode_started.elapsed().as_millis()
        );

        state
            .jobs
            .set_status(&job_id, RemoteJobStatus::Transcribing);
        let manager = state.transcription.clone();
        let transcription_samples = samples.clone();
        let inference_started = std::time::Instant::now();
        let raw_text =
            match tokio::task::spawn_blocking(move || manager.transcribe(transcription_samples))
                .await
            {
                Ok(Ok(text)) => text,
                Ok(Err(error)) => {
                    error!("Remote job {job_id} transcription failed: {error}");
                    state.jobs.fail(
                        &job_id,
                        "transcription_failed",
                        "desktop transcription failed",
                    );
                    return;
                }
                Err(error) => {
                    state.jobs.fail(&job_id, "job_failed", error.to_string());
                    return;
                }
            };
        info!(
            "Remote job {job_id}: inference completed in {} ms",
            inference_started.elapsed().as_millis()
        );

        let settings = get_settings(&state.app);
        let should_post = post_process && settings.post_process_enabled;
        if should_post {
            state
                .jobs
                .set_status(&job_id, RemoteJobStatus::PostProcessing);
        }
        let processed = process_transcription_output(&state.app, &raw_text, should_post).await;
        let file_name = format!(
            "handy-remote-{}-{}.wav",
            chrono::Utc::now().timestamp(),
            crate::remote::auth::uuid_simple()
        );
        let wav_path = state.history.recordings_dir().join(&file_name);
        if let Err(error) = crate::audio_toolkit::save_wav_file(&wav_path, &samples) {
            state.jobs.fail(&job_id, "save_wav", error.to_string());
            return;
        }
        let prompt_name = selected_prompt_name(&settings);
        let entry = match state.history.save_entry(
            file_name,
            processed.final_text.clone(),
            should_post,
            processed.post_processed_text.clone(),
            processed.post_process_prompt.clone(),
        ) {
            Ok(entry) => entry,
            Err(error) => {
                state.jobs.fail(&job_id, "history", error.to_string());
                return;
            }
        };
        let response = TranscriptionResponse {
            id: entry.id.to_string(),
            raw_text,
            final_text: processed.final_text,
            post_processed: should_post && processed.post_processed_text.is_some(),
            prompt_name,
            model: Some(settings.selected_model.clone()),
            duration_ms: ((samples.len() as u64) * 1000) / 16_000,
        };
        TRANSCRIPTION_CACHE.insert(response.id.clone(), response.clone());
        state.jobs.complete(&job_id, response);
        for raw_path in raw_paths {
            let _ = std::fs::remove_file(raw_path);
        }
    });
}

/// Resolve the friendly name of the currently-selected post-processing prompt.
fn selected_prompt_name(settings: &crate::settings::AppSettings) -> Option<String> {
    settings
        .post_process_selected_prompt_id
        .as_ref()
        .and_then(|id| {
            settings
                .post_process_prompts
                .iter()
                .find(|p| &p.id == id)
                .map(|p| p.name.clone())
        })
}

/// Load the history entry for a numeric id, mapping errors to HTTP responses.
async fn load_entry(
    state: &RemoteServerState,
    id: &str,
) -> Result<crate::managers::history::HistoryEntry, (StatusCode, Json<crate::remote::dto::ApiError>)>
{
    let entry_id: i64 = id
        .parse()
        .map_err(|_| json_error(StatusCode::BAD_REQUEST, "invalid_id", "id must be numeric"))?;
    state
        .history
        .get_entry_by_id(entry_id)
        .await
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?
        .ok_or_else(|| {
            json_error(
                StatusCode::NOT_FOUND,
                "not_found",
                "transcription not found",
            )
        })
}

/// Stream the stored WAV audio for a transcription so the mobile client can play
/// it back — including streaming recordings, whose full audio only exists here.
pub async fn get_transcription_audio(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let entry = load_entry(&state, &id).await?;

    if entry.file_name.is_empty() {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "no_audio",
            "no audio stored for this entry",
        ));
    }

    let path = state.history.recordings_dir().join(&entry.file_name);
    let bytes = std::fs::read(&path).map_err(|e| {
        json_error(
            StatusCode::NOT_FOUND,
            "no_audio",
            format!("audio unavailable: {}", e),
        )
    })?;

    Ok((
        [
            (header::CONTENT_TYPE, "audio/wav"),
            (header::CACHE_CONTROL, "private, no-store"),
        ],
        bytes,
    )
        .into_response())
}

/// Re-run speech-to-text on the audio the PC already stored for this entry.
pub async fn retranscribe(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<TranscriptionResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let entry = load_entry(&state, &id).await?;

    let path = state.history.recordings_dir().join(&entry.file_name);
    let samples = crate::audio_toolkit::read_wav_samples(&path).map_err(|e| {
        json_error(
            StatusCode::NOT_FOUND,
            "no_audio",
            format!("audio unavailable: {}", e),
        )
    })?;

    let raw_text = state.transcription.transcribe(samples).map_err(|e| {
        error!("Remote re-transcription failed: {}", e);
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "transcription_failed",
            e.to_string(),
        )
    })?;

    let settings = get_settings(&state.app);
    let should_post = entry.post_process_requested && settings.post_process_enabled;
    let processed = process_transcription_output(&state.app, &raw_text, should_post).await;

    let updated = state
        .history
        .update_transcription(
            entry.id,
            processed.final_text.clone(),
            processed.post_processed_text.clone(),
            processed.post_process_prompt.clone(),
        )
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?;

    let response = TranscriptionResponse {
        id: updated.id.to_string(),
        raw_text: raw_text.clone(),
        final_text: processed.final_text,
        post_processed: should_post && processed.post_processed_text.is_some(),
        prompt_name: selected_prompt_name(&settings),
        model: Some(settings.selected_model.clone()),
        duration_ms: wav_duration_ms(&path).unwrap_or(0),
    };

    TRANSCRIPTION_CACHE.insert(response.id.clone(), response.clone());

    Ok(Json(response))
}

/// Re-run AI post-processing on the text the PC already stored for this entry.
pub async fn reprocess(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<TranscriptionResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let entry = load_entry(&state, &id).await?;

    let settings = get_settings(&state.app);
    if !settings.post_process_enabled {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "post_processing_disabled",
            "post-processing is disabled on the PC",
        ));
    }

    // Post-process the plain transcription text stored for this entry.
    let source = entry.transcription_text.clone();
    let processed = process_transcription_output(&state.app, &source, true).await;

    let updated = state
        .history
        .update_transcription(
            entry.id,
            source.clone(),
            processed.post_processed_text.clone(),
            processed.post_process_prompt.clone(),
        )
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?;

    let response = TranscriptionResponse {
        id: updated.id.to_string(),
        raw_text: source.clone(),
        final_text: processed.post_processed_text.clone().unwrap_or(source),
        post_processed: processed.post_processed_text.is_some(),
        prompt_name: selected_prompt_name(&settings),
        model: Some(settings.selected_model.clone()),
        duration_ms: wav_duration_ms(state.history.recordings_dir().join(&updated.file_name))
            .unwrap_or(0),
    };

    TRANSCRIPTION_CACHE.insert(response.id.clone(), response.clone());

    Ok(Json(response))
}

pub async fn get_transcription(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<TranscriptionResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    if let Some(cached) = TRANSCRIPTION_CACHE.get(&id) {
        return Ok(Json(cached));
    }

    let entry_id: i64 = id
        .parse()
        .map_err(|_| json_error(StatusCode::BAD_REQUEST, "invalid_id", "id must be numeric"))?;

    let entry = state
        .history
        .get_entry_by_id(entry_id)
        .await
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?
        .ok_or_else(|| {
            json_error(
                StatusCode::NOT_FOUND,
                "not_found",
                "transcription not found",
            )
        })?;

    Ok(Json(TranscriptionResponse {
        id: entry.id.to_string(),
        raw_text: entry.transcription_text.clone(),
        final_text: entry
            .post_processed_text
            .clone()
            .unwrap_or_else(|| entry.transcription_text.clone()),
        post_processed: entry.post_processed_text.is_some(),
        prompt_name: entry.post_process_prompt,
        model: None,
        duration_ms: wav_duration_ms(state.history.recordings_dir().join(&entry.file_name))
            .unwrap_or(0),
    }))
}
