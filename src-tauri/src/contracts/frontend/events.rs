use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

use crate::error::AppError;
use crate::utils::serde_string::{i64_string, option_u64_string, u64_string};

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
    pub event_type: String,
    pub action: String,
    pub actor_id: String,
    pub actor_name: String,
    pub actor_image: String,
    pub scope: String,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub time: i64,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub time_nano: i64,
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
pub struct DockerSshStreamChunk {
    pub stream_id: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct DockerSshStreamDone {
    pub stream_id: String,
    pub success: bool,
    pub error: Option<AppError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ImageExportProgress {
    pub export_id: String,
    pub image_id: String,
    #[serde(with = "u64_string")]
    #[specta(type = String)]
    pub transferred_bytes: u64,
    #[serde(with = "option_u64_string")]
    #[specta(type = Option<String>)]
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ImageImportProgress {
    pub import_id: String,
    pub file_name: String,
    #[serde(with = "u64_string")]
    #[specta(type = String)]
    pub transferred_bytes: u64,
    #[serde(with = "option_u64_string")]
    #[specta(type = Option<String>)]
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct InstallStepEvent {
    pub step: String,
    pub status: String,
    pub message: String,
    pub output_chunk: Option<String>,
}
