use crate::remote::dto::DeviceCredentials;
use log::{debug, warn};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

/// Store file holding paired-device credentials. Kept separate from the
/// settings store so a settings reset never silently unpairs every phone.
pub const REMOTE_AUTH_STORE_PATH: &str = "remote_auth_store.json";
const DEVICES_KEY: &str = "devices";
const FINGERPRINT_KEY: &str = "fingerprint";

/// How long an issued access token stays valid.
///
/// A paired phone that is only used occasionally should not have to scan a QR
/// code again, so this is generous; the mobile client rotates transparently on
/// the first 401 using its refresh token. The point is to bound the damage of a
/// token that leaks out of a phone's storage, not to log the user out.
const ACCESS_TOKEN_TTL_SECS: u64 = 14 * 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizedDevice {
    pub id: String,
    pub name: String,
    pub platform: Option<String>,
    pub access_token_hash: String,
    pub refresh_token_hash: String,
    pub created_at: u64,
    pub last_seen_at: Option<u64>,
    pub revoked: bool,
    /// Instant after which `access_token_hash` is no longer accepted.
    ///
    /// Optional and defaulted so a store written by an earlier build still
    /// deserializes instead of unpairing every device on upgrade; missing
    /// values fall back to `created_at + ACCESS_TOKEN_TTL_SECS`.
    #[serde(default)]
    pub access_token_expires_at: Option<u64>,
}

impl AuthorizedDevice {
    /// Expiry of the current access token, inferring one for devices persisted
    /// before tokens had a lifetime.
    pub fn access_token_expiry(&self) -> u64 {
        self.access_token_expires_at
            .unwrap_or_else(|| self.created_at.saturating_add(ACCESS_TOKEN_TTL_SECS))
    }

    fn access_token_is_expired(&self, now: u64) -> bool {
        now >= self.access_token_expiry()
    }
}

/// Where the paired-device list is kept between runs.
///
/// Extracted so the token logic can be exercised without an `AppHandle`: a
/// test that merely constructed an `AppHandle`-owning store aborted the whole
/// test binary at load time on Windows (`STATUS_ENTRYPOINT_NOT_FOUND`).
pub trait DeviceStorage: Send + Sync {
    fn load(&self) -> Vec<AuthorizedDevice>;
    fn save(&self, devices: &[AuthorizedDevice]);
}

/// Non-persistent backend. Devices live only as long as the process.
#[derive(Debug, Default)]
pub struct InMemoryStorage;

impl DeviceStorage for InMemoryStorage {
    fn load(&self) -> Vec<AuthorizedDevice> {
        Vec::new()
    }

    fn save(&self, _devices: &[AuthorizedDevice]) {}
}

/// Production backend, writing to the Tauri store on disk.
pub struct TauriStorage {
    app: AppHandle,
}

impl TauriStorage {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl DeviceStorage for TauriStorage {
    fn load(&self) -> Vec<AuthorizedDevice> {
        load_devices(&self.app)
    }

    fn save(&self, devices: &[AuthorizedDevice]) {
        save_devices(&self.app, devices);
    }
}

pub struct AuthStore {
    devices: Mutex<HashMap<String, AuthorizedDevice>>,
    access_index: Mutex<HashMap<String, String>>,
    refresh_index: Mutex<HashMap<String, String>>,
    storage: Box<dyn DeviceStorage>,
}

impl std::fmt::Debug for AuthStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthStore")
            .field(
                "devices",
                &self
                    .devices
                    .lock()
                    .map(|d| d.len())
                    .unwrap_or_else(|e| e.into_inner().len()),
            )
            .finish_non_exhaustive()
    }
}

impl Default for AuthStore {
    fn default() -> Self {
        Self::with_storage(Box::new(InMemoryStorage))
    }
}

impl AuthStore {
    /// Build a store backed by the on-disk device list. Devices paired in a
    /// previous run keep working after Handy restarts instead of silently
    /// returning 401 to a phone that still shows "connected".
    pub fn with_app(app: AppHandle) -> Self {
        Self::with_storage(Box::new(TauriStorage::new(app)))
    }

