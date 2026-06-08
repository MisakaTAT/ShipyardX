mod app_state;

use std::sync::{Mutex, MutexGuard};

pub use app_state::AppState;
pub(crate) use app_state::{
    EventStreamHandle, PortForwardRuntimeHandle, PortForwardRuntimeState, StreamHandle, TerminalHandle, TerminalMsg,
};

use tauri::State;

use crate::contracts::frontend::server::ServerConfig;
use crate::error::{AppError, AppResult};

pub(crate) fn lock_mutex<'a, T>(
    mutex: &'a Mutex<T>,
    code: &'static str,
    message: &'static str,
) -> AppResult<MutexGuard<'a, T>> {
    mutex
        .lock()
        .map_err(|e| AppError::internal(code, message).with_detail(e.to_string()))
}

pub fn get_server_config(state: &State<AppState>, id: &str) -> AppResult<ServerConfig> {
    lock_mutex(&state.servers, "state.servers_lock_failed", "读取服务器列表失败")?
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or_else(|| AppError::not_found("server.not_found", "服务器不存在"))
}
