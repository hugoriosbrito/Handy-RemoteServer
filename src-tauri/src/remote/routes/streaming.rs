use crate::post_processing::process_transcription_output;
use crate::remote::dto::TranscriptionResponse;
use crate::remote::routes::health::json_error;
use crate::remote::state::RemoteServerState;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Response;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const MAX_CHUNK_BYTES: usize = 1_024 * 1_024;
const MAX_STREAM_SAMPLES: usize = 16_000 * 60 * 15;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Authenticate {
        token: String,
    },
    Start,
    Audio {
        sequence: u64,
        data: String,
    },
    Finish {
        #[serde(rename = "postProcess")]
        post_process: Option<bool>,
    },
    Cancel,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage<'a> {
    Ready,
    Partial {
        committed: &'a str,
        tentative: &'a str,
    },
    Final {
        transcription: &'a TranscriptionResponse,
    },
    Error {
        code: &'a str,
        message: &'a str,
    },
}

pub async fn upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<RemoteServerState>>,
) -> Response {
    // Base64 expands a bounded binary chunk by roughly one third. Axum's
    // default WebSocket limit is too small for a 4-second M4A segment.
    ws.max_message_size(MAX_CHUNK_BYTES * 2)
        .max_frame_size(MAX_CHUNK_BYTES * 2)
        .on_upgrade(move |socket| handle(socket, state))
}

async fn handle(mut socket: WebSocket, state: Arc<RemoteServerState>) {
    let Some(Ok(Message::Text(raw))) = socket.next().await else {
        return;
    };
    let Ok(ClientMessage::Authenticate { token }) = serde_json::from_str::<ClientMessage>(&raw)
    else {
        let _ = send_error(
            &mut socket,
            "unauthorized",
            "authenticate before starting a stream",
        )
        .await;
        return;
    };
    let bearer = format!("Bearer {token}");
    let Ok(device) = state.auth.authorize(Some(&bearer)) else {
        let _ = send_error(&mut socket, "unauthorized", "invalid device credentials").await;
        return;
    };
    let _ = device;

    let mut updates = state.transcription.subscribe_stream_updates();
    let mut started = false;
    let mut expected_sequence = 0_u64;
    let mut samples: Vec<f32> = Vec::new();
    let mut desktop_check = tokio::time::interval(std::time::Duration::from_millis(200));

    loop {
        tokio::select! {
            incoming = socket.next() => {
                let Some(Ok(message)) = incoming else { break; };
                let Message::Text(raw) = message else { continue; };
                let parsed = match serde_json::from_str::<ClientMessage>(&raw) {
                    Ok(message) => message,
                    Err(_) => {
                        let _ = send_error(&mut socket, "invalid_message", "invalid stream message").await;
                        continue;
                    }
                };
                match parsed {
                    ClientMessage::Authenticate { .. } => {
                        let _ = send_error(&mut socket, "invalid_message", "already authenticated").await;
                    }
                    ClientMessage::Start => {
                        if started {
                            continue;
                        }
                        if !active_model_supports_streaming(&state) {
                            let _ = send_error(&mut socket, "stream_unavailable", "the active desktop model does not support streaming").await;
                            continue;
                        }
                        if !state.transcription.start_remote_stream() {
                            let _ = send_error(&mut socket, "desktop_busy", "the desktop is already transcribing").await;
                            continue;
                        }
                        started = true;
                        if send(&mut socket, ServerMessage::Ready).await.is_err() {
                            break;
                        }
                    }
                    ClientMessage::Audio { sequence, data } => {
                        if !started {
                            let _ = send_error(&mut socket, "stream_not_started", "send start before audio").await;
                            continue;
                        }
                        if !state.transcription.is_remote_streaming() {
                            let _ = send_error(&mut socket, "interrupted", "the desktop took over transcription").await;
                            break;
                        }
                        if sequence != expected_sequence {
                            let _ = send_error(&mut socket, "out_of_order", "audio chunks must be ordered").await;
                            continue;
                        }
                        expected_sequence = expected_sequence.saturating_add(1);
                        let bytes = match base64::engine::general_purpose::STANDARD.decode(data) {
                            Ok(bytes) if bytes.len() <= MAX_CHUNK_BYTES => bytes,
                            Ok(_) => {
                                let _ = send_error(&mut socket, "chunk_too_large", "audio chunk exceeds 1MB").await;
                                continue;
                            }
                            Err(_) => {
                                let _ = send_error(&mut socket, "invalid_audio", "audio chunk is not base64").await;
                                continue;
                            }
                        };
                        let decoded = match tokio::task::spawn_blocking(move || crate::audio_toolkit::decode_audio_to_samples(bytes)).await {
                            Ok(Ok(decoded)) if !decoded.is_empty() => decoded,
                            _ => {
                                let _ = send_error(&mut socket, "invalid_audio", "could not decode audio chunk").await;
                                continue;
                            }
                        };
                        if samples.len().saturating_add(decoded.len()) > MAX_STREAM_SAMPLES {
                            let _ = send_error(&mut socket, "stream_too_long", "stream exceeds 15 minute limit").await;
                            break;
                        }
                        for frame in decoded.chunks(480) {
                            state.transcription.stream_router().feed_remote(frame);
                        }
                        samples.extend(decoded);
                    }
                    ClientMessage::Finish { post_process } => {
                        if !started {
                            let _ = send_error(&mut socket, "stream_not_started", "send start before finish").await;
                            continue;
                        }
                        let manager = state.transcription.clone();
                        let final_text = match tokio::task::spawn_blocking(move || manager.finalize_stream()).await {
                            Ok(Ok(Some(text))) => text,
                            _ => {
                                let _ = send_error(&mut socket, "stream_failed", "the desktop could not finalize the live stream").await;
                                break;
                            }
                        };
                        match save_stream_result(&state, samples, final_text, post_process.unwrap_or(false)).await {
                            Ok(response) => {
                                let _ = send(&mut socket, ServerMessage::Final { transcription: &response }).await;
                            }
                            Err((_, error)) => {
                                let _ = send_error(&mut socket, &error.error, &error.message).await;
                            }
                        }
                        break;
                    }
                    ClientMessage::Cancel => {
                        state.transcription.cancel_stream();
                        break;
                    }
                }
            }
            update = updates.recv(), if started => {
                if let Ok(update) = update {
                    if send(&mut socket, ServerMessage::Partial { committed: &update.committed, tentative: &update.tentative }).await.is_err() {
                        break;
                    }
                }
            }
            _ = desktop_check.tick(), if started && !state.transcription.is_remote_streaming() => {
                let _ = send_error(&mut socket, "interrupted", "the desktop started transcription and took priority").await;
                break;
            }
        }
    }
    if started && state.transcription.is_remote_streaming() {
        state.transcription.cancel_stream();
    }
}

