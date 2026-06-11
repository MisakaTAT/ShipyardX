use std::collections::HashMap;

use bollard::models::{ContainerSummary, Volume, VolumeCreateRequest, VolumeListResponse, VolumePruneResponse};
use bollard::query_parameters::{
    ListContainersOptionsBuilder, ListVolumesOptions, PruneVolumesOptions, RemoveVolumeOptions,
};
use log::{debug, info};
use tauri::State;

use crate::docker::client::{map_bollard_error, pretty_json};
use crate::dto::cleanup::CleanupResult;
use crate::dto::volume::Volume as VolumeDto;
use crate::error::AppResult;
use crate::services::support::ServerContext;
use crate::state::AppState;
use crate::utils::formatting::{format_bytes_u64, format_datetime_string, format_time_ago_from_datetime_string};
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_volumes(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<VolumeDto>> {
    debug!(target: "shipyardx_lib::services::volumes", "listing volumes; server_id={}", server_id);
    let docker = ServerContext::from_state(&state, &server_id)?.docker().await?;
    let api: VolumeListResponse = docker
        .list_volumes(None::<ListVolumesOptions>)
        .await
        .map_err(map_bollard_error)?;
    let mut list = api.volumes.unwrap_or_default();
    sort_by_created_desc_then_id(
        &mut list,
        |x| x.created_at.clone().map(|v| v.to_string()).unwrap_or_default(),
        |x| x.name.clone(),
    );

    let containers: Vec<ContainerSummary> = docker
        .list_containers(Some(ListContainersOptionsBuilder::default().all(true).build()))
        .await
        .map_err(map_bollard_error)?;

    let mut used_by: HashMap<String, Vec<String>> = HashMap::new();
    for c in containers {
        let name = c
            .names
            .as_deref()
            .and_then(|names| names.first())
            .map(|n| n.trim_start_matches('/').to_string())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        for m in c.mounts.unwrap_or_default() {
            if m.typ.as_deref() != Some("volume") {
                continue;
            }
            let Some(volume_name) = m.name else {
                continue;
            };
            if volume_name.is_empty() {
                continue;
            }
            used_by.entry(volume_name).or_default().push(name.clone());
        }
    }

    let volumes: Vec<VolumeDto> = list
        .into_iter()
        .map(|v: Volume| {
            let name = v.name.clone();
            let mut used = used_by.get(&name).cloned().unwrap_or_default();
            used.sort();
            used.dedup();
            VolumeDto {
                name: name.clone(),
                driver: v.driver,
                mountpoint: v.mountpoint,
                scope: v.scope.map(|v| v.to_string()).unwrap_or_default(),
                created_at: v
                    .created_at
                    .clone()
                    .map(|v| format_datetime_string(&v.to_string()))
                    .unwrap_or_default(),
                created_ago: v
                    .created_at
                    .clone()
                    .map(|v| format_time_ago_from_datetime_string(&v.to_string()))
                    .unwrap_or_default(),
                stack: v
                    .labels
                    .get("com.docker.compose.project")
                    .or_else(|| v.labels.get("com.docker.stack.namespace"))
                    .cloned()
                    .unwrap_or_default(),
                used_by: used.join(", "),
            }
        })
        .collect();
    info!(target: "shipyardx_lib::services::volumes", "listed volumes; server_id={} count={}", server_id, volumes.len());
    Ok(volumes)
}

pub async fn inspect_volume(server_id: String, name: String, state: State<'_, AppState>) -> AppResult<String> {
    debug!(target: "shipyardx_lib::services::volumes", "inspecting volume; server_id={} volume={}", server_id, name);
    let response = ServerContext::from_state(&state, &server_id)?
        .docker()
        .await?
        .inspect_volume(&name)
        .await
        .map_err(map_bollard_error)?;
    pretty_json(&response)
}

pub async fn remove_volume(server_id: String, name: String, state: State<'_, AppState>) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::volumes", "removing volume; server_id={} volume={}", server_id, name);
    ServerContext::from_state(&state, &server_id)?
        .docker()
        .await?
        .remove_volume(&name, None::<RemoveVolumeOptions>)
        .await
        .map_err(map_bollard_error)
}

pub async fn prune_unused_volumes(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    info!(target: "shipyardx_lib::services::volumes", "pruning volumes; server_id={}", server_id);
    let response: VolumePruneResponse = ServerContext::from_state(&state, &server_id)?
        .docker()
        .await?
        .prune_volumes(None::<PruneVolumesOptions>)
        .await
        .map_err(map_bollard_error)?;

    Ok(CleanupResult {
        deleted_count: response.volumes_deleted.unwrap_or_default().len() as u32,
        reclaimed: format_bytes_u64(response.space_reclaimed.unwrap_or(0) as u64),
    })
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
    let body = VolumeCreateRequest {
        name: Some(name.clone()),
        driver: Some(driver.clone()),
        driver_opts: driver_opts.filter(|m| !m.is_empty()),
        ..Default::default()
    };
    info!(target: "shipyardx_lib::services::volumes", "creating volume; server_id={} volume={} driver={}", server_id, name, driver);
    ServerContext::from_state(&state, &server_id)?
        .docker()
        .await?
        .create_volume(body)
        .await
        .map_err(map_bollard_error)?;
    Ok(())
}
