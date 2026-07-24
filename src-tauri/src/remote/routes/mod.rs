mod auth;
mod devices;
mod health;
mod history;
mod models;
mod pairing;
mod post_processing;
mod transcriptions;

use crate::remote::state::RemoteServerState;
use axum::extract::Request;
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::{delete, get, post};
use axum::Router;
use log::{info, warn};
use std::sync::Arc;
use std::time::Instant;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;

/// Log every remote request with its status. Auth rejections and malformed
/// uploads used to be returned as JSON without leaving any trace in the desktop
/// log, which made "send fails while connected" impossible to diagnose.
async fn log_requests(req: Request, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let started = Instant::now();
    let response = next.run(req).await;
    let status = response.status();
    let elapsed_ms = started.elapsed().as_millis();
    if status.is_client_error() || status.is_server_error() {
        warn!("Remote {method} {path} -> {status} ({elapsed_ms} ms)");
    } else {
        info!("Remote {method} {path} -> {status} ({elapsed_ms} ms)");
    }
    response
}

pub fn router(state: Arc<RemoteServerState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/v1/health", get(health::health))
        .route("/v1/server", get(health::server_info))
        .route("/v1/auth/refresh", post(auth::refresh))
        .route("/v1/auth/session", get(auth::session))
        .route("/v1/pairing/sessions", post(pairing::create_session))
        .route("/v1/pairing/claim", post(pairing::claim))
        .route("/v1/pairing/approve", post(pairing::approve))
        .route("/v1/pairing/sessions/{id}", get(pairing::session_status))
        .route("/v1/devices", get(devices::list_devices))
        .route("/v1/devices/{id}", delete(devices::revoke_device))
        .route(
            "/v1/transcriptions",
            post(transcriptions::create_transcription),
        )
        .route(
            "/v1/transcriptions/{id}",
            get(transcriptions::get_transcription),
        )
        .route(
            "/v1/transcriptions/{id}/audio",
            get(transcriptions::get_transcription_audio),
        )
        .route(
            "/v1/transcriptions/{id}/retranscribe",
            post(transcriptions::retranscribe),
        )
        .route(
            "/v1/transcriptions/{id}/reprocess",
            post(transcriptions::reprocess),
        )
        .route("/v1/models", get(models::list_models))
        .route("/v1/models/select", post(models::select_model))
        .route("/v1/post-processing", get(post_processing::get_info))
        .route(
            "/v1/post-processing/select-prompt",
            post(post_processing::select_prompt),
        )
        .route("/v1/settings", get(post_processing::client_settings))
        .route("/v1/history", get(history::list_history))
        .route(
            "/v1/history/{id}",
            get(history::get_history).delete(history::delete_history),
        )
        .layer(RequestBodyLimitLayer::new(25 * 1024 * 1024))
        .layer(cors)
        .layer(middleware::from_fn(log_requests))
        .with_state(state)
}
