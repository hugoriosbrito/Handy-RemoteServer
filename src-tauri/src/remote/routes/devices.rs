use crate::remote::auth::now_secs;
use crate::remote::dto::DeviceInfo;
use crate::remote::routes::health::json_error;
use crate::remote::state::RemoteServerState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::remote::routes::require_auth;
pub async fn list_devices(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<DeviceInfo>>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let devices = state
        .auth
        .list_devices()
        .into_iter()
        .map(|d| DeviceInfo {
            id: d.id,
            name: d.name,
            platform: d.platform,
            created_at: d.created_at.to_string(),
            last_seen_at: d.last_seen_at.map(|t| t.to_string()),
        })
        .collect();
    Ok(Json(devices))
}

pub async fn revoke_device(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    if state.auth.revoke(&id) {
        Ok(Json(json!({ "revoked": true, "id": id, "at": now_secs() })))
    } else {
        Err(json_error(
            StatusCode::NOT_FOUND,
            "not_found",
            "device not found",
        ))
    }
}
