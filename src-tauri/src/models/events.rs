use serde::{Deserialize, Serialize};

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

#[derive(Deserialize)]
pub struct RawDockerEvent {
    #[serde(rename = "Type")]
    pub event_type: String,
    #[serde(rename = "Action")]
    pub action: String,
    #[serde(rename = "Actor", default)]
    pub actor: RawActor,
    #[serde(default)]
    pub scope: Option<String>,
    pub time: Option<i64>,
    #[serde(rename = "timeNano")]
    pub time_nano: Option<i64>,
}

#[derive(Deserialize, Default)]
pub struct RawActor {
    #[serde(rename = "ID", default)]
    pub id: String,
    #[serde(rename = "Attributes", default)]
    pub attributes: std::collections::HashMap<String, String>,
}
