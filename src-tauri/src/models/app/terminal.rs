use serde::Serialize;

#[derive(Serialize)]
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

#[derive(Serialize)]
pub struct TerminalSession {
    pub session_id: String,
    pub ws_port: u16,
}