fn active_model_supports_streaming(state: &RemoteServerState) -> bool {
    let active = crate::settings::get_settings(&state.app).selected_model;
    state
        .models
        .get_available_models()
        .into_iter()
        .find(|model| model.id == active)
        .is_some_and(|model| model.supports_streaming)
}

async fn save_stream_result(
    state: &RemoteServerState,
    samples: Vec<f32>,
    raw_text: String,
    post_process: bool,
) -> Result<TranscriptionResponse, (StatusCode, axum::Json<crate::remote::dto::ApiError>)> {
    if samples.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "invalid_audio",
            "stream contained no audio",
        ));
    }
    let settings = crate::settings::get_settings(&state.app);
    let should_post = post_process && settings.post_process_enabled;
    let processed = process_transcription_output(&state.app, &raw_text, should_post).await;
    let file_name = format!(
        "handy-remote-{}-{}.wav",
        chrono::Utc::now().timestamp(),
        crate::remote::auth::uuid_simple()
    );
    crate::audio_toolkit::save_wav_file(state.history.recordings_dir().join(&file_name), &samples)
        .map_err(|error| {
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "save_wav",
                error.to_string(),
            )
        })?;
    let entry = state
        .history
        .save_entry(
            file_name,
            processed.final_text.clone(),
            should_post,
            processed.post_processed_text.clone(),
            processed.post_process_prompt.clone(),
        )
        .map_err(|error| {
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "history",
                error.to_string(),
            )
        })?;
    Ok(TranscriptionResponse {
        id: entry.id.to_string(),
        raw_text,
        final_text: processed.final_text,
        post_processed: should_post && processed.post_processed_text.is_some(),
        prompt_name: None,
        model: Some(settings.selected_model),
        duration_ms: ((samples.len() as u64) * 1000) / 16_000,
    })
}

async fn send(socket: &mut WebSocket, message: ServerMessage<'_>) -> Result<(), ()> {
    let Ok(json) = serde_json::to_string(&message) else {
        return Err(());
    };
    socket
        .send(Message::Text(json.into()))
        .await
        .map_err(|_| ())
}

async fn send_error(socket: &mut WebSocket, code: &str, message: &str) -> Result<(), ()> {
    send(socket, ServerMessage::Error { code, message }).await
}
