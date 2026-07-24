use crate::audio_toolkit::wav_duration_ms;
use crate::post_processing::process_transcription_output;
use crate::remote::dto::TranscriptionResponse;
use crate::remote::routes::health::json_error;
use crate::remote::state::RemoteServerState;
use crate::settings::get_settings;
use axum::extract::{Multipart, Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use log::{error, info};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

static TRANSCRIPTION_CACHE: Lazy<Mutex<HashMap<String, TranscriptionResponse>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

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

pub async fn create_transcription(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<TranscriptionResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let device = require_auth(&state, &headers)?;

    // Live preview chunks and the final recording can arrive as one or many
    // multipart audio parts. Preview uploads must never write history.
    let mut audio_parts: Vec<Vec<u8>> = Vec::new();
    let mut filename = "upload.wav".to_string();
    let mut post_process = false;
    let mut preview = false;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| json_error(StatusCode::BAD_REQUEST, "multipart", e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" | "audio" => {
                if let Some(fname) = field.file_name().map(|s| s.to_string()) {
                    filename = fname;
                }
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| json_error(StatusCode::BAD_REQUEST, "read_file", e.to_string()))?
                    .to_vec();
                if !bytes.is_empty() {
                    audio_parts.push(bytes);
                }
            }
            "postProcess" | "post_process" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| json_error(StatusCode::BAD_REQUEST, "field", e.to_string()))?;
                post_process = matches!(text.as_str(), "1" | "true" | "True" | "yes");
            }
            "preview" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| json_error(StatusCode::BAD_REQUEST, "field", e.to_string()))?;
                preview = matches!(text.as_str(), "1" | "true" | "True" | "yes");
            }
            _ => {}
        }
    }

    let _ = &filename;
    if audio_parts.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "missing_file",
            "audio file is required",
        ));
    }

    let total_bytes: usize = audio_parts.iter().map(|p| p.len()).sum();
    if total_bytes > 25 * 1024 * 1024 {
        return Err(json_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "too_large",
            "upload exceeds 25MB limit",
        ));
    }

    // Decode each uploaded fragment and stitch them into one PCM stream. Live
    // preview rotates m4a chunks; the final upload reuses those same files so
    // history/reprocess get the full session rather than the last 4s fragment.
    let mut samples: Vec<f32> = Vec::new();
    for (idx, bytes) in audio_parts.into_iter().enumerate() {
        let part = crate::audio_toolkit::decode_audio_to_samples(bytes).map_err(|e| {
            json_error(
                StatusCode::BAD_REQUEST,
                "invalid_audio",
                format!("could not decode uploaded audio part {}: {}", idx + 1, e),
            )
        })?;
        samples.extend(part);
    }

    if samples.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "invalid_audio",
            "uploaded audio produced no samples",
        ));
    }

    info!(
        "Remote transcription from device {} ({} samples, preview={})",
        device.id,
        samples.len(),
        preview
    );

    let raw_text = state
        .transcription
        .transcribe(samples.clone())
        .map_err(|e| {
            error!("Remote transcription failed: {}", e);
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "transcription_failed",
                e.to_string(),
            )
        })?;

    let settings = get_settings(&state.app);

    // Preview chunks are for live UI only. Never persist WAV/history for them.
    if preview {
        return Ok(Json(TranscriptionResponse {
            id: "preview".to_string(),
            raw_text: raw_text.clone(),
            final_text: raw_text,
            post_processed: false,
            prompt_name: None,
            model: Some(settings.selected_model.clone()),
        duration_ms: ((samples.len() as u64) * 1000) / 16_000,
        }));
    }

    // Persist a 16 kHz WAV into the recordings dir for history retention.
    let file_name = format!(
        "handy-remote-{}-{}.wav",
        chrono::Utc::now().timestamp(),
        crate::remote::auth::uuid_simple()
    );
    let wav_path = state.history.recordings_dir().join(&file_name);
    crate::audio_toolkit::save_wav_file(&wav_path, &samples)
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "save_wav", e.to_string()))?;

    let should_post = post_process && settings.post_process_enabled;
    let processed = process_transcription_output(&state.app, &raw_text, should_post).await;

    let prompt_name = settings
        .post_process_selected_prompt_id
        .as_ref()
        .and_then(|id| {
            settings
                .post_process_prompts
                .iter()
                .find(|p| &p.id == id)
                .map(|p| p.name.clone())
        });

    let entry = state
        .history
        .save_entry(
            file_name,
            processed.final_text.clone(),
            should_post,
            processed.post_processed_text.clone(),
            processed.post_process_prompt.clone(),
        )
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?;

    let response = TranscriptionResponse {
        id: entry.id.to_string(),
        raw_text: raw_text.clone(),
        final_text: processed.final_text,
        post_processed: should_post && processed.post_processed_text.is_some(),
        prompt_name,
        model: Some(settings.selected_model.clone()),
        duration_ms: ((samples.len() as u64) * 1000) / 16_000,
    };

    TRANSCRIPTION_CACHE
        .lock()
        .unwrap()
        .insert(response.id.clone(), response.clone());

    Ok(Json(response))
}

/// Resolve the friendly name of the currently-selected post-processing prompt.
fn selected_prompt_name(settings: &crate::settings::AppSettings) -> Option<String> {
    settings
        .post_process_selected_prompt_id
        .as_ref()
        .and_then(|id| {
            settings
                .post_process_prompts
                .iter()
                .find(|p| &p.id == id)
                .map(|p| p.name.clone())
        })
}

