mod app_state;

use std::sync::{Mutex, MutexGuard};

pub use app_state::AppState;
pub(crate) use app_state::{
    EventStreamHandle, PortForwardRuntimeHandle, PortForwardRuntimeState, StreamHandle, TerminalHandle,
    TerminalHandshakeState, TerminalMsg,
};

use tauri::State;
use tokio::sync::watch;

use crate::dto::server::ServerConfig;
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

pub(crate) fn register_stream_handle(
    state: &State<AppState>,
    stream_id: String,
    stop_tx: watch::Sender<bool>,
    code: &'static str,
    message: &'static str,
) -> AppResult<()> {
    lock_mutex(&state.streams, code, message)?.insert(stream_id, StreamHandle { stop_tx });
    Ok(())
}

pub(crate) fn remove_stream_handle(
    state: &State<AppState>,
    stream_id: &str,
    code: &'static str,
    message: &'static str,
) -> AppResult<Option<StreamHandle>> {
    Ok(lock_mutex(&state.streams, code, message)?.remove(stream_id))
}

pub(crate) fn register_event_stream_handle(
    state: &State<AppState>,
    server_id: String,
    handle: EventStreamHandle,
    code: &'static str,
    message: &'static str,
) -> AppResult<()> {
    lock_mutex(&state.event_streams, code, message)?.insert(server_id, handle);
    Ok(())
}

pub(crate) fn remove_event_stream_handle(
    state: &State<AppState>,
    server_id: &str,
    code: &'static str,
    message: &'static str,
) -> AppResult<Option<EventStreamHandle>> {
    Ok(lock_mutex(&state.event_streams, code, message)?.remove(server_id))
}
