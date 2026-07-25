use crate::managers::history::HistoryManager;
use crate::managers::model::ModelManager;
use crate::managers::transcription::TranscriptionManager;
use crate::remote::auth::{random_token, AuthStore};
use crate::remote::pairing::PairingStore;
use crate::remote::rate_limit::RateLimiter;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;
use tokio::sync::Mutex as AsyncMutex;

#[derive(Clone)]
pub struct RemoteServerState {
    pub app: AppHandle,
    pub transcription: Arc<TranscriptionManager>,
    pub models: Arc<ModelManager>,
    pub history: Arc<HistoryManager>,
    pub auth: Arc<AuthStore>,
    pub pairing: Arc<PairingStore>,
    /// Guards the unauthenticated pairing/refresh routes against brute force.
    pub pairing_limiter: Arc<RateLimiter>,
    /// Separate, roomier budget for the status endpoint the phone polls.
    pub pairing_poll_limiter: Arc<RateLimiter>,
    pub fingerprint: String,
    pub server_name: String,
    pub started_at: Instant,
    pub running: Arc<AtomicBool>,
    pub bind_port: Arc<AsyncMutex<u16>>,
}

impl RemoteServerState {
    pub fn new(
        app: AppHandle,
        transcription: Arc<TranscriptionManager>,
        models: Arc<ModelManager>,
        history: Arc<HistoryManager>,
        port: u16,
    ) -> Self {
        let fingerprint =
            crate::remote::auth::load_or_create_fingerprint(&app, generate_fingerprint);
        let server_name = hostname_label();
        Self {
            auth: Arc::new(AuthStore::with_app(app.clone())),
            app,
            transcription,
            models,
            history,
            pairing: Arc::new(PairingStore::new()),
            pairing_limiter: Arc::new(RateLimiter::new()),
            pairing_poll_limiter: Arc::new(RateLimiter::for_polling()),
            fingerprint,
            server_name,
            started_at: Instant::now(),
            running: Arc::new(AtomicBool::new(false)),
            bind_port: Arc::new(AsyncMutex::new(port)),
        }
    }

    pub fn uptime_seconds(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn set_running(&self, value: bool) {
        self.running.store(value, Ordering::SeqCst);
    }
}

fn generate_fingerprint() -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"handy-remote-v1");
    hasher.update(random_token().as_bytes());
    hasher.update(hostname_label().as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}

fn hostname_label() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .ok()
        .filter(|s| !s.is_empty())
        .map(|s| format!("PC {}", s))
        .unwrap_or_else(|| "Handy Desktop".to_string())
}
