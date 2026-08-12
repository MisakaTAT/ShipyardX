use tauri::{AppHandle, State};

use crate::dto::appstore::{AppDetail, AppListItem, AppstoreCacheInfo, AppstoreSettings, InstallApp};
use crate::error::AppResult;
use crate::services;
use crate::state::{AppState, get_server_config};

#[tauri::command]
#[specta::specta]
pub async fn sync_appstore(app: AppHandle) -> AppResult<()> {
    services::appstore::sync_appstore(&app).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn list_apps(app: AppHandle, source_id: Option<String>) -> AppResult<Vec<AppListItem>> {
    services::appstore::list_apps(&app, source_id.as_deref()).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_appstore_settings(app: AppHandle) -> AppResult<AppstoreSettings> {
    services::appstore::get_appstore_settings(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_appstore_settings(app: AppHandle, settings: AppstoreSettings) -> AppResult<AppstoreSettings> {
    services::appstore::update_appstore_settings(&app, settings).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_appstore_cache_info(app: AppHandle) -> AppResult<AppstoreCacheInfo> {
    services::appstore::get_appstore_cache_info(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn clear_appstore_cache(app: AppHandle) -> AppResult<()> {
    services::appstore::clear_appstore_cache(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_app_detail(app: AppHandle, source_id: Option<String>, app_key: String) -> AppResult<AppDetail> {
    services::appstore::get_app_detail(&app, source_id.as_deref(), &app_key).await
}

#[tauri::command]
#[specta::specta]
pub async fn install_app(
    app: AppHandle,
    server_id: String,
    req: InstallApp,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    services::appstore::install_app_inner(&app, &server, &req).await
}
