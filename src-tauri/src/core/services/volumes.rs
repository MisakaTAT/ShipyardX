use serde::Deserialize;
use tauri::State;

use crate::core::docker::{docker_delete, docker_get};
use crate::core::models::DockerVolume;
use crate::core::state::{get_server_config, AppState};

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ApiVolume {
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "Driver")]
    driver: Option<String>,
    #[serde(rename = "Mountpoint")]
    mountpoint: Option<String>,
    #[serde(rename = "Scope")]
    scope: Option<String>,
    #[serde(rename = "CreatedAt")]
    created_at: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ApiVolumesResponse {
    #[serde(rename = "Volumes")]
    volumes: Option<Vec<ApiVolume>>,
}

pub async fn list_volumes(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DockerVolume>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/volumes")?;
        let api: ApiVolumesResponse =
            serde_json::from_str(&resp).map_err(|e| format!("解析存储卷列表失败: {}", e))?;
        let mut list = api.volumes.unwrap_or_default();
        // CreatedAt 一般为 RFC3339 / ISO8601 字符串，可直接按字符串倒序（最新在前）
        // 同一 CreatedAt 下再按 name 排序，避免非稳定排序导致刷新顺序抖动
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| a.name.cmp(&b.name)));
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

pub async fn remove_volume(
    server_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_delete(&server, &format!("/volumes/{}", name)))
        .await
        .map_err(|e| e.to_string())?
}

