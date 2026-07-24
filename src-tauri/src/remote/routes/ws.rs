use crate::managers::transcription::StreamTextEvent;
use crate::remote::state::RemoteServerState;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use log::{error, info, warn};
use serde::Serialize;
use std::sync::Arc;
use tauri_specta::Event;
use tokio::sync::mpsc;

/// Live streaming transcription over a WebSocket.
///
/// This is the *preview* channel only. It never writes history, never saves a
/// WAV, and never mints a transcription id — those remain exclusive to
/// `POST /v1/transcriptions`, which the client calls once with the full
/// recording when it stops. Keeping the two channels separate is what stops the
/// desktop history from filling up with 4s chunks and keeps re-transcribe /
/// re-process / audio playback pointed at the real, complete recording.
///
/// Wire protocol:
///   client -> server:
///     * binary frame: PCM s16le, mono, 16 kHz (20–40 ms per frame)
///     * text `{"type":"finalize"}` — stop, flush, receive the final text
///     * text `{"type":"cancel"}`   — abandon without producing text
///   server -> client:
///     * `{"type":"partial","committed":"…","tentative":"…"}`
///     * `{"type":"final","text":"…"}`
///     * `{"type":"error","code":"…","message":"…"}`
///
/// Auth: RN's WebSocket can't set an Authorization header, so the access token
/// is passed as the second WebSocket subprotocol: `Sec-WebSocket-Protocol:
/// bearer, <token>`. We validate it with the same `auth.authorize()` the HTTP
/// routes use and echo back the `bearer` subprotocol on the accept.
pub async fn transcription_stream(
    State(state): State<Arc<RemoteServerState>>,
    ws: WebSocketUpgrade,
    headers: axum::http::HeaderMap,
) -> Response {
    // Parse the subprotocols: expect ["bearer", "<token>"].
    let protocols: Vec<String> = headers
        .get(axum::http::header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').map(|p| p.trim().to_string()).collect())
        .unwrap_or_default();

    let token = if protocols.len() >= 2 && protocols[0] == "bearer" {
        protocols[1].clone()
    } else {
        return (StatusCode::UNAUTHORIZED, "missing bearer subprotocol").into_response();
    };

    // Validate with the shared auth store (same bearer format as HTTP routes).
    let device = match state.auth.authorize(Some(&format!("Bearer {token}"))) {
        Ok(d) => d,
        Err(e) => return (StatusCode::UNAUTHORIZED, e).into_response(),
    };

    // Only one live stream may run at a time (single engine lease).
    if state.transcription.is_streaming() {
        return (StatusCode::CONFLICT, "a stream is already active").into_response();
    }

    let device_id = device.id.clone();
    // Echo the `bearer` subprotocol back so the handshake completes.
    ws.protocols(["bearer"])
        .on_upgrade(move |socket| handle_socket(socket, state, device_id))
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum ServerMsg {
    Partial { committed: String, tentative: String },
    Final { text: String },
    Error { code: String, message: String },
}

async fn handle_socket(mut socket: WebSocket, state: Arc<RemoteServerState>, device_id: String) {
    info!("WS stream opened for device {device_id}");

    // Bridge Tauri partial events -> this socket via an mpsc channel. The
    // `StreamTextEvent::listen` callback runs on a Tauri thread, so it just
    // forwards snapshots; the async task below writes them to the socket.
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMsg>();
    let listen_handle = {
        let tx = tx.clone();
        StreamTextEvent::listen(&state.app, move |event| {
            let _ = tx.send(ServerMsg::Partial {
                committed: event.payload.committed,
                tentative: event.payload.tentative,
            });
        })
    };

    // Start the streaming worker on the transcription manager.
    state.transcription.start_stream();
    let router = state.transcription.stream_router();

    let mut finalized = false;

    loop {
        tokio::select! {
            // Outbound: partial snapshots produced by the engine.
            Some(msg) = rx.recv() => {
                if send_json(&mut socket, &msg).await.is_err() {
                    break;
                }
            }
            // Inbound: audio frames and control messages from the client.
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Binary(bytes))) => {
                        let frame = pcm_s16le_to_f32(&bytes);
                        if !frame.is_empty() {
                            router.feed(&frame);
                        }
                    }
                    Some(Ok(Message::Text(text))) => {
                        match parse_control(&text) {
                            Some(Control::Finalize) => {
                                finalized = true;
                                let final_text = finalize(&state).await;
                                match final_text {
                                    Ok(text) => {
                                        let _ = send_json(
                                            &mut socket,
                                            &ServerMsg::Final { text: text.unwrap_or_default() },
                                        ).await;
                                    }
                                    Err(e) => {
                                        let _ = send_json(
                                            &mut socket,
                                            &ServerMsg::Error {
                                                code: "finalize_failed".into(),
                                                message: e,
                                            },
                                        ).await;
                                    }
                                }
                                break;
                            }
                            Some(Control::Cancel) => {
                                finalized = true;
                                state.transcription.cancel_stream();
                                break;
                            }
                            None => {
                                warn!("WS stream: unknown control message: {text}");
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => { /* ping/pong/other: ignore */ }
                    Some(Err(e)) => {
                        warn!("WS stream recv error: {e}");
                        break;
                    }
                }
            }
        }
    }

    // If the socket dropped without an explicit finalize/cancel, abandon the
    // stream so the engine lease is released and no worker leaks.
    if !finalized {
        state.transcription.cancel_stream();
    }

    drop(listen_handle); // unlisten from Tauri partial events
    // Best-effort close frame; the socket also closes when dropped.
    let _ = socket.send(Message::Close(None)).await;
    info!("WS stream closed for device {device_id}");
}

/// `finalize_stream` is synchronous and blocks (it waits on the worker), so run
/// it off the async runtime.
async fn finalize(state: &Arc<RemoteServerState>) -> Result<Option<String>, String> {
    let transcription = state.transcription.clone();
    tokio::task::spawn_blocking(move || transcription.finalize_stream())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

enum Control {
    Finalize,
    Cancel,
}

fn parse_control(text: &str) -> Option<Control> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    match v.get("type").and_then(|t| t.as_str())? {
        "finalize" => Some(Control::Finalize),
        "cancel" => Some(Control::Cancel),
        _ => None,
    }
}

/// Convert little-endian 16-bit PCM bytes into normalized f32 samples.
fn pcm_s16le_to_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(2)
        .map(|b| {
            let s = i16::from_le_bytes([b[0], b[1]]);
            s as f32 / 32768.0
        })
        .collect()
}

async fn send_json(socket: &mut WebSocket, msg: &ServerMsg) -> Result<(), ()> {
    let text = match serde_json::to_string(msg) {
        Ok(t) => t,
        Err(e) => {
            error!("WS stream: failed to serialize message: {e}");
            return Err(());
        }
    };
    socket.send(Message::Text(text.into())).await.map_err(|_| ())
}