    /// Build a store over any persistence backend, restoring whatever devices
    /// it already holds.
    pub fn with_storage(storage: Box<dyn DeviceStorage>) -> Self {
        let devices = storage.load();
        let store = Self {
            devices: Mutex::new(HashMap::new()),
            access_index: Mutex::new(HashMap::new()),
            refresh_index: Mutex::new(HashMap::new()),
            storage,
        };
        {
            let mut map = store.devices.lock().unwrap_or_else(|e| e.into_inner());
            let mut access = store.access_index.lock().unwrap_or_else(|e| e.into_inner());
            let mut refresh = store
                .refresh_index
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            for device in devices {
                if device.revoked {
                    continue;
                }
                access.insert(device.access_token_hash.clone(), device.id.clone());
                refresh.insert(device.refresh_token_hash.clone(), device.id.clone());
                map.insert(device.id.clone(), device);
            }
            debug!("Remote auth: restored {} paired device(s)", map.len());
        }
        store
    }

    fn persist(&self) {
        let devices: Vec<AuthorizedDevice> = self
            .devices
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .values()
            .cloned()
            .collect();
        self.storage.save(&devices);
    }

    pub fn issue_device(
        &self,
        name: String,
        platform: Option<String>,
        fingerprint: &str,
    ) -> DeviceCredentials {
        let device_id = format!("device_{}", uuid_simple());
        let access_token = format!("at_{}", random_token());
        let refresh_token = format!("rt_{}", random_token());

        let device = AuthorizedDevice {
            id: device_id.clone(),
            name,
            platform,
            access_token_hash: hash_token(&access_token),
            refresh_token_hash: hash_token(&refresh_token),
            created_at: now_secs(),
            last_seen_at: Some(now_secs()),
            revoked: false,
            access_token_expires_at: Some(now_secs().saturating_add(ACCESS_TOKEN_TTL_SECS)),
        };

        self.access_index
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(device.access_token_hash.clone(), device_id.clone());
        self.refresh_index
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(device.refresh_token_hash.clone(), device_id.clone());
        self.devices
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(device_id.clone(), device);
        self.persist();

        DeviceCredentials {
            device_id,
            access_token,
            refresh_token,
            server_fingerprint: fingerprint.to_string(),
        }
    }

    /// Exchange a refresh token for a fresh credential pair. Both tokens are
    /// rotated so a leaked refresh token cannot be replayed.
    pub fn refresh(
        &self,
        refresh_token: &str,
        fingerprint: &str,
    ) -> Result<DeviceCredentials, String> {
        let hash = hash_token(refresh_token);
        let device_id = self
            .refresh_index
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(&hash)
            .cloned()
            .ok_or_else(|| "invalid refresh token".to_string())?;

        let access_token = format!("at_{}", random_token());
        let new_refresh_token = format!("rt_{}", random_token());
        let (old_access_hash, old_refresh_hash) = {
            let mut devices = self.devices.lock().unwrap_or_else(|e| e.into_inner());
            let device = devices
                .get_mut(&device_id)
                .ok_or_else(|| "device not found".to_string())?;
            if device.revoked {
                return Err("device revoked".to_string());
            }
            let previous = (
                device.access_token_hash.clone(),
                device.refresh_token_hash.clone(),
            );
            device.access_token_hash = hash_token(&access_token);
            device.refresh_token_hash = hash_token(&new_refresh_token);
            device.last_seen_at = Some(now_secs());
            device.access_token_expires_at = Some(now_secs().saturating_add(ACCESS_TOKEN_TTL_SECS));
            previous
        };

        {
            let mut access = self.access_index.lock().unwrap_or_else(|e| e.into_inner());
            access.remove(&old_access_hash);
            access.insert(hash_token(&access_token), device_id.clone());
        }
        {
            let mut refresh = self.refresh_index.lock().unwrap_or_else(|e| e.into_inner());
            refresh.remove(&old_refresh_hash);
            refresh.insert(hash_token(&new_refresh_token), device_id.clone());
        }
        self.persist();

        Ok(DeviceCredentials {
            device_id,
            access_token,
            refresh_token: new_refresh_token,
            server_fingerprint: fingerprint.to_string(),
        })
    }

