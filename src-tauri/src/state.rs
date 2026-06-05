mod app_state;

pub use app_state::{AppState, EventStreamHandle, PortForwardHandle, StreamHandle, TerminalHandle, TerminalMsg};

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::app::server::ServerConfig;

pub fn get_server_config(state: &State<AppState>, id: &str) -> AppResult<ServerConfig> {
    state
        .servers
        .lock()
        .unwrap()
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or_else(|| AppError::not_found("server.not_found", "服务器不存在"))
}
