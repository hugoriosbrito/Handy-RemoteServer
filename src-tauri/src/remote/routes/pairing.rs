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
    let endpoints = build_endpoints(&settings, port);

    let (session, qr) =
        state
            .pairing
            .create_session(&state.server_name, &state.fingerprint, endpoints, 5 * 60);

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

    // When the user turned off "require device approval", claiming a valid
    // session is enough: knowing the session secret already proves the phone
    // scanned the QR code shown on this computer.
    if !get_settings(&state.app).remote_device_approval_required {
        let credentials = state.auth.issue_device(
            session
                .device_name
                .clone()
                .unwrap_or_else(|| "Mobile".to_string()),
            session.device_platform.clone(),
            &state.fingerprint,
        );
        let session = state
            .pairing
            .approve(&session.session_id, true, Some(credentials.clone()))
            .map_err(|e| json_error(StatusCode::BAD_REQUEST, "approve_failed", e))?;

        let _ = state.app.emit(
            "remote-pairing-approved",
            json!({
                "sessionId": session.session_id,
                "deviceId": credentials.device_id,
                "auto": true,
            }),
        );

        return Ok(Json(PairingClaimResponse {
            session_id: session.session_id,
            code: session.code,
            server_name: state.server_name.clone(),
            status: "approved".to_string(),
        }));
    }

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
        Some(
            state.auth.issue_device(
                session_preview
                    .device_name
                    .clone()
                    .unwrap_or_else(|| "Mobile".to_string()),
                session_preview.device_platform.clone(),
                &state.fingerprint,
            ),
        )
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

/// Endpoints advertised in the pairing QR code, honouring the network toggles.
///
/// Advertising a LAN address while local network access is disabled would hand
/// the phone an endpoint the server is not even listening on.
pub(crate) fn build_endpoints(settings: &crate::settings::AppSettings, port: u16) -> QrEndpoints {
    let local_enabled = settings.remote_local_network_enabled;
    QrEndpoints {
        local: if local_enabled {
            local_ip_hint().map(|ip| format!("{}:{}", ip, port))
        } else {
            None
        },
        mdns: if local_enabled {
            Some(format!("handy-remote.local:{}", port))
        } else {
            None
        },
        tailscale: if settings.remote_access_enabled {
            tailscale_ip_hint().map(|ip| format!("{}:{}", ip, port))
        } else {
            None
        },
    }
}

/// Best-effort Tailscale address for this machine.
///
/// Tailscale hands out addresses in the 100.64.0.0/10 CGNAT range, so we can
/// recognise one without shelling out to the Tailscale CLI.
fn tailscale_ip_hint() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    // Any address inside the tailnet range routes over the Tailscale interface
    // when it is up; the connect is local-only and sends no packets.
    socket.connect("100.100.100.100:80").ok()?;
    match socket.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(v4) if is_tailscale_v4(v4) => Some(v4.to_string()),
        _ => None,
    }
}

fn is_tailscale_v4(ip: std::net::Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 100 && (64..128).contains(&b)
}

use tauri::Emitter;

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_with(local: bool, remote: bool) -> crate::settings::AppSettings {
        let mut settings = crate::settings::get_default_settings();
        settings.remote_local_network_enabled = local;
        settings.remote_access_enabled = remote;
        settings
    }

    #[test]
    fn local_endpoints_are_omitted_when_local_network_is_disabled() {
        let endpoints = build_endpoints(&settings_with(false, false), 8765);
        assert!(endpoints.local.is_none());
        assert!(endpoints.mdns.is_none());
    }

    #[test]
    fn mdns_endpoint_is_advertised_when_local_network_is_enabled() {
        let endpoints = build_endpoints(&settings_with(true, false), 8765);
        assert_eq!(
            endpoints.mdns.as_deref(),
            Some("handy-remote.local:8765"),
            "mDNS endpoint should follow the local network toggle"
        );
    }

    #[test]
    fn tailscale_endpoint_requires_remote_access() {
        let endpoints = build_endpoints(&settings_with(true, false), 8765);
        assert!(endpoints.tailscale.is_none());
    }

    #[test]
    fn tailscale_range_detection_matches_cgnat_block() {
        assert!(is_tailscale_v4("100.64.0.1".parse().unwrap()));
        assert!(is_tailscale_v4("100.127.255.254".parse().unwrap()));
        assert!(!is_tailscale_v4("100.128.0.1".parse().unwrap()));
        assert!(!is_tailscale_v4("192.168.0.10".parse().unwrap()));
    }
}