    pub fn authorize(&self, bearer: Option<&str>) -> Result<AuthorizedDevice, String> {
        let token = bearer
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(|| "missing bearer token".to_string())?;
        let hash = hash_token(token);
        let device_id = self
            .access_index
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(&hash)
            .cloned()
            .ok_or_else(|| "invalid token".to_string())?;
        let mut devices = self.devices.lock().unwrap_or_else(|e| e.into_inner());
        let device = devices
            .get_mut(&device_id)
            .ok_or_else(|| "device not found".to_string())?;
        if device.revoked {
            return Err("device revoked".to_string());
        }
        if device.access_token_is_expired(now_secs()) {
            // The phone answers this by rotating with its refresh token, so the
            // message names the remedy instead of just failing.
            return Err("access token expired".to_string());
        }
        device.last_seen_at = Some(now_secs());
        Ok(device.clone())
    }

    pub fn list_devices(&self) -> Vec<AuthorizedDevice> {
        self.devices
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .values()
            .filter(|d| !d.revoked)
            .cloned()
            .collect()
    }

    pub fn revoke(&self, device_id: &str) -> bool {
        let revoked = {
            let mut devices = self.devices.lock().unwrap_or_else(|e| e.into_inner());
            match devices.get_mut(device_id) {
                Some(device) => {
                    device.revoked = true;
                    true
                }
                None => false,
            }
        };
        if revoked {
            self.access_index
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .retain(|_, id| id != device_id);
            self.refresh_index
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .retain(|_, id| id != device_id);
            self.persist();
        }
        revoked
    }
}

fn load_devices(app: &AppHandle) -> Vec<AuthorizedDevice> {
    let store = match app.store(crate::portable::store_path(REMOTE_AUTH_STORE_PATH)) {
        Ok(store) => store,
        Err(e) => {
            warn!("Remote auth: could not open credential store ({e}); pairing will not persist");
            return Vec::new();
        }
    };
    store
        .get(DEVICES_KEY)
        .and_then(
            |value| match serde_json::from_value::<Vec<AuthorizedDevice>>(value) {
                Ok(devices) => Some(devices),
                Err(e) => {
                    warn!("Remote auth: stored devices are unreadable ({e}); starting empty");
                    None
                }
            },
        )
        .unwrap_or_default()
}

fn save_devices(app: &AppHandle, devices: &[AuthorizedDevice]) {
    let store = match app.store(crate::portable::store_path(REMOTE_AUTH_STORE_PATH)) {
        Ok(store) => store,
        Err(e) => {
            warn!("Remote auth: could not open credential store ({e}); pairing will not persist");
            return;
        }
    };
    match serde_json::to_value(devices) {
        Ok(value) => {
            store.set(DEVICES_KEY, value);
            if let Err(e) = store.save() {
                warn!("Remote auth: failed to save credential store: {e}");
            }
        }
        Err(e) => warn!("Remote auth: failed to serialize devices: {e}"),
    }
}

/// Server fingerprint, stable across restarts. The phone pins this value at
/// pairing time, so regenerating it every boot made the paired PC look like a
/// different machine.
pub fn load_or_create_fingerprint(app: &AppHandle, generate: impl FnOnce() -> String) -> String {
    let store = match app.store(crate::portable::store_path(REMOTE_AUTH_STORE_PATH)) {
        Ok(store) => store,
        Err(e) => {
            warn!(
                "Remote auth: could not open credential store ({e}); using ephemeral fingerprint"
            );
            return generate();
        }
    };
    if let Some(existing) = store
        .get(FINGERPRINT_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
    {
        return existing;
    }
    let fingerprint = generate();
    store.set(
        FINGERPRINT_KEY,
        serde_json::Value::String(fingerprint.clone()),
    );
    if let Err(e) = store.save() {
        warn!("Remote auth: failed to persist fingerprint: {e}");
    }
    fingerprint
}

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs()
}

pub fn random_token() -> String {
    Uuid::new_v4().to_string().replace('-', "")
}

pub fn uuid_simple() -> String {
    Uuid::new_v4().to_string().replace('-', "")
}

