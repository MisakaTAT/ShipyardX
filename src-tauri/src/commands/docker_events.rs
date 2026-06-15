use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn start_event_stream(
    server_id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<String> {
    services::docker_events::start_event_stream(server_id, state, app_handle).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_event_stream(server_id: String, state: State<'_, AppState>) -> AppResult<()> {
    services::docker_events::stop_event_stream(server_id, state).await
}
