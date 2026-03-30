use serde::Deserialize;
use tauri::State;

use crate::core::docker::{docker_delete, docker_get};
use crate::core::models::DockerNetwork;
use crate::core::state::{get_server_config, AppState};

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ApiIpamConfig {
    #[serde(rename = "Subnet")]
    subnet: Option<String>,
    #[serde(rename = "Gateway")]
    gateway: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ApiIpam {
    #[serde(rename = "Config")]
    config: Option<Vec<ApiIpamConfig>>,
}

#[derive(Debug, Deserialize)]
#[serde(default)]
struct ApiNetwork {
    #[serde(rename = "Id")]
    id: Option<String>,
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "Driver")]
    driver: Option<String>,
    #[serde(rename = "Scope")]
    scope: Option<String>,
    #[serde(rename = "IPAM")]
    ipam: Option<ApiIpam>,
    #[serde(rename = "Labels")]
    labels: Option<std::collections::HashMap<String, String>>,
    #[serde(rename = "Created")]
    created: Option<String>,
    #[serde(rename = "Internal")]
    internal: Option<bool>,
    #[serde(rename = "Attachable")]
    attachable: Option<bool>,
}

impl Default for ApiNetwork {
    fn default() -> Self {
        Self {
            id: None,
            name: None,
            driver: None,
            scope: None,
            ipam: None,
            labels: None,
            created: None,
            internal: None,
            attachable: None,
        }
    }
}

pub async fn list_networks(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DockerNetwork>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/networks")?;
        let api: Vec<ApiNetwork> =
            serde_json::from_str(&resp).map_err(|e| format!("解析网络列表失败: {}", e))?;
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

pub async fn remove_network(
    server_id: String,
    network_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_delete(&server, &format!("/networks/{}", network_id)))
        .await
        .map_err(|e| e.to_string())?
}

