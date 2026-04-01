use tauri::State;

use crate::docker::client::{docker_delete, docker_get, docker_post_json};
use crate::models::app::docker::DockerVolume;
use crate::models::docker::volume::{VolumeCreate, VolumeList};
use crate::state::{AppState, get_server_config};
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_volumes(server_id: String, state: State<'_, AppState>) -> Result<Vec<DockerVolume>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/volumes")?;
        let api: VolumeList = serde_json::from_str(&resp).map_err(|e| format!("解析存储卷列表失败: {}", e))?;
        let mut list = api.volumes.unwrap_or_default();
        sort_by_created_desc_then_id(
            &mut list,
            |x| x.created_at.clone().unwrap_or_default(),
            |x| x.name.clone().unwrap_or_default(),
        );
        Ok(list
            .into_iter()
            .map(|v| DockerVolume {
                name: v.name.unwrap_or_default(),
                driver: v.driver.unwrap_or_default(),
                mountpoint: v.mountpoint.unwrap_or_default(),
                scope: v.scope.unwrap_or_default(),
                created_at: v.created_at.unwrap_or_default(),
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn remove_volume(server_id: String, name: String, state: State<'_, AppState>) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_delete(&server, &format!("/volumes/{}", name)))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn create_volume(
    server_id: String,
    name: String,
    driver: Option<String>,
    driver_opts: Option<std::collections::HashMap<String, String>>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("存储卷名称不能为空".to_string());
    }
    let driver = driver.unwrap_or_default().trim().to_string();
    let driver = if driver.is_empty() { "local".to_string() } else { driver };

    let driver_opts = driver_opts.filter(|m| !m.is_empty());
    let body = VolumeCreate {
        name,
        driver,
        driver_opts,
    };
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_post_json(&server, "/volumes/create", &body))
        .await
        .map_err(|e| e.to_string())?
}
