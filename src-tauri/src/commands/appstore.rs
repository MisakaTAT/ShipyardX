use tauri::{AppHandle, State};

use crate::models::app::appstore::{AppDetail, AppListItem, InstallAppRequest, InstalledApp};
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
    req: InstallAppRequest,
    state: State<'_, AppState>,
) -> Result<InstalledApp, String> {
    let handle = app.clone();
    let server = {
        let s = state.servers.lock().unwrap();
        s.iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or_else(|| "服务器不存在".to_string())?
    };
    tokio::task::spawn_blocking(move || {
        services::appstore::install_app_inner(&handle, &server, &req)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn uninstall_app(
    app: AppHandle,
    install_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let handle = app.clone();
    let installed = services::appstore::load_installed_for_handle(&handle);
    let target = installed
        .iter()
        .find(|a| a.install_id == install_id)
        .cloned()
        .ok_or_else(|| "应用安装记录不存在".to_string())?;
    let server = {
        let s = state.servers.lock().unwrap();
        s.iter()
            .find(|s| s.id == target.server_id)
            .cloned()
            .ok_or_else(|| "服务器不存在".to_string())?
    };
    let remote_base = target.install_path.clone();
    tokio::task::spawn_blocking(move || {
        services::appstore::uninstall_app_inner(&handle, &install_id, &server, &remote_base)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn list_installed_apps(
    app: AppHandle,
    server_id: Option<String>,
) -> Result<Vec<InstalledApp>, String> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        Ok(services::appstore::list_installed(&handle, server_id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn operate_installed_app(
    app: AppHandle,
    install_id: String,
    operation: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let handle = app.clone();
    let installed = services::appstore::load_installed_for_handle(&handle);
    let target = installed
        .iter()
        .find(|a| a.install_id == install_id)
        .cloned()
        .ok_or_else(|| "应用安装记录不存在".to_string())?;
    let server = {
        let s = state.servers.lock().unwrap();
        s.iter()
            .find(|s| s.id == target.server_id)
            .cloned()
            .ok_or_else(|| "服务器不存在".to_string())?
    };
    let remote_base = target.install_path.clone();
    let id = install_id.clone();
    let op = operation.clone();
    tokio::task::spawn_blocking(move || {
        services::appstore::operate_app_inner(&handle, &id, &op, &server, &remote_base)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn get_installed_app_status(
    app: AppHandle,
    install_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let handle = app.clone();
    let installed = services::appstore::load_installed_for_handle(&handle);
    let target = installed
        .iter()
        .find(|a| a.install_id == install_id)
        .cloned()
        .ok_or_else(|| "应用安装记录不存在".to_string())?;
    let server = {
        let s = state.servers.lock().unwrap();
        s.iter()
            .find(|s| s.id == target.server_id)
            .cloned()
            .ok_or_else(|| "服务器不存在".to_string())?
    };
    let remote_base = target.install_path.clone();
    tokio::task::spawn_blocking(move || {
        services::appstore::get_app_status_inner(&server, &remote_base)
    })
    .await
    .map_err(|e| e.to_string())?
}
