use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfoResponse {
    pub name: String,
    pub version: String,
    pub fingerprint: String,
    pub platform: String,
    pub port: u16,
    pub capabilities: ServerCapabilities,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ServerCapabilities {
    pub transcription: bool,
    pub post_processing: bool,
    pub history: bool,
    pub streaming: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PairingSessionResponse {
    pub session_id: String,
    pub code: String,
    pub expires_at: String,
    pub qr: QrPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QrPayload {
    pub version: u32,
    pub session_id: String,
    pub secret: String,
    pub server_name: String,
    pub fingerprint: String,
    pub expires_at: String,
    pub endpoints: QrEndpoints,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QrEndpoints {
    pub local: Option<String>,
    pub mdns: Option<String>,
    pub tailscale: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingClaimRequest {
    pub session_id: String,
    pub secret: String,
    pub device_name: String,
    pub platform: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingClaimResponse {
    pub session_id: String,
    pub code: String,
    pub server_name: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingApproveRequest {
    pub session_id: String,
    pub approve: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCredentials {
    pub device_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub server_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub platform: Option<String>,
    pub created_at: String,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PairingApproveResult {
    pub status: String,
    pub session_id: String,
    pub credentials: Option<DeviceCredentials>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionResponse {
    pub id: String,
    pub raw_text: String,
    pub final_text: String,
    pub post_processed: bool,
    pub prompt_name: Option<String>,
    pub model: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntryDto {
    pub id: String,
    pub source: String,
    pub raw_text: String,
    pub final_text: String,
    pub post_processed: bool,
    pub prompt_name: Option<String>,
    pub audio_available: bool,
    pub timestamp: i64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostProcessingInfo {
    pub available: bool,
    pub configured: bool,
    pub api_key_configured: bool,
    pub provider_id: Option<String>,
    pub provider_label: Option<String>,
    pub model: Option<String>,
    pub selected_prompt: Option<PostProcessingPromptDto>,
    pub prompts: Vec<PostProcessingPromptDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostProcessingPromptDto {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsInfo {
    pub active_model_id: Option<String>,
    pub models: Vec<ModelSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub size_mb: u64,
    pub is_downloaded: bool,
    pub is_active: bool,
    pub supports_translation: bool,
    pub supports_streaming: bool,
    pub is_recommended: bool,
    pub accuracy_score: f32,
    pub speed_score: f32,
    pub supported_languages: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectModelRequest {
    pub model_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectPromptRequest {
    pub prompt_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSettingsResponse {
    pub sound_theme: String,
    pub audio_feedback: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub error: String,
    pub message: String,
}
