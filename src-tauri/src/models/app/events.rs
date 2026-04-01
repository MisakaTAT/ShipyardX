use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
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
