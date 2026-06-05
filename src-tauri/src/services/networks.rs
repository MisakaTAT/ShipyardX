use tauri::State;

use crate::contracts::docker_api::network::{
    self as engine_network, NetworkCreateIpam, NetworkCreateIpamConfig, NetworkSummary,
};
use crate::contracts::frontend::network::{Network, NetworkCreate};
use crate::docker::client::{docker_delete_async, docker_get_async, docker_post_json_async, pretty_json_response};
use crate::error::{AppError, AppResult};
use crate::state::{AppState, get_server_config};
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_networks(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Network>> {
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(&server, "/networks").await?;
    let mut api: Vec<NetworkSummary> = serde_json::from_str(&resp)
        .map_err(|e| AppError::internal("network.list_parse_failed", "解析网络列表失败").with_source(e))?;
    sort_by_created_desc_then_id(
        &mut api,
        |x| x.created.clone().unwrap_or_default(),
        |x| x.id.clone().unwrap_or_default(),
    );
    Ok(api
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
        .collect())
}

pub async fn inspect_network(server_id: String, network_id: String, state: State<'_, AppState>) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(&server, &format!("/networks/{}", network_id)).await?;
    pretty_json_response(&resp)
}

pub async fn remove_network(server_id: String, network_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    docker_delete_async(&server, &format!("/networks/{}", network_id)).await
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
    let server = get_server_config(&state, &server_id)?;
    docker_post_json_async(&server, "/networks/create", &body).await
}
