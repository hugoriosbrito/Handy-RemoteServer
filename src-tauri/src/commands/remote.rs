use crate::remote::dto::{DeviceInfo, PairingSessionResponse};
use crate::remote::server::RemoteServer;
use crate::settings::{get_settings, write_settings};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Clone, Type)]
pub struct RemoteServerStatus {
    pub enabled: bool,
    pub running: bool,
    pub port: u16,
    pub fingerprint: Option<String>,
    pub server_name: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn get_remote_server_status(app: AppHandle) -> Result<RemoteServerStatus, String> {
    let settings = get_settings(&app);
    let (running, fingerprint, server_name) = if let Some(server) = app.try_state::<RemoteServer>()
    {
        let state = server.state();
        (
            state.is_running(),
            Some(state.fingerprint.clone()),
            Some(state.server_name.clone()),
        )
    } else {
        (false, None, None)
    };

    Ok(RemoteServerStatus {
        enabled: settings.remote_server_enabled,
        running,
        port: settings.remote_server_port,
        fingerprint,
        server_name,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn change_remote_server_enabled_setting(
    app: AppHandle,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.remote_server_enabled = enabled;
    write_settings(&app, settings);

    if let Some(server) = app.try_state::<RemoteServer>() {
        if enabled {
            server.start().await?;
        } else {
            server.stop();
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn change_remote_server_port_setting(app: AppHandle, port: u16) -> Result<(), String> {
    if port < 1024 {
        return Err("Port must be >= 1024".to_string());
    }
    let mut settings = get_settings(&app);
    let was_enabled = settings.remote_server_enabled;
    settings.remote_server_port = port;
    write_settings(&app, settings);

    if let Some(server) = app.try_state::<RemoteServer>() {
        if was_enabled {
            server.stop();
            // brief yield so bind can release
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            server.start().await?;
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn change_remote_local_network_enabled_setting(
    app: AppHandle,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.remote_local_network_enabled = enabled;
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn change_remote_access_enabled_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.remote_access_enabled = enabled;
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn change_remote_device_approval_required_setting(
    app: AppHandle,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.remote_device_approval_required = enabled;
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn create_remote_pairing_session(app: AppHandle) -> Result<PairingSessionResponse, String> {
    let server = app
        .try_state::<RemoteServer>()
        .ok_or_else(|| "Remote server not initialized".to_string())?;
    if !server.state().is_running() {
        return Err("Remote server is not running. Enable Mobile Access first.".to_string());
    }

    let state = server.state();
    let port = {
        // Use configured port; bind_port is async mutex — read settings as source of truth.
        get_settings(&app).remote_server_port
    };
    let local_ip = {
        let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok();
        socket.and_then(|s| {
            s.connect("8.8.8.8:80").ok()?;
            s.local_addr().ok().map(|a| a.ip().to_string())
        })
    };
    let endpoints = crate::remote::dto::QrEndpoints {
        local: local_ip.map(|ip| format!("{}:{}", ip, port)),
        mdns: Some(format!("handy-remote.local:{}", port)),
        tailscale: None,
    };
    let (session, qr) =
        state
            .pairing
            .create_session(&state.server_name, &state.fingerprint, endpoints, 5 * 60);
    Ok(PairingSessionResponse {
        session_id: session.session_id,
        code: session.code,
        expires_at: qr.expires_at.clone(),
        qr,
    })
}

#[tauri::command]
#[specta::specta]
pub fn approve_remote_pairing_session(
    app: AppHandle,
    session_id: String,
    approve: bool,
) -> Result<crate::remote::dto::PairingApproveResult, String> {
    let server = app
        .try_state::<RemoteServer>()
        .ok_or_else(|| "Remote server not initialized".to_string())?;
    let state = server.state();
    let credentials = if approve {
        Some(state.auth.issue_device(
            session_preview_name(&state, &session_id),
            session_preview_platform(&state, &session_id),
            &state.fingerprint,
        ))
    } else {
        None
    };

    let session = state
        .pairing
        .approve(&session_id, approve, credentials.clone())?;

    if !approve {
        return Ok(crate::remote::dto::PairingApproveResult {
            status: "rejected".to_string(),
            session_id: session.session_id,
            credentials: None,
        });
    }

    Ok(crate::remote::dto::PairingApproveResult {
        status: "approved".to_string(),
        session_id: session.session_id,
        credentials,
    })
}

fn session_preview_name(
    state: &crate::remote::state::RemoteServerState,
    session_id: &str,
) -> String {
    state
        .pairing
        .get(session_id)
        .and_then(|s| s.device_name)
        .unwrap_or_else(|| "Mobile".to_string())
}

fn session_preview_platform(
    state: &crate::remote::state::RemoteServerState,
    session_id: &str,
) -> Option<String> {
    state
        .pairing
        .get(session_id)
        .and_then(|s| s.device_platform)
}

#[tauri::command]
#[specta::specta]
pub fn list_remote_devices(app: AppHandle) -> Result<Vec<DeviceInfo>, String> {
    let server = app
        .try_state::<RemoteServer>()
        .ok_or_else(|| "Remote server not initialized".to_string())?;
    Ok(server
        .state()
        .auth
        .list_devices()
        .into_iter()
        .map(|d| DeviceInfo {
            id: d.id,
            name: d.name,
            platform: d.platform,
            created_at: d.created_at.to_string(),
            last_seen_at: d.last_seen_at.map(|t| t.to_string()),
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub fn revoke_remote_device(app: AppHandle, device_id: String) -> Result<(), String> {
    let server = app
        .try_state::<RemoteServer>()
        .ok_or_else(|| "Remote server not initialized".to_string())?;
    if server.state().auth.revoke(&device_id) {
        Ok(())
    } else {
        Err("Device not found".to_string())
    }
}
