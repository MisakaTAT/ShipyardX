use bollard::models::{Ipam, IpamConfig, Network as BollardNetwork, NetworkCreateRequest, NetworkInspect};
use bollard::query_parameters::{InspectNetworkOptions, ListNetworksOptions, PruneNetworksOptions};
use log::{debug, info};
use tauri::State;

use crate::docker::client::{docker, map_bollard_error, pretty_json};
use crate::dto::cleanup::CleanupResult;
use crate::dto::network::{Network, NetworkCreate};
use crate::error::AppResult;
use crate::state::{AppState, get_server_config};
use crate::utils::formatting::{format_bytes_u64, format_datetime_string, format_time_ago_from_datetime_string};
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_networks(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Network>> {
    debug!(target: "shipyardx_lib::services::networks", "listing networks; server_id={}", server_id);
    let server = get_server_config(&state, &server_id)?;
    let docker = docker(&server).await?;
    let mut api: Vec<BollardNetwork> = docker
        .list_networks(None::<ListNetworksOptions>)
        .await
        .map_err(map_bollard_error)?;
    sort_by_created_desc_then_id(
        &mut api,
        |x| x.created.as_ref().map(|v| v.to_string()).unwrap_or_default(),
        |x| x.id.clone().unwrap_or_default(),
    );
    let networks: Vec<Network> = api
        .into_iter()
        .map(|n| {
            let mut subnets = Vec::new();
            let mut gateways = Vec::new();
            if let Some(cfgs) = n.ipam.and_then(|i| i.config) {
                for c in cfgs {
                    subnets.push(c.subnet.unwrap_or_default());
                    gateways.push(c.gateway.unwrap_or_default());
                }
            }
            let mut labels: Vec<String> = n
                .labels
                .unwrap_or_default()
                .into_iter()
                .map(|(k, v): (String, String)| if v.is_empty() { k } else { format!("{k}={v}") })
                .collect();
            labels.sort();
            Network {
                id: n.id.unwrap_or_default(),
                name: n.name.unwrap_or_default(),
                driver: n.driver.unwrap_or_default(),
                scope: n.scope.unwrap_or_default(),
                created_at: n
                    .created
                    .as_ref()
                    .map(|v| format_datetime_string(&v.to_string()))
                    .unwrap_or_default(),
                created_ago: n
                    .created
                    .as_ref()
                    .map(|v| format_time_ago_from_datetime_string(&v.to_string()))
                    .unwrap_or_default(),
                subnets,
                gateways,
                labels,
                internal: n.internal.unwrap_or(false),
                attachable: n.attachable.unwrap_or(false),
            }
        })
        .collect();
    info!(target: "shipyardx_lib::services::networks", "listed networks; server_id={} count={}", server_id, networks.len());
    Ok(networks)
}

pub async fn inspect_network(server_id: String, network_id: String, state: State<'_, AppState>) -> AppResult<String> {
    debug!(target: "shipyardx_lib::services::networks", "inspecting network; server_id={} network_id={}", server_id, network_id);
    let server = get_server_config(&state, &server_id)?;
    let response: NetworkInspect = docker(&server)
        .await?
        .inspect_network(&network_id, None::<InspectNetworkOptions>)
        .await
        .map_err(map_bollard_error)?;
    pretty_json(&response)
}

pub async fn remove_network(server_id: String, network_id: String, state: State<'_, AppState>) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::networks", "removing network; server_id={} network_id={}", server_id, network_id);
    let server = get_server_config(&state, &server_id)?;
    docker(&server)
        .await?
        .remove_network(&network_id)
        .await
        .map_err(map_bollard_error)
}

pub async fn prune_unused_networks(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    info!(target: "shipyardx_lib::services::networks", "pruning networks; server_id={}", server_id);
    let server = get_server_config(&state, &server_id)?;
    let response = docker(&server)
        .await?
        .prune_networks(None::<PruneNetworksOptions>)
        .await
        .map_err(map_bollard_error)?;

    Ok(CleanupResult {
        deleted_count: response.networks_deleted.unwrap_or_default().len() as u32,
        reclaimed: format_bytes_u64(0),
    })
}

pub async fn create_network(server_id: String, params: NetworkCreate, state: State<'_, AppState>) -> AppResult<()> {
    let name = params.name.trim().to_string();
    let driver = params.driver.unwrap_or_default().trim().to_string();
    let driver = if driver.is_empty() {
        "bridge".to_string()
    } else {
        driver
    };

    let sub = params.subnet.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let gw = params.gateway.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let ipam = sub.map(|s| Ipam {
        driver: Some("default".to_string()),
        config: Some(vec![IpamConfig {
            subnet: Some(s.to_string()),
            gateway: gw.map(|g| g.to_string()),
            ..Default::default()
        }]),
        ..Default::default()
    });

    let body = NetworkCreateRequest {
        name,
        driver: Some(driver),
        internal: params.internal.then_some(true),
        attachable: params.attachable.then_some(true),
        ipam,
        ..Default::default()
    };
    info!(target: "shipyardx_lib::services::networks", "creating network; server_id={} name={} driver={}", server_id, body.name, body.driver.as_deref().unwrap_or_default());
    let server = get_server_config(&state, &server_id)?;
    docker(&server)
        .await?
        .create_network(body)
        .await
        .map_err(map_bollard_error)?;
    Ok(())
}
