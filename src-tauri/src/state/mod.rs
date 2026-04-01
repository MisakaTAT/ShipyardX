mod app_state;

pub use app_state::{AppState, EventStreamHandle, StreamHandle, TerminalHandle, TerminalMsg};

use tauri::State;

use crate::models::app::server::ServerConfig;

pub fn get_server_config(state: &State<AppState>, id: &str) -> Result<ServerConfig, String> {
    state
        .servers
        .lock()
        .unwrap()
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or_else(|| "服务器不存在".to_string())
}
