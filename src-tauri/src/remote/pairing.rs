use crate::remote::auth::{now_secs, random_token, six_digit_code, uuid_simple};
use crate::remote::dto::{QrEndpoints, QrPayload};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairingStatus {
    Pending,
    Claimed,
    Approved,
    Rejected,
    Expired,
}

#[derive(Debug, Clone)]
pub struct PairingSession {
    pub session_id: String,
    pub secret: String,
    pub code: String,
    pub expires_at: u64,
    pub status: PairingStatus,
    pub device_name: Option<String>,
    pub device_platform: Option<String>,
    pub claimed_at: Option<u64>,
    pub credentials: Option<crate::remote::dto::DeviceCredentials>,
}

#[derive(Debug, Default)]
pub struct PairingStore {
    sessions: Mutex<HashMap<String, PairingSession>>,
}

impl PairingStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create_session(
        &self,
        server_name: &str,
        fingerprint: &str,
        endpoints: QrEndpoints,
        ttl_secs: u64,
    ) -> (PairingSession, QrPayload) {
        let session_id = format!("pair_{}", uuid_simple());
        let secret = random_token();
        let code = six_digit_code();
        let expires_at = now_secs() + ttl_secs;
        let session = PairingSession {
            session_id: session_id.clone(),
            secret: secret.clone(),
            code: code.clone(),
            expires_at,
            status: PairingStatus::Pending,
            device_name: None,
            device_platform: None,
            claimed_at: None,
            credentials: None,
        };
        self.sessions
            .lock()
            .unwrap()
            .insert(session_id.clone(), session.clone());

        let qr = QrPayload {
            version: 1,
            session_id,
            secret,
            server_name: server_name.to_string(),
            fingerprint: fingerprint.to_string(),
            expires_at: format!("{}", expires_at),
            endpoints,
        };
        (session, qr)
    }

    pub fn claim(
        &self,
        session_id: &str,
        secret: &str,
        device_name: String,
        platform: Option<String>,
    ) -> Result<PairingSession, String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "session not found".to_string())?;
        if session.expires_at < now_secs() {
            session.status = PairingStatus::Expired;
            return Err("session expired".to_string());
        }
        if session.status != PairingStatus::Pending {
            return Err("session already used".to_string());
        }
        if session.secret != secret {
            return Err("invalid secret".to_string());
        }
        session.status = PairingStatus::Claimed;
        session.device_name = Some(device_name);
        session.device_platform = platform;
        session.claimed_at = Some(now_secs());
        // One-time secret: clear after claim so reuse cannot recover it.
        session.secret.clear();
        Ok(session.clone())
    }

    pub fn approve(
        &self,
        session_id: &str,
        approve: bool,
        credentials: Option<crate::remote::dto::DeviceCredentials>,
    ) -> Result<PairingSession, String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "session not found".to_string())?;
        if session.expires_at < now_secs() {
            session.status = PairingStatus::Expired;
            return Err("session expired".to_string());
        }
        if session.status != PairingStatus::Claimed {
            return Err("session is not awaiting approval".to_string());
        }
        session.status = if approve {
            PairingStatus::Approved
        } else {
            PairingStatus::Rejected
        };
        if approve {
            session.credentials = credentials;
        }
        Ok(session.clone())
    }

    pub fn get(&self, session_id: &str) -> Option<PairingSession> {
        self.sessions.lock().unwrap().get(session_id).cloned()
    }
}
