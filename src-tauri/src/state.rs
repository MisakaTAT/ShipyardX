mod app_state;

pub use app_state::AppState;
pub(crate) use app_state::{
    EventStreamHandle, PortForwardRuntimeHandle, PortForwardRuntimeState, StreamHandle, TerminalHandle, TerminalMsg,
};

use tauri::State;

use crate::contracts::frontend::server::ServerConfig;
use crate::error::{AppError, AppResult};

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
