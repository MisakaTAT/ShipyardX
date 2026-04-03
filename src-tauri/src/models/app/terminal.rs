use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Deserialize, Type)]
pub struct ContainerExecTerminalParams {
    pub container_id: String,
    pub user: Option<String>,
    pub shell: String,
    pub cols: u32,
    pub rows: u32,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum WsServerMsg {
    #[serde(rename = "closed")]
    Closed,
    #[serde(rename = "output")]
    Output { data: Vec<u8> },
    #[serde(rename = "error")]
    Error { message: String },
}

impl WsServerMsg {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("WsServerMsg serialization")
    }
}

#[derive(Serialize, Type)]
pub struct TerminalSession {
    pub session_id: String,
    pub ws_port: u16,
}
