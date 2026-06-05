use tauri::{AppHandle, State};

use crate::contracts::frontend::appstore::{AppDetail, AppListItem, InstallApp};
use crate::error::{AppError, AppResult};
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn sync_appstore(app: AppHandle) -> AppResult<String> {
    let cache_dir = services::appstore::sync_appstore(&app).await?;
    Ok(format!("应用商店已同步到: {}", cache_dir.display()))
}

#[tauri::command]
#[specta::specta]
pub async fn list_apps(app: AppHandle) -> AppResult<Vec<AppListItem>> {
    Ok(services::appstore::list_apps(&app).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn get_app_detail(app: AppHandle, app_key: String) -> AppResult<AppDetail> {
    Ok(services::appstore::get_app_detail(&app, &app_key).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn install_app(
    app: AppHandle,
    server_id: String,
    req: InstallApp,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let server = {
        let s = state.servers.lock().unwrap();
        s.iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or_else(|| AppError::not_found("server.not_found", "服务器不存在"))?
    };
    Ok(services::appstore::install_app_inner(&app, &server, &req).await?)
}
