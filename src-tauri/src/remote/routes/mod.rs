mod devices;
mod health;
mod history;
mod models;
mod pairing;
mod post_processing;
mod transcriptions;

use crate::remote::state::RemoteServerState;
use axum::routing::{delete, get, post};
use axum::Router;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;

pub fn router(state: Arc<RemoteServerState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/v1/health", get(health::health))
        .route("/v1/server", get(health::server_info))
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
        .route("/v1/history", get(history::list_history))
        .route(
            "/v1/history/{id}",
            get(history::get_history).delete(history::delete_history),
        )
        .layer(RequestBodyLimitLayer::new(25 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}
