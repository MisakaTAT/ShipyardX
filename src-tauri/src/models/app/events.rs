use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

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
    pub time: i64,
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
    pub message: String,
}