/// Load the history entry for a numeric id, mapping errors to HTTP responses.
async fn load_entry(
    state: &RemoteServerState,
    id: &str,
) -> Result<crate::managers::history::HistoryEntry, (StatusCode, Json<crate::remote::dto::ApiError>)>
{
    let entry_id: i64 = id
        .parse()
        .map_err(|_| json_error(StatusCode::BAD_REQUEST, "invalid_id", "id must be numeric"))?;
    state
        .history
        .get_entry_by_id(entry_id)
        .await
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?
        .ok_or_else(|| {
            json_error(
                StatusCode::NOT_FOUND,
                "not_found",
                "transcription not found",
            )
        })
}

/// Stream the stored WAV audio for a transcription so the mobile client can play
/// it back — including streaming recordings, whose full audio only exists here.
pub async fn get_transcription_audio(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let entry = load_entry(&state, &id).await?;

    if entry.file_name.is_empty() {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "no_audio",
            "no audio stored for this entry",
        ));
    }

    let path = state.history.recordings_dir().join(&entry.file_name);
    let bytes = std::fs::read(&path).map_err(|e| {
        json_error(
            StatusCode::NOT_FOUND,
            "no_audio",
            format!("audio unavailable: {}", e),
        )
    })?;

    Ok((
        [
            (header::CONTENT_TYPE, "audio/wav"),
            (header::CACHE_CONTROL, "private, no-store"),
        ],
        bytes,
    )
        .into_response())
}

/// Re-run speech-to-text on the audio the PC already stored for this entry.
pub async fn retranscribe(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<TranscriptionResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let entry = load_entry(&state, &id).await?;

    let path = state.history.recordings_dir().join(&entry.file_name);
    let samples = crate::audio_toolkit::read_wav_samples(&path).map_err(|e| {
        json_error(
            StatusCode::NOT_FOUND,
            "no_audio",
            format!("audio unavailable: {}", e),
        )
    })?;

    let raw_text = state.transcription.transcribe(samples).map_err(|e| {
        error!("Remote re-transcription failed: {}", e);
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "transcription_failed",
            e.to_string(),
        )
    })?;

    let settings = get_settings(&state.app);
    let should_post = entry.post_process_requested && settings.post_process_enabled;
    let processed = process_transcription_output(&state.app, &raw_text, should_post).await;

    let updated = state
        .history
        .update_transcription(
            entry.id,
            processed.final_text.clone(),
            processed.post_processed_text.clone(),
            processed.post_process_prompt.clone(),
        )
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?;

    let response = TranscriptionResponse {
        id: updated.id.to_string(),
        raw_text: raw_text.clone(),
        final_text: processed.final_text,
        post_processed: should_post && processed.post_processed_text.is_some(),
        prompt_name: selected_prompt_name(&settings),
        model: Some(settings.selected_model.clone()),
        duration_ms: ((samples.len() as u64) * 1000) / 16_000,
    };

    TRANSCRIPTION_CACHE
        .lock()
        .unwrap()
        .insert(response.id.clone(), response.clone());

    Ok(Json(response))
}

/// Re-run AI post-processing on the text the PC already stored for this entry.
pub async fn reprocess(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<TranscriptionResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    let entry = load_entry(&state, &id).await?;

    let settings = get_settings(&state.app);
    if !settings.post_process_enabled {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "post_processing_disabled",
            "post-processing is disabled on the PC",
        ));
    }

    // Post-process the plain transcription text stored for this entry.
    let source = entry.transcription_text.clone();
    let processed = process_transcription_output(&state.app, &source, true).await;

    let updated = state
        .history
        .update_transcription(
            entry.id,
            source.clone(),
            processed.post_processed_text.clone(),
            processed.post_process_prompt.clone(),
        )
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?;

    let response = TranscriptionResponse {
        id: updated.id.to_string(),
        raw_text: source.clone(),
        final_text: processed.post_processed_text.clone().unwrap_or(source),
        post_processed: processed.post_processed_text.is_some(),
        prompt_name: selected_prompt_name(&settings),
        model: Some(settings.selected_model.clone()),
        duration_ms: wav_duration_ms(
            &state.history.recordings_dir().join(&updated.file_name),
        )
        .unwrap_or(0),
    };

    TRANSCRIPTION_CACHE
        .lock()
        .unwrap()
        .insert(response.id.clone(), response.clone());

    Ok(Json(response))
}

pub async fn get_transcription(
    State(state): State<Arc<RemoteServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<TranscriptionResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let _ = require_auth(&state, &headers)?;
    if let Some(cached) = TRANSCRIPTION_CACHE.lock().unwrap().get(&id).cloned() {
        return Ok(Json(cached));
    }

    let entry_id: i64 = id
        .parse()
        .map_err(|_| json_error(StatusCode::BAD_REQUEST, "invalid_id", "id must be numeric"))?;

    let entry = state
        .history
        .get_entry_by_id(entry_id)
        .await
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "history", e.to_string()))?
        .ok_or_else(|| {
            json_error(
                StatusCode::NOT_FOUND,
                "not_found",
                "transcription not found",
            )
        })?;

    Ok(Json(TranscriptionResponse {
        id: entry.id.to_string(),
        raw_text: entry.transcription_text.clone(),
        final_text: entry
            .post_processed_text
            .clone()
            .unwrap_or_else(|| entry.transcription_text.clone()),
        post_processed: entry.post_processed_text.is_some(),
        prompt_name: entry.post_process_prompt,
        model: None,
        duration_ms: wav_duration_ms(
            &state.history.recordings_dir().join(&entry.file_name),
        )
        .unwrap_or(0),
    }))
}
