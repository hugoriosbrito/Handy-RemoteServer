use crate::remote::dto::{ApiError, DeviceCredentials, RefreshRequest};
use crate::remote::routes::health::json_error;
use crate::remote::state::RemoteServerState;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use log::{info, warn};
use serde_json::{json, Value};
use std::sync::Arc;

/// Exchange a refresh token for a rotated credential pair.
///
/// Without this route a phone whose access token was rejected had no way back:
/// every upload failed with 401 while the UI still reported "connected".
pub async fn refresh(
    State(state): State<Arc<RemoteServerState>>,
    Json(body): Json<RefreshRequest>,
) -> Result<Json<DeviceCredentials>, (StatusCode, Json<ApiError>)> {
    match state.auth.refresh(&body.refresh_token, &state.fingerprint) {
        Ok(credentials) => {
            info!(
                "Remote auth: rotated credentials for device {}",
                credentials.device_id
            );
            Ok(Json(credentials))
        }
        Err(e) => {
            warn!("Remote auth: refresh rejected ({e})");
            Err(json_error(StatusCode::UNAUTHORIZED, "unauthorized", e))
        }
    }
}

/// Cheap authenticated probe. `/v1/health` is unauthenticated, so the phone
/// used to report "connected" whenever the PC answered, even with a dead
/// token. This endpoint makes the indicator reflect real usability.
pub async fn session(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<ApiError>)> {
    let bearer = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    let device = state
        .auth
        .authorize(bearer)
        .map_err(|e| json_error(StatusCode::UNAUTHORIZED, "unauthorized", e))?;
    Ok(Json(json!({
        "deviceId": device.id,
        "deviceName": device.name,
        "serverName": state.server_name,
        "fingerprint": state.fingerprint,
    })))
}
