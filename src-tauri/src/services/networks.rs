use tauri::State;

use log::{debug, info};

use crate::contracts::docker_api::network::{
    self as engine_network, NetworkCreateIpam, NetworkCreateIpamConfig, NetworkPruneResponse, NetworkSummary,
};
use crate::contracts::frontend::cleanup::CleanupResult;
use crate::contracts::frontend::network::{Network, NetworkCreate};
use crate::docker::client::{
    docker_delete, docker_get, docker_post_json, docker_post_json_response, pretty_json_response,
};
use crate::error::{AppError, AppResult};
use crate::state::{AppState, get_server_config};
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_networks(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Network>> {
    debug!(target: "shipyardx_lib::services::networks", "listing networks; server_id={}", server_id);
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get(&server, "/networks").await?;
    let mut api: Vec<NetworkSummary> = serde_json::from_str(&resp)
        .map_err(|e| AppError::internal("network.list_parse_failed", "解析网络列表失败").with_source(e))?;
    sort_by_created_desc_then_id(
        &mut api,
        |x| x.created.clone().unwrap_or_default(),
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
                .map(|(k, v)| if v.is_empty() { k } else { format!("{}={}", k, v) })
                .collect();
            labels.sort();

            Network {
                id: n.id.unwrap_or_default(),
                name: n.name.unwrap_or_default(),
                driver: n.driver.unwrap_or_default(),
                scope: n.scope.unwrap_or_default(),
                created_at: n.created.unwrap_or_default(),
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
    let resp = docker_get(&server, &format!("/networks/{}", network_id)).await?;
    pretty_json_response(&resp)
}

pub async fn remove_network(server_id: String, network_id: String, state: State<'_, AppState>) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::networks", "removing network; server_id={} network_id={}", server_id, network_id);
    let server = get_server_config(&state, &server_id)?;
    docker_delete(&server, &format!("/networks/{}", network_id)).await
}

pub async fn prune_unused_networks(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    info!(target: "shipyardx_lib::services::networks", "pruning networks; server_id={}", server_id);
    let server = get_server_config(&state, &server_id)?;
    let raw = docker_post_json_response(&server, "/networks/prune", &serde_json::json!({})).await?;
    let response: NetworkPruneResponse = serde_json::from_str(raw.trim())
        .map_err(|e| AppError::internal("network.prune_parse_failed", "解析网络清理结果失败").with_source(e))?;

    Ok(CleanupResult {
        deleted_count: response.networks_deleted.len() as u32,
        reclaimed_bytes: 0,
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
    let ipam = sub.map(|s| NetworkCreateIpam {
        driver: "default".to_string(),
        config: vec![NetworkCreateIpamConfig {
            subnet: Some(s.to_string()),
            gateway: gw.map(|g| g.to_string()),
        }],
    });

    let body = engine_network::NetworkCreate {
        name,
        driver,
        check_duplicate: true,
        internal: if params.internal { Some(true) } else { None },
        attachable: if params.attachable { Some(true) } else { None },
        ipam,
    };
    info!(target: "shipyardx_lib::services::networks", "creating network; server_id={} name={} driver={}", server_id, body.name, body.driver);
    let server = get_server_config(&state, &server_id)?;
    docker_post_json(&server, "/networks/create", &body).await
}
