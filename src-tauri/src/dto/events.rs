use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

use crate::dto::server::HostKeyPrompt;
use crate::error::AppError;

/// 主机密钥校验失败时通知前端弹出确认框
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct HostKeyPromptRequired {
    pub prompt: HostKeyPrompt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum EventStreamStatus {
    Connecting,
    Connected,
    Disconnected,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DockerEvent {
    pub event_id: String,
    pub event_type: String,
    pub event_type_label: String,
    pub event_type_icon: String,
    pub action: String,
    pub action_tone: String,
    pub actor_id: String,
    pub actor_name: String,
    pub actor_image: String,
    pub scope: String,
    pub time: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct DockerStreamPayload {
    pub stream_id: String,
    pub event: DockerEvent,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct DockerStreamStatus {
    pub stream_id: String,
    pub status: EventStreamStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct DockerStreamRefresh {
    pub stream_id: String,
    pub resource: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct DockerStreamError {
    pub stream_id: String,
    pub error: AppError,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ImagePullLayerProgress {
    pub id: String,
    pub status: String,
    pub current: Option<String>,
    pub total: Option<String>,
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ImagePullProgress {
    pub stream_id: String,
    pub image: String,
    pub status: String,
    pub detail: Option<String>,
    pub layers: Vec<ImagePullLayerProgress>,
    pub completed_layers: u32,
    pub total_layers: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ImagePullDone {
    pub stream_id: String,
    pub success: bool,
    pub error: Option<AppError>,
    pub final_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ImageExportProgress {
    pub export_id: String,
    pub image_id: String,
    pub transferred: String,
    pub total: Option<String>,
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ImageImportProgress {
    pub import_id: String,
    pub file_name: String,
    pub transferred: String,
    pub total: Option<String>,
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct InstallStepEvent {
    pub step: String,
    pub status: String,
    /// 词条 key（install.<name>），文案与插值由前端决定
    pub message_code: String,
    pub params: std::collections::BTreeMap<String, String>,
    pub output_chunk: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct AppstoreSyncProgress {
    pub phase: String,
    pub received_objects: u32,
    pub total_objects: u32,
    pub indexed_objects: u32,
    pub percent: f64,
}
