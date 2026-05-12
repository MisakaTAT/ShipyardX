use tauri::{AppHandle, State};

use crate::models::app::appstore::{AppDetail, AppListItem, InstallApp};
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn sync_appstore(app: AppHandle) -> Result<String, String> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let cache_dir = services::appstore::sync_appstore(&handle)?;
        Ok(format!("应用商店已同步到: {}", cache_dir.display()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn list_apps(app: AppHandle) -> Result<Vec<AppListItem>, String> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || services::appstore::list_apps(&handle))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn get_app_detail(app: AppHandle, app_key: String) -> Result<AppDetail, String> {
    let handle = app.clone();
    let key = app_key.clone();
    tokio::task::spawn_blocking(move || services::appstore::get_app_detail(&handle, &key))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn install_app(
    app: AppHandle,
    server_id: String,
    req: InstallApp,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let handle = app.clone();
    let server = {
        let s = state.servers.lock().unwrap();
        s.iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or_else(|| "服务器不存在".to_string())?
    };
    tokio::task::spawn_blocking(move || services::appstore::install_app_inner(&handle, &server, &req))
        .await
        .map_err(|e| e.to_string())?
}
