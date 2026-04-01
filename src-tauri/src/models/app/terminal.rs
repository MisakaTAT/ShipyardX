use serde::Serialize;

#[derive(Serialize)]
pub struct TerminalSession {
    pub session_id: String,
    pub ws_port: u16,
}
