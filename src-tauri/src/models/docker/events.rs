use serde::Deserialize;

#[derive(Deserialize)]
pub struct StreamEvent {
    #[serde(rename = "Type")]
    pub event_type: String,
    #[serde(rename = "Action")]
    pub action: String,
    #[serde(rename = "Actor", default)]
    pub actor: StreamActor,
    #[serde(default)]
    pub scope: Option<String>,
    pub time: Option<i64>,
    #[serde(rename = "timeNano")]
    pub time_nano: Option<i64>,
}

#[derive(Deserialize, Default)]
pub struct StreamActor {
    #[serde(rename = "ID", default)]
    pub id: String,
    #[serde(rename = "Attributes", default)]
    pub attributes: std::collections::HashMap<String, String>,
}
