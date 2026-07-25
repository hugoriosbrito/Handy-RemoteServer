use crate::remote::dto::{ApiError, HealthResponse, ServerCapabilities, ServerInfoResponse};
use crate::remote::state::RemoteServerState;
use crate::settings::get_settings;
use axum::extract::State;
use axum::Json;
use std::sync::Arc;

pub async fn health(State(state): State<Arc<RemoteServerState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: state.uptime_seconds(),
    })
}

pub async fn server_info(State(state): State<Arc<RemoteServerState>>) -> Json<ServerInfoResponse> {
    let settings = get_settings(&state.app);
    let port = *state.bind_port.lock().await;
    Json(ServerInfoResponse {
        name: state.server_name.clone(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        fingerprint: state.fingerprint.clone(),
        platform: std::env::consts::OS.to_string(),
        port,
        capabilities: ServerCapabilities {
            transcription: true,
            post_processing: settings.post_process_enabled,
            history: true,
            streaming: true,
        },
    })
}

pub fn json_error(
    status: axum::http::StatusCode,
    error: &str,
    message: impl Into<String>,
) -> (axum::http::StatusCode, Json<ApiError>) {
    (
        status,
        Json(ApiError {
            error: error.to_string(),
            message: message.into(),
        }),
    )
}
