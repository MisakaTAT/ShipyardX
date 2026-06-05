use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::models::app::appstore::{AppDetail, AppListItem, InstallApp};
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn sync_appstore(app: AppHandle) -> AppResult<String> {
    let handle = app.clone();
    Ok(tokio::task::spawn_blocking(move || {
        let cache_dir = services::appstore::sync_appstore(&handle)?;
        Ok::<String, AppError>(format!("应用商店已同步到: {}", cache_dir.display()))
    })
    .await
    .map_err(AppError::from)??)
}

#[tauri::command]
#[specta::specta]
pub async fn list_apps(app: AppHandle) -> AppResult<Vec<AppListItem>> {
    let handle = app.clone();
    Ok(
        tokio::task::spawn_blocking(move || services::appstore::list_apps(&handle))
            .await
            .map_err(AppError::from)??,
    )
}

#[tauri::command]
#[specta::specta]
pub async fn get_app_detail(app: AppHandle, app_key: String) -> AppResult<AppDetail> {
    let handle = app.clone();
    let key = app_key.clone();
    Ok(
        tokio::task::spawn_blocking(move || services::appstore::get_app_detail(&handle, &key))
            .await
            .map_err(AppError::from)??,
    )
}

#[tauri::command]
#[specta::specta]
pub async fn install_app(
    app: AppHandle,
    server_id: String,
    req: InstallApp,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let handle = app.clone();
    let server = {
        let s = state.servers.lock().unwrap();
        s.iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or_else(|| AppError::not_found("server.not_found", "服务器不存在"))?
    };
    Ok(
        tokio::task::spawn_blocking(move || services::appstore::install_app_inner(&handle, &server, &req))
            .await
            .map_err(AppError::from)??,
    )
}
