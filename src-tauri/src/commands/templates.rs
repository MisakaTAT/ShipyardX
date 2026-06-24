use tauri::{AppHandle, State};

use crate::dto::templates::{AppTemplate, AppTemplateField, AppTemplateInput, DeployTemplate};
use crate::error::AppResult;
use crate::services;
use crate::state::{AppState, get_server_config};

#[tauri::command]
#[specta::specta]
pub async fn list_templates(app: AppHandle) -> AppResult<Vec<AppTemplate>> {
    services::templates::list_templates(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_template(app: AppHandle, input: AppTemplateInput) -> AppResult<AppTemplate> {
    services::templates::create_template(&app, input).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_template(app: AppHandle, template_id: String, input: AppTemplateInput) -> AppResult<AppTemplate> {
    services::templates::update_template(&app, template_id, input).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_template(app: AppHandle, template_id: String) -> AppResult<()> {
    services::templates::delete_template(&app, template_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn extract_template_fields(compose: String) -> AppResult<Vec<AppTemplateField>> {
    services::templates::extract_template_fields(compose).await
}

#[tauri::command]
#[specta::specta]
pub async fn import_template_file(file_path: String) -> AppResult<crate::dto::templates::AppTemplateFile> {
    services::templates::import_template_file(file_path).await
}

#[tauri::command]
#[specta::specta]
pub async fn deploy_template(
    app: AppHandle,
    server_id: String,
    req: DeployTemplate,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    services::templates::deploy_template_inner(&app, &server, &req).await
}
