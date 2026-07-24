use crate::remote::dto::{
    ClientSettingsResponse, PostProcessingInfo, PostProcessingPromptDto, SelectPromptRequest,
};
use crate::remote::routes::health::json_error;
use crate::remote::state::RemoteServerState;
use crate::settings::{get_settings, write_settings};
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use std::sync::Arc;

use crate::remote::routes::require_auth;
/// Safe post-processing metadata — never includes API keys.
pub async fn get_info(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
) -> Result<Json<PostProcessingInfo>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let settings = get_settings(&state.app);

    let provider = settings.active_post_process_provider();
    let api_key_configured = provider
        .map(|p| {
            settings
                .post_process_api_keys
                .get(&p.id)
                .map(|k| !k.trim().is_empty())
                .unwrap_or(false)
                || p.id == crate::settings::APPLE_INTELLIGENCE_PROVIDER_ID
        })
        .unwrap_or(false);

    let model = provider.and_then(|p| settings.post_process_models.get(&p.id).cloned());

    let selected_prompt = settings
        .post_process_selected_prompt_id
        .as_ref()
        .and_then(|id| {
            settings
                .post_process_prompts
                .iter()
                .find(|p| &p.id == id)
                .map(|p| PostProcessingPromptDto {
                    id: p.id.clone(),
                    name: p.name.clone(),
                })
        });

    let prompts = settings
        .post_process_prompts
        .iter()
        .map(|p| PostProcessingPromptDto {
            id: p.id.clone(),
            name: p.name.clone(),
        })
        .collect();

    Ok(Json(PostProcessingInfo {
        available: settings.post_process_enabled,
        configured: provider.is_some() && model.as_ref().map(|m| !m.is_empty()).unwrap_or(false),
        api_key_configured,
        provider_id: provider.map(|p| p.id.clone()),
        provider_label: provider.map(|p| p.label.clone()),
        model,
        selected_prompt,
        prompts,
    }))
}

/// Persist the selected post-processing prompt so the phone can choose which
/// cleanup style the PC should apply.
pub async fn select_prompt(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Json(body): Json<SelectPromptRequest>,
) -> Result<Json<PostProcessingInfo>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;

    let prompt_id = body.prompt_id.trim().to_string();
    if prompt_id.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "invalid_prompt",
            "promptId is required",
        ));
    }

    let mut settings = get_settings(&state.app);
    let exists = settings
        .post_process_prompts
        .iter()
        .any(|prompt| prompt.id == prompt_id);
    if !exists {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "unknown_prompt",
            "prompt not found",
        ));
    }

    settings.post_process_selected_prompt_id = Some(prompt_id);
    write_settings(&state.app, settings);

    get_info(State(state), headers).await
}

/// Expose non-sensitive desktop settings the phone needs for feedback parity
/// (sound theme / audio feedback).
pub async fn client_settings(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
) -> Result<Json<ClientSettingsResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let settings = get_settings(&state.app);

    Ok(Json(ClientSettingsResponse {
        sound_theme: settings.sound_theme.as_str().to_string(),
        audio_feedback: settings.audio_feedback,
    }))
}