pub fn six_digit_code() -> String {
    let n = (Uuid::new_v4().as_u128() % 900_000) + 100_000;
    format!("{:06}", n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    const FINGERPRINT: &str = "fp_test";

    fn store() -> AuthStore {
        AuthStore::with_storage(Box::new(InMemoryStorage))
    }

    fn bearer(token: &str) -> String {
        format!("Bearer {token}")
    }

    /// Persistence backend that keeps devices in memory, so a "restart" can be
    /// simulated by building a second `AuthStore` over the same backend.
    #[derive(Default, Clone)]
    struct FakeStorage {
        devices: Arc<Mutex<Vec<AuthorizedDevice>>>,
    }

    impl DeviceStorage for FakeStorage {
        fn load(&self) -> Vec<AuthorizedDevice> {
            self.devices.lock().unwrap().clone()
        }

        fn save(&self, devices: &[AuthorizedDevice]) {
            *self.devices.lock().unwrap() = devices.to_vec();
        }
    }

    #[test]
    fn hash_token_is_stable_and_distinct_per_token() {
        assert_eq!(hash_token("abc"), hash_token("abc"));
        assert_ne!(hash_token("abc"), hash_token("abd"));
        assert_eq!(hash_token("abc").len(), 64);
    }

    #[test]
    fn hashing_is_one_way_enough_to_not_leak_the_token() {
        let token = format!("at_{}", random_token());
        let hash = hash_token(&token);
        assert!(!hash.contains(&token));
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn generated_tokens_are_unique_and_url_safe() {
        let token = random_token();
        assert_eq!(token.len(), 32);
        assert!(!token.contains('-'));
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric()));
        assert_ne!(token, random_token());
    }

    #[test]
    fn device_ids_are_unique() {
        assert_ne!(uuid_simple(), uuid_simple());
    }

    #[test]
    fn pairing_codes_are_always_six_digits() {
        for _ in 0..200 {
            let code = six_digit_code();
            assert_eq!(code.len(), 6, "code {code} is not six characters");
            assert!(code.chars().all(|c| c.is_ascii_digit()));
        }
    }

    #[test]
    fn now_secs_is_a_plausible_unix_timestamp() {
        // Sanity guard against a clock helper that silently returns 0.
        assert!(now_secs() > 1_700_000_000);
    }

    #[test]
    fn issued_token_authorizes_and_is_stored_only_as_a_hash() {
        let store = store();
        let creds = store.issue_device("Phone".into(), Some("android".into()), FINGERPRINT);

        let device = store
            .authorize(Some(&bearer(&creds.access_token)))
            .expect("freshly issued token must authorize");

        assert_eq!(device.id, creds.device_id);
        assert_eq!(creds.server_fingerprint, FINGERPRINT);
        // The raw token must never be recoverable from what we keep on disk.
        assert_eq!(device.access_token_hash, hash_token(&creds.access_token));
        assert_ne!(device.access_token_hash, creds.access_token);
        assert_ne!(device.refresh_token_hash, creds.refresh_token);
    }

    #[test]
    fn authorize_rejects_malformed_or_unknown_tokens() {
        let store = store();
        let creds = store.issue_device("Phone".into(), None, FINGERPRINT);

        assert!(store.authorize(None).is_err());
        // Right token, missing scheme.
        assert!(store.authorize(Some(&creds.access_token)).is_err());
        assert!(store.authorize(Some("Bearer at_nope")).is_err());
        // A refresh token must not double as an access token.
        assert!(store
            .authorize(Some(&bearer(&creds.refresh_token)))
            .is_err());
    }

    #[test]
    fn refresh_rotates_both_tokens_and_invalidates_the_old_pair() {
        let store = store();
        let first = store.issue_device("Phone".into(), None, FINGERPRINT);
        let second = store
            .refresh(&first.refresh_token, FINGERPRINT)
            .expect("valid refresh token must rotate");

        assert_eq!(second.device_id, first.device_id);
        assert_ne!(second.access_token, first.access_token);
        assert_ne!(second.refresh_token, first.refresh_token);

        // Old access token is dead; the new one works.
        assert!(store.authorize(Some(&bearer(&first.access_token))).is_err());
        assert!(store.authorize(Some(&bearer(&second.access_token))).is_ok());
        // And the consumed refresh token cannot be replayed.
        assert!(store.refresh(&first.refresh_token, FINGERPRINT).is_err());
    }

    #[test]
    fn refresh_rejects_an_unknown_token() {
        let store = store();
        store.issue_device("Phone".into(), None, FINGERPRINT);
        assert!(store.refresh("rt_nope", FINGERPRINT).is_err());
    }

    #[test]
    fn revoking_a_device_kills_both_its_tokens() {
        let store = store();
        let creds = store.issue_device("Phone".into(), None, FINGERPRINT);

        assert!(store.revoke(&creds.device_id));
        assert!(store.authorize(Some(&bearer(&creds.access_token))).is_err());
        assert!(store.refresh(&creds.refresh_token, FINGERPRINT).is_err());
        // Revoking twice is not an error, but revoking a stranger is a no-op.
        assert!(!store.revoke("device_unknown"));
    }

    #[test]
    fn list_devices_hides_revoked_ones() {
        let store = store();
        let kept = store.issue_device("Keep".into(), None, FINGERPRINT);
        let dropped = store.issue_device("Drop".into(), None, FINGERPRINT);

        assert_eq!(store.list_devices().len(), 2);
        store.revoke(&dropped.device_id);

        let remaining = store.list_devices();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, kept.device_id);
    }

    #[test]
    fn paired_devices_survive_a_restart() {
        let backend = FakeStorage::default();
        let creds = {
            let store = AuthStore::with_storage(Box::new(backend.clone()));
            store.issue_device("Phone".into(), None, FINGERPRINT)
        };

        // Same persisted state, brand new store: the phone must stay paired.
        let restarted = AuthStore::with_storage(Box::new(backend.clone()));
        let device = restarted
            .authorize(Some(&bearer(&creds.access_token)))
            .expect("token issued before the restart must still authorize");
        assert_eq!(device.id, creds.device_id);

        // A revocation made after the restart is persisted too.
        restarted.revoke(&creds.device_id);
        let again = AuthStore::with_storage(Box::new(backend));
        assert!(again.authorize(Some(&bearer(&creds.access_token))).is_err());
        assert!(again.list_devices().is_empty());
    }

    /// Rewrite the persisted devices so their access token looks expired, the
    /// only way to reach the expiry branch without waiting two weeks.
    fn expire_stored_access_tokens(backend: &FakeStorage) {
        let mut devices = backend.load();
        for device in &mut devices {
            device.access_token_expires_at = Some(now_secs() - 1);
        }
        backend.save(&devices);
    }

    #[test]
    fn issued_tokens_carry_an_expiry() {
        let store = store();
        let creds = store.issue_device("Phone".into(), None, FINGERPRINT);
        let device = store
            .authorize(Some(&bearer(&creds.access_token)))
            .expect("a fresh token is not expired");

        assert!(
            device.access_token_expiry() > now_secs(),
            "a freshly issued access token must expire in the future"
        );
    }

    #[test]
    fn an_expired_access_token_is_rejected() {
        let backend = FakeStorage::default();
        let creds = {
            let store = AuthStore::with_storage(Box::new(backend.clone()));
            store.issue_device("Phone".into(), None, FINGERPRINT)
        };
        expire_stored_access_tokens(&backend);

        let store = AuthStore::with_storage(Box::new(backend));
        assert!(
            store.authorize(Some(&bearer(&creds.access_token))).is_err(),
            "an access token past its expiry must not authorize"
        );
    }

    #[test]
    fn refreshing_revives_an_expired_device() {
        let backend = FakeStorage::default();
        let creds = {
            let store = AuthStore::with_storage(Box::new(backend.clone()));
            store.issue_device("Phone".into(), None, FINGERPRINT)
        };
        expire_stored_access_tokens(&backend);

        let store = AuthStore::with_storage(Box::new(backend));
        // Expiry must not touch the refresh token: this is exactly the path the
        // mobile client takes when an upload comes back 401.
        let rotated = store
            .refresh(&creds.refresh_token, FINGERPRINT)
            .expect("an expired access token is still refreshable");
        assert!(store
            .authorize(Some(&bearer(&rotated.access_token)))
            .is_ok());
    }

    #[test]
    fn devices_stored_without_an_expiry_keep_working() {
        let backend = FakeStorage::default();
        let creds = {
            let store = AuthStore::with_storage(Box::new(backend.clone()));
            store.issue_device("Phone".into(), None, FINGERPRINT)
        };

        // Simulate a store written before access tokens had a lifetime.
        let mut devices = backend.load();
        for device in &mut devices {
            device.access_token_expires_at = None;
        }
        backend.save(&devices);

        let store = AuthStore::with_storage(Box::new(backend));
        assert!(
            store.authorize(Some(&bearer(&creds.access_token))).is_ok(),
            "upgrading Handy must not unpair devices paired by an earlier build"
        );
    }
}
