use tauri::State;

use std::collections::HashMap;

use crate::docker::client::{docker_delete, docker_get, docker_post_json, pretty_json_response};
use crate::error::{AppError, AppResult};
use crate::models::app::volume::Volume;
use crate::models::docker::container::ContainerSummary;
use crate::models::docker::volume::{VolumeCreate, VolumeList};
use crate::state::{AppState, get_server_config};
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_volumes(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Volume>> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/volumes")?;
        let api: VolumeList = serde_json::from_str(&resp)
            .map_err(|e| AppError::internal("volume.list_parse_failed", "解析存储卷列表失败").with_source(e))?;
        let mut list = api.volumes.unwrap_or_default();
        sort_by_created_desc_then_id(
            &mut list,
            |x| x.created_at.clone().unwrap_or_default(),
            |x| x.name.clone().unwrap_or_default(),
        );

        let containers_resp = docker_get(&server, "/containers/json?all=1")?;
        let containers: Vec<ContainerSummary> = serde_json::from_str(&containers_resp)
            .map_err(|e| AppError::internal("volume.container_list_parse_failed", "解析容器列表失败").with_source(e))?;

        let mut used_by: HashMap<String, Vec<String>> = HashMap::new();
        for c in containers {
            let name = c
                .names
                .first()
                .map(|n| n.trim_start_matches('/').to_string())
                .unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            for m in c.mounts {
                if m.mount_type != "volume" {
                    continue;
                }
                if m.name.is_empty() {
                    continue;
                }
                used_by.entry(m.name).or_default().push(name.clone());
            }
        }

        Ok(list
            .into_iter()
            .map(|v| {
                let name = v.name.clone().unwrap_or_default();
                let mut used = used_by.get(&name).cloned().unwrap_or_default();
                used.sort();
                used.dedup();
                Volume {
                    name: name.clone(),
                    driver: v.driver.unwrap_or_default(),
                    mountpoint: v.mountpoint.unwrap_or_default(),
                    scope: v.scope.unwrap_or_default(),
                    created_at: v.created_at.unwrap_or_default(),
                    stack: v
                        .labels
                        .as_ref()
                        .and_then(|m| {
                            m.get("com.docker.compose.project")
                                .or_else(|| m.get("com.docker.stack.namespace"))
                        })
                        .cloned()
                        .unwrap_or_default(),
                    used_by: used.join(", "),
                }
            })
            .collect())
    })
    .await
    .map_err(|e| AppError::internal("task.join", "加载存储卷列表任务执行失败").with_source(e))?
}

pub async fn inspect_volume(server_id: String, name: String, state: State<'_, AppState>) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, &format!("/volumes/{}", name))?;
        pretty_json_response(&resp)
    })
    .await
    .map_err(|e| AppError::internal("task.join", "检查存储卷详情任务执行失败").with_source(e))?
}

pub async fn remove_volume(server_id: String, name: String, state: State<'_, AppState>) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_delete(&server, &format!("/volumes/{}", name)))
        .await
        .map_err(|e| AppError::internal("task.join", "删除存储卷任务执行失败").with_source(e))?
}

pub async fn create_volume(
    server_id: String,
    name: String,
    driver: Option<String>,
    driver_opts: Option<std::collections::HashMap<String, String>>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let name = name.trim().to_string();
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
        .map_err(|e| AppError::internal("task.join", "创建存储卷任务执行失败").with_source(e))?
}
