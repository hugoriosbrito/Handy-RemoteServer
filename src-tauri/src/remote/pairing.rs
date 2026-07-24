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
            .unwrap_or_else(|e| e.into_inner())
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
        let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
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
        let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
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
        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(session_id)
            .cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::remote::dto::DeviceCredentials;

    fn endpoints() -> QrEndpoints {
        QrEndpoints {
            local: Some("http://192.168.0.10:8765".to_string()),
            mdns: None,
            tailscale: None,
        }
    }

    fn credentials() -> DeviceCredentials {
        DeviceCredentials {
            device_id: "device_1".to_string(),
            access_token: "at_1".to_string(),
            refresh_token: "rt_1".to_string(),
            server_fingerprint: "fp".to_string(),
        }
    }

    fn new_session(store: &PairingStore, ttl_secs: u64) -> PairingSession {
        store
            .create_session("Desktop", "fp", endpoints(), ttl_secs)
            .0
    }

    #[test]
    fn created_session_starts_pending_and_matches_its_qr_payload() {
        let store = PairingStore::new();
        let (session, qr) = store.create_session("Desktop", "fp", endpoints(), 300);

        assert_eq!(session.status, PairingStatus::Pending);
        assert_eq!(session.code.len(), 6);
        assert_eq!(qr.session_id, session.session_id);
        assert_eq!(qr.secret, session.secret);
        assert_eq!(qr.fingerprint, "fp");
        assert_eq!(qr.server_name, "Desktop");
        assert_eq!(qr.expires_at, session.expires_at.to_string());
        assert!(store.get(&session.session_id).is_some());
    }

    #[test]
    fn full_claim_then_approve_flow_hands_over_credentials() {
        let store = PairingStore::new();
        let session = new_session(&store, 300);

        let claimed = store
            .claim(
                &session.session_id,
                &session.secret,
                "Phone".to_string(),
                Some("android".to_string()),
            )
            .expect("a pending session with the right secret must be claimable");
        assert_eq!(claimed.status, PairingStatus::Claimed);
        assert_eq!(claimed.device_name.as_deref(), Some("Phone"));
        assert!(claimed.claimed_at.is_some());
        assert!(
            claimed.secret.is_empty(),
            "the one-time secret must be cleared after the claim"
        );

        let approved = store
            .approve(&session.session_id, true, Some(credentials()))
            .expect("a claimed session must be approvable");
        assert_eq!(approved.status, PairingStatus::Approved);
        assert_eq!(
            approved.credentials.map(|c| c.device_id),
            Some("device_1".to_string())
        );
    }

    #[test]
    fn claim_rejects_a_wrong_secret_and_leaves_the_session_pending() {
        let store = PairingStore::new();
        let session = new_session(&store, 300);

        assert!(store
            .claim(&session.session_id, "wrong", "Phone".to_string(), None)
            .is_err());
        assert_eq!(
            store.get(&session.session_id).map(|s| s.status),
            Some(PairingStatus::Pending)
        );
    }

    #[test]
    fn a_session_can_only_be_claimed_once() {
        let store = PairingStore::new();
        let session = new_session(&store, 300);
        let secret = session.secret.clone();

        assert!(store
            .claim(&session.session_id, &secret, "Phone".to_string(), None)
            .is_ok());
        assert!(
            store
                .claim(&session.session_id, &secret, "Attacker".to_string(), None)
                .is_err(),
            "replaying a claim must not steal an in-flight pairing"
        );
    }

    #[test]
    fn claim_rejects_an_unknown_session() {
        let store = PairingStore::new();
        assert!(store
            .claim("pair_unknown", "secret", "Phone".to_string(), None)
            .is_err());
    }

    #[test]
    fn an_expired_session_cannot_be_claimed_and_is_marked_expired() {
        let store = PairingStore::new();
        let session = new_session(&store, 0);
        // `expires_at` is inclusive of the current second; move past it.
        std::thread::sleep(std::time::Duration::from_millis(1100));

        assert!(store
            .claim(
                &session.session_id,
                &session.secret,
                "Phone".to_string(),
                None
            )
            .is_err());
        assert_eq!(
            store.get(&session.session_id).map(|s| s.status),
            Some(PairingStatus::Expired)
        );
    }

    #[test]
    fn approve_requires_a_claimed_session() {
        let store = PairingStore::new();
        let session = new_session(&store, 300);

        assert!(
            store
                .approve(&session.session_id, true, Some(credentials()))
                .is_err(),
            "a session nobody claimed must not yield credentials"
        );
        assert!(store.approve("pair_unknown", true, None).is_err());
    }

    #[test]
    fn rejecting_a_claim_withholds_credentials() {
        let store = PairingStore::new();
        let session = new_session(&store, 300);
        store
            .claim(
                &session.session_id,
                &session.secret,
                "Phone".to_string(),
                None,
            )
            .expect("claim");

        let rejected = store
            .approve(&session.session_id, false, Some(credentials()))
            .expect("rejection is a valid outcome");
        assert_eq!(rejected.status, PairingStatus::Rejected);
        assert!(
            rejected.credentials.is_none(),
            "a rejected device must never receive tokens"
        );
    }
}
