use crate::remote::auth::{now_secs, random_token, six_digit_code, uuid_simple};
use crate::remote::dto::{QrEndpoints, QrPayload};
use std::collections::HashMap;
use std::sync::Mutex;

/// Grace period kept after a session expires.
///
/// A session reaches `Approved` moments before the phone polls
/// `/v1/pairing/sessions/{id}` for its credentials, so dropping entries the
/// instant they expire would occasionally lose a pairing that actually
/// succeeded. The window is short because an expired entry may still hold the
/// credential pair it handed over.
const RETENTION_AFTER_EXPIRY_SECS: u64 = 60;

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
        {
            // Every QR code the user asks for used to leave an entry behind for
            // the lifetime of the process, credentials included.
            let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            prune_expired(&mut sessions);
            sessions.insert(session_id.clone(), session.clone());
        }

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

    /// Number of retained sessions, expired ones included.
    #[cfg(test)]
    fn len(&self) -> usize {
        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .len()
    }
}

/// Drop sessions whose grace period is over.
fn prune_expired(sessions: &mut HashMap<String, PairingSession>) {
    let cutoff = now_secs().saturating_sub(RETENTION_AFTER_EXPIRY_SECS);
    sessions.retain(|_, session| session.expires_at >= cutoff);
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

    /// Backdate a session past its grace period, standing in for one abandoned
    /// long ago without making the test wait.
    fn backdate(store: &PairingStore, session_id: &str) {
        let mut sessions = store.sessions.lock().unwrap();
        let session = sessions.get_mut(session_id).expect("session exists");
        session.expires_at = now_secs() - RETENTION_AFTER_EXPIRY_SECS - 1;
    }

    #[test]
    fn creating_a_session_collects_long_expired_ones() {
        let store = PairingStore::new();
        let stale = new_session(&store, 300);
        backdate(&store, &stale.session_id);

        let fresh = new_session(&store, 300);

        assert!(
            store.get(&stale.session_id).is_none(),
            "an abandoned session must not be retained forever"
        );
        assert!(store.get(&fresh.session_id).is_some());
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn a_just_approved_session_survives_the_next_qr_code() {
        let store = PairingStore::new();
        // Barely alive: the claim/approve pair must still be accepted, and the
        // entry must survive the prune that the next QR code triggers.
        let session = new_session(&store, 1);
        store
            .claim(
                &session.session_id,
                &session.secret,
                "Phone".to_string(),
                None,
            )
            .expect("claim");
        store
            .approve(&session.session_id, true, Some(credentials()))
            .expect("approve");

        // The phone has not polled for its credentials yet, so an expired but
        // recently approved session must still be readable.
        new_session(&store, 300);

        assert!(
            store
                .get(&session.session_id)
                .and_then(|s| s.credentials)
                .is_some(),
            "credentials must stay available long enough for the phone to fetch them"
        );
    }
}
