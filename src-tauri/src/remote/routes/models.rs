use crate::remote::dto::{ModelSummary, ModelsInfo, SelectModelRequest};
use crate::remote::routes::health::json_error;
use crate::remote::state::RemoteServerState;
use crate::settings::get_settings;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
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

/// List the desktop's models so the phone can show which are downloaded and pick
/// the active one. Only downloaded models can be selected for transcription.
pub async fn list_models(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
) -> Result<Json<ModelsInfo>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;

    let active = {
        let selected = get_settings(&state.app).selected_model;
        if selected.is_empty() {
            None
        } else {
            Some(selected)
        }
    };

    let mut models: Vec<ModelSummary> = state
        .models
        .get_available_models()
        .into_iter()
        .map(|m| ModelSummary {
            is_active: active.as_deref() == Some(m.id.as_str()),
            id: m.id,
            name: m.name,
            description: m.description,
            size_mb: m.size_mb,
            is_downloaded: m.is_downloaded,
            supports_translation: m.supports_translation,
            supports_streaming: m.supports_streaming,
            is_recommended: m.is_recommended,
        })
        .collect();

    // Downloaded first, then recommended, then by name — most useful at the top.
    models.sort_by(|a, b| {
        b.is_downloaded
            .cmp(&a.is_downloaded)
            .then(b.is_recommended.cmp(&a.is_recommended))
            .then(a.name.cmp(&b.name))
    });

    Ok(Json(ModelsInfo {
        active_model_id: active,
        models,
    }))
}

/// Switch the desktop's active transcription model from the phone.
pub async fn select_model(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Json(body): Json<SelectModelRequest>,
) -> Result<Json<ModelsInfo>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;

    crate::commands::models::switch_active_model(&state.app, &body.model_id)
        .map_err(|e| json_error(StatusCode::BAD_REQUEST, "select_failed", e))?;

    // Return the refreshed list so the client reflects the new active model.
    list_models(State(state), headers).await
}
