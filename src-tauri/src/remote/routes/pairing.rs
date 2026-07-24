use crate::remote::dto::{
    DeviceCredentials, PairingApproveRequest, PairingClaimRequest, PairingClaimResponse,
    PairingSessionResponse, QrEndpoints,
};
use crate::remote::pairing::PairingStatus;
use crate::remote::routes::health::json_error;
use crate::remote::state::RemoteServerState;
use crate::settings::get_settings;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};
use std::sync::Arc;

pub async fn create_session(
    State(state): State<Arc<RemoteServerState>>,
) -> Result<Json<PairingSessionResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let settings = get_settings(&state.app);
    if !settings.remote_server_enabled {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "disabled",
            "Remote server is disabled",
        ));
    }

    let port = *state.bind_port.lock().await;
    let local_ip = local_ip_hint();
    let endpoints = QrEndpoints {
        local: local_ip.map(|ip| format!("{}:{}", ip, port)),
        mdns: Some(format!("handy-remote.local:{}", port)),
        tailscale: None,
    };

    let (session, qr) = state.pairing.create_session(
        &state.server_name,
        &state.fingerprint,
        endpoints,
        5 * 60,
    );

    Ok(Json(PairingSessionResponse {
        session_id: session.session_id,
        code: session.code,
        expires_at: qr.expires_at.clone(),
        qr,
    }))
}

pub async fn claim(
    State(state): State<Arc<RemoteServerState>>,
    Json(body): Json<PairingClaimRequest>,
) -> Result<Json<PairingClaimResponse>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let session = state
        .pairing
        .claim(
            &body.session_id,
            &body.secret,
            body.device_name,
            body.platform,
        )
        .map_err(|e| json_error(StatusCode::BAD_REQUEST, "claim_failed", e))?;

    // Notify desktop UI so the user can approve.
    let _ = state.app.emit(
        "remote-pairing-claimed",
        json!({
            "sessionId": session.session_id,
            "code": session.code,
            "deviceName": session.device_name,
            "platform": session.device_platform,
        }),
    );

    Ok(Json(PairingClaimResponse {
        session_id: session.session_id,
        code: session.code,
        server_name: state.server_name.clone(),
        status: "awaiting_approval".to_string(),
    }))
}

pub async fn approve(
    State(state): State<Arc<RemoteServerState>>,
    Json(body): Json<PairingApproveRequest>,
) -> Result<Json<Value>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let credentials: Option<DeviceCredentials> = if body.approve {
        let session_preview = state
            .pairing
            .get(&body.session_id)
            .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "not_found", "session not found"))?;
        Some(state.auth.issue_device(
            session_preview
                .device_name
                .clone()
                .unwrap_or_else(|| "Mobile".to_string()),
            session_preview.device_platform.clone(),
            &state.fingerprint,
        ))
    } else {
        None
    };

    let session = state
        .pairing
        .approve(&body.session_id, body.approve, credentials.clone())
        .map_err(|e| json_error(StatusCode::BAD_REQUEST, "approve_failed", e))?;

    if !body.approve {
        return Ok(Json(json!({
            "status": "rejected",
            "sessionId": session.session_id,
        })));
    }

    let _ = state.app.emit(
        "remote-pairing-approved",
        json!({
            "sessionId": session.session_id,
            "deviceId": credentials.as_ref().map(|c| c.device_id.clone()),
        }),
    );

    Ok(Json(json!({
        "status": "approved",
        "sessionId": session.session_id,
        "credentials": credentials,
    })))
}

pub async fn session_status(
    State(state): State<Arc<RemoteServerState>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<crate::remote::dto::ApiError>)> {
    let session = state
        .pairing
        .get(&id)
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "not_found", "session not found"))?;

    let status = match session.status {
        PairingStatus::Pending => "pending",
        PairingStatus::Claimed => "awaiting_approval",
        PairingStatus::Approved => "approved",
        PairingStatus::Rejected => "rejected",
        PairingStatus::Expired => "expired",
    };

    Ok(Json(json!({
        "sessionId": session.session_id,
        "status": status,
        "code": session.code,
        "deviceName": session.device_name,
        "credentials": session.credentials,
    })))
}

fn local_ip_hint() -> Option<String> {
    // Best-effort: UDP connect trick (no packets sent) to discover the
    // outbound interface IPv4. Skip loopback so the QR is usable on LAN phones.
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    match socket.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(v4) if !v4.is_loopback() => Some(v4.to_string()),
        _ => None,
    }
}

use tauri::Emitter;
