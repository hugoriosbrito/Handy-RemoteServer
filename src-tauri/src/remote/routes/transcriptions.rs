use crate::post_processing::process_transcription_output;
use crate::remote::dto::TranscriptionResponse;
use crate::remote::routes::health::json_error;
use crate::remote::state::RemoteServerState;
use crate::settings::get_settings;
use axum::extract::{Multipart, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use log::{error, info};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
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

    let mut audio_bytes: Option<Vec<u8>> = None;
    let mut filename = "upload.wav".to_string();
    let mut post_process = false;

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
                audio_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| {
                            json_error(StatusCode::BAD_REQUEST, "read_file", e.to_string())
                        })?
                        .to_vec(),
                );
            }
            "postProcess" | "post_process" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| json_error(StatusCode::BAD_REQUEST, "field", e.to_string()))?;
                post_process = matches!(text.as_str(), "1" | "true" | "True" | "yes");
            }
            _ => {}
        }
    }

    let bytes = audio_bytes.ok_or_else(|| {
        json_error(
            StatusCode::BAD_REQUEST,
            "missing_file",
            "audio file is required",
        )
    })?;

    if bytes.len() > 25 * 1024 * 1024 {
        return Err(json_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "too_large",
            "upload exceeds 25MB limit",
        ));
    }

    // Persist into the history recordings directory as a WAV the pipeline understands.
    let file_name = format!(
        "handy-remote-{}-{}.wav",
        chrono::Utc::now().timestamp(),
        crate::remote::auth::uuid_simple()
    );
    let wav_path = state.history.recordings_dir().join(&file_name);

    // If client uploaded non-wav, still write bytes first then attempt decode.
    // MVP accepts WAV 16-bit; write through temp then copy if needed.
    let temp_path = write_temp_audio(&bytes, &filename)
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "temp_file", e))?;

    let samples = crate::audio_toolkit::read_wav_samples(&temp_path).map_err(|e| {
        let _ = std::fs::remove_file(&temp_path);
        json_error(
            StatusCode::BAD_REQUEST,
            "invalid_audio",
            format!("could not decode audio (WAV 16-bit mono expected): {}", e),
        )
    })?;

    // Copy validated WAV into recordings dir for history retention.
    std::fs::copy(&temp_path, &wav_path).map_err(|e| {
        let _ = std::fs::remove_file(&temp_path);
        json_error(StatusCode::INTERNAL_SERVER_ERROR, "copy", e.to_string())
    })?;
    let _ = std::fs::remove_file(&temp_path);

    info!(
        "Remote transcription from device {} ({} samples)",
        device.id,
        samples.len()
    );

    let raw_text = state.transcription.transcribe(samples).map_err(|e| {
        error!("Remote transcription failed: {}", e);
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "transcription_failed",
            e.to_string(),
        )
    })?;

    let settings = get_settings(&state.app);
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
    };

    TRANSCRIPTION_CACHE
        .lock()
        .unwrap()
        .insert(response.id.clone(), response.clone());

    let _ = wav_path; // retained on disk via history file_name
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
            json_error(StatusCode::NOT_FOUND, "not_found", "transcription not found")
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
    }))
}

fn write_temp_audio(bytes: &[u8], filename: &str) -> Result<PathBuf, String> {
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("wav");
    let path = std::env::temp_dir().join(format!(
        "handy-remote-{}-{}.{}",
        crate::remote::auth::now_secs(),
        crate::remote::auth::uuid_simple(),
        ext
    ));
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    Ok(path)
}
