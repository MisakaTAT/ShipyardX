use tauri::State;

use crate::docker::client::{docker_delete, docker_get, docker_post_json};
use crate::models::app::docker::DockerNetwork;
use crate::models::app::network::NetworkCreate;
use crate::models::docker::network::{self, Network, NetworkCreateIpam, NetworkCreateIpamConfig};
use crate::state::{AppState, get_server_config};

pub async fn list_networks(server_id: String, state: State<'_, AppState>) -> Result<Vec<DockerNetwork>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/networks")?;
        let api: Vec<Network> = serde_json::from_str(&resp).map_err(|e| format!("解析网络列表失败: {}", e))?;
        // 按创建时间倒序（最新在前）；字段缺失时排在后面
        let mut api = api;
        api.sort_by(|a, b| b.created.cmp(&a.created));
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

                DockerNetwork {
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
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn remove_network(server_id: String, network_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_delete(&server, &format!("/networks/{}", network_id)))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn create_network(req: NetworkCreate, state: State<'_, AppState>) -> Result<(), String> {
    let NetworkCreate {
        server_id,
        name,
        driver,
        subnet,
        gateway,
        internal,
        attachable,
    } = req;
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("网络名称不能为空".to_string());
    }
    let driver = driver.unwrap_or_default().trim().to_string();
    let driver = if driver.is_empty() {
        "bridge".to_string()
    } else {
        driver
    };

    let sub = subnet.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let gw = gateway.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let ipam = sub.map(|s| NetworkCreateIpam {
        driver: "default".to_string(),
        config: vec![NetworkCreateIpamConfig {
            subnet: Some(s.to_string()),
            gateway: gw.map(|g| g.to_string()),
        }],
    });

    let body = network::NetworkCreate {
        name,
        driver,
        check_duplicate: true,
        internal: if internal { Some(true) } else { None },
        attachable: if attachable { Some(true) } else { None },
        ipam,
    };
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_post_json(&server, "/networks/create", &body))
        .await
        .map_err(|e| e.to_string())?
}
