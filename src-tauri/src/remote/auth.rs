use crate::remote::dto::DeviceCredentials;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone)]
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
}

impl AuthStore {
    pub fn new() -> Self {
        Self::default()
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
            .unwrap()
            .insert(device.access_token_hash.clone(), device_id.clone());
        self.devices
            .lock()
            .unwrap()
            .insert(device_id.clone(), device);

        DeviceCredentials {
            device_id,
            access_token,
            refresh_token,
            server_fingerprint: fingerprint.to_string(),
        }
    }

    pub fn authorize(&self, bearer: Option<&str>) -> Result<AuthorizedDevice, String> {
        let token = bearer
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(|| "missing bearer token".to_string())?;
        let hash = hash_token(token);
        let device_id = self
            .access_index
            .lock()
            .unwrap()
            .get(&hash)
            .cloned()
            .ok_or_else(|| "invalid token".to_string())?;
        let mut devices = self.devices.lock().unwrap();
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
            .unwrap()
            .values()
            .filter(|d| !d.revoked)
            .cloned()
            .collect()
    }

    pub fn revoke(&self, device_id: &str) -> bool {
        let mut devices = self.devices.lock().unwrap();
        if let Some(device) = devices.get_mut(device_id) {
            device.revoked = true;
            self.access_index
                .lock()
                .unwrap()
                .retain(|_, id| id != device_id);
            true
        } else {
            false
        }
    }
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
