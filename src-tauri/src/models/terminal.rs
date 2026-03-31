use serde::Serialize;

#[derive(Serialize)]
pub struct OpenTerminalResult {
    pub session_id: String,
    pub ws_port: u16,
}
