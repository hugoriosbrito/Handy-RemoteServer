use crate::remote::routes;
use crate::remote::state::RemoteServerState;
use crate::settings::get_settings;
use log::{error, info};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;

#[derive(Clone)]
pub struct RemoteServer {
    state: Arc<RemoteServerState>,
    shutdown_tx: Arc<std::sync::Mutex<Option<oneshot::Sender<()>>>>,
}

impl RemoteServer {
    pub fn new(state: RemoteServerState) -> Self {
        Self {
            state: Arc::new(state),
            shutdown_tx: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    pub fn state(&self) -> Arc<RemoteServerState> {
        self.state.clone()
    }

    pub async fn start(&self) -> Result<(), String> {
        if self.state.is_running() {
            return Ok(());
        }

        let settings = get_settings(&self.state.app);
        let port = settings.remote_server_port;
        *self.state.bind_port.lock().await = port;

        let app = routes::router(self.state.clone());
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .map_err(|e| format!("failed to bind remote server on {}: {}", addr, e))?;

        let (tx, rx) = oneshot::channel::<()>();
        *self.shutdown_tx.lock().unwrap() = Some(tx);
        self.state.set_running(true);

        let state = self.state.clone();
        tauri::async_runtime::spawn(async move {
            info!("Handy Remote server listening on http://{}", addr);
            let server = axum::serve(listener, app).with_graceful_shutdown(async {
                let _ = rx.await;
            });
            if let Err(err) = server.await {
                error!("Handy Remote server error: {}", err);
            }
            state.set_running(false);
            info!("Handy Remote server stopped");
        });

        Ok(())
    }

    pub fn stop(&self) {
        if let Some(tx) = self.shutdown_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
        self.state.set_running(false);
    }
}

/// Initialize remote server state after core managers are ready.
pub fn init_remote_server(app: &AppHandle) -> Result<RemoteServer, String> {
    use crate::managers::history::HistoryManager;
    use crate::managers::model::ModelManager;
    use crate::managers::transcription::TranscriptionManager;

    let settings = get_settings(app);
    let transcription = app
        .try_state::<Arc<TranscriptionManager>>()
        .ok_or_else(|| "TranscriptionManager missing".to_string())?
        .inner()
        .clone();
    let models = app
        .try_state::<Arc<ModelManager>>()
        .ok_or_else(|| "ModelManager missing".to_string())?
        .inner()
        .clone();
    let history = app
        .try_state::<Arc<HistoryManager>>()
        .ok_or_else(|| "HistoryManager missing".to_string())?
        .inner()
        .clone();

    let state = RemoteServerState::new(
        app.clone(),
        transcription,
        models,
        history,
        settings.remote_server_port,
    );
    Ok(RemoteServer::new(state))
}

pub fn maybe_start_remote_server(app: &AppHandle) {
    let settings = get_settings(app);
    if !settings.remote_server_enabled {
        return;
    }
    if let Some(server) = app.try_state::<RemoteServer>() {
        let server = server.inner().clone();
        tauri::async_runtime::spawn(async move {
            if let Err(err) = server.start().await {
                error!("Failed to start Handy Remote server: {}", err);
            }
        });
    }
}
