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
}

#[derive(Debug, Default)]
pub struct AuthStore {
    devices: Mutex<HashMap<String, AuthorizedDevice>>,
    access_index: Mutex<HashMap<String, String>>,
    refresh_index: Mutex<HashMap<String, String>>,
    /// Present once the store is bound to the running app; without it the
    /// store stays in-memory only (used by unit tests).
    app: Mutex<Option<AppHandle>>,
}

impl AuthStore {
    /// Build a store backed by the on-disk device list. Devices paired in a
    /// previous run keep working after Handy restarts instead of silently
    /// returning 401 to a phone that still shows "connected".
    pub fn with_app(app: AppHandle) -> Self {
        let store = Self::default();
        let devices = load_devices(&app);
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
        *store.app.lock().unwrap_or_else(|e| e.into_inner()) = Some(app);
        store
    }

    fn persist(&self) {
        let app = match self.app.lock().unwrap_or_else(|e| e.into_inner()).clone() {
            Some(app) => app,
            None => return,
        };
        let devices: Vec<AuthorizedDevice> = self
            .devices
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .values()
            .cloned()
            .collect();
        save_devices(&app, &devices);
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
