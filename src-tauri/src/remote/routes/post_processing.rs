use crate::remote::dto::{PostProcessingInfo, PostProcessingPromptDto};
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
