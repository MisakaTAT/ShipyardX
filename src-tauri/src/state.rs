mod app_state;

use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

pub use app_state::AppState;
pub(crate) use app_state::{
    EventStreamHandle, PortForwardRuntimeHandle, PortForwardRuntimeState, StreamHandle, TerminalHandle,
    TerminalHandshakeState, TerminalMsg,
};

use tauri::State;
use tokio::sync::watch;

use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};

pub(crate) fn lock_mutex<'a, T>(mutex: &'a Mutex<T>, code: &'static str) -> AppResult<MutexGuard<'a, T>> {
    mutex
        .lock()
        .map_err(|e| AppError::internal(code).with_detail(e.to_string()))
}

pub(crate) fn lock_read<'a, T>(lock: &'a RwLock<T>, code: &'static str) -> AppResult<RwLockReadGuard<'a, T>> {
    lock.read()
        .map_err(|e| AppError::internal(code).with_detail(e.to_string()))
}

pub(crate) fn lock_write<'a, T>(lock: &'a RwLock<T>, code: &'static str) -> AppResult<RwLockWriteGuard<'a, T>> {
    lock.write()
        .map_err(|e| AppError::internal(code).with_detail(e.to_string()))
}

pub fn get_server_config(state: &State<AppState>, id: &str) -> AppResult<ServerConfig> {
    lock_read(&state.servers, "state.servers_lock_failed")?
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or_else(|| AppError::not_found("server.not_found"))
}

pub(crate) fn register_stream_handle(
    state: &State<AppState>,
    stream_id: String,
    stop_tx: watch::Sender<bool>,
    code: &'static str,
) -> AppResult<()> {
    lock_mutex(&state.streams, code)?.insert(stream_id, StreamHandle { stop_tx });
    Ok(())
}

pub(crate) fn remove_stream_handle(
    state: &State<AppState>,
    stream_id: &str,
    code: &'static str,
) -> AppResult<Option<StreamHandle>> {
    Ok(lock_mutex(&state.streams, code)?.remove(stream_id))
}

pub(crate) fn register_event_stream_handle(
    state: &State<AppState>,
    server_id: String,
    handle: EventStreamHandle,
    code: &'static str,
) -> AppResult<()> {
    lock_write(&state.event_streams, code)?.insert(server_id, handle);
    Ok(())
}

pub(crate) fn remove_event_stream_handle(
    state: &State<AppState>,
    server_id: &str,
    code: &'static str,
) -> AppResult<Option<EventStreamHandle>> {
    Ok(lock_write(&state.event_streams, code)?.remove(server_id))
}
