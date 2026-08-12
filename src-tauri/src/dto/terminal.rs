use serde::{Deserialize, Serialize};
use specta::Type;

use crate::dto::error::AppError;

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
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "closed")]
    Closed,
    #[serde(rename = "error")]
    Error { error: AppError },
}

#[derive(Debug, Deserialize, Type)]
#[serde(tag = "type")]
pub enum WsClientCtrl {
    #[serde(rename = "client_ready")]
    ClientReady,
    #[serde(rename = "resize")]
    Resize { cols: u32, rows: u32 },
    #[serde(rename = "close")]
    Close,
}

impl WsServerMsg {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| {
            "{\"type\":\"error\",\"error\":{\"code\":\"terminal.ws_message_serialize_failed\",\"kind\":\"internal\",\"params\":{},\"detail\":null,\"retryable\":false}}".to_string()
        })
    }
}

#[derive(Serialize, Type)]
pub struct TerminalSession {
    pub session_id: String,
    pub ws_port: u16,
}
