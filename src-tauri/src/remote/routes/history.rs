use crate::audio_toolkit::wav_duration_ms;
use crate::remote::dto::HistoryEntryDto;
use crate::remote::routes::health::json_error;
use crate::remote::state::RemoteServerState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde_json::{json, Value};
use std::sync::Arc;

fn require_auth(
    state: &RemoteServerState,
    headers: &HeaderMap,
) -> Result<crate::remote::auth::AuthorizedDevice, (StatusCode, Json<crate::remote::dto::ApiError>)>
{
    let bearer = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    state
        .auth
        .authorize(bearer)
        .map_err(|e| json_error(StatusCode::UNAUTHORIZED, "unauthorized", e))
}

fn entry_to_dto(
    state: &RemoteServerState,
    e: crate::managers::history::HistoryEntry,
) -> HistoryEntryDto {
    let duration_ms = if e.file_name.is_empty() {
        0
    } else {
        let path = state.history.recordings_dir().join(&e.file_name);
        wav_duration_ms(&path).unwrap_or(0)
    };

    HistoryEntryDto {
        id: e.id.to_string(),
        source: if e.file_name.contains("handy-remote") {
            "mobile".to_string()
        } else {
            "desktop".to_string()
        },
        raw_text: e.transcription_text.clone(),
        final_text: e
            .post_processed_text
            .clone()
            .unwrap_or_else(|| e.transcription_text.clone()),
        post_processed: e.post_processed_text.is_some(),
        prompt_name: e.post_process_prompt,
        audio_available: !e.file_name.is_empty(),
        timestamp: e.timestamp,
        duration_ms,
    }
}

pub async fn list_history(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<HistoryEntryDto>>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let page = state
        .history
        .get_history_entries(None, Some(50))
        .await
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?;

    Ok(Json(
        page.entries
            .into_iter()
            .map(|e| entry_to_dto(&state, e))
            .collect(),
    ))
}

pub async fn get_history(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<HistoryEntryDto>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let entry_id: i64 = id
        .parse()
        .map_err(|_| json_error(StatusCode::BAD_REQUEST, "invalid_id", "id must be numeric"))?;
    let e = state
        .history
        .get_entry_by_id(entry_id)
        .await
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "not_found", "entry not found"))?;

    Ok(Json(entry_to_dto(&state, e)))
}

pub async fn delete_history(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let entry_id: i64 = id
        .parse()
        .map_err(|_| json_error(StatusCode::BAD_REQUEST, "invalid_id", "id must be numeric"))?;
    state
        .history
        .delete_entry(entry_id)
        .await
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?;
    Ok(Json(json!({ "deleted": true, "id": id })))
}
