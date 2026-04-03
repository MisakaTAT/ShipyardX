use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct ContainerSummary {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Names")]
    pub names: Vec<String>,
    #[serde(rename = "Image")]
    pub image: String,
    #[serde(rename = "State")]
    pub state: String,
    #[serde(rename = "Status")]
    pub status: String,
    #[serde(rename = "Ports")]
    pub ports: Vec<PortBinding>,
    #[serde(rename = "Created")]
    pub created: i64,
    #[serde(rename = "NetworkSettings", default)]
    pub network_settings: ContainerNetworkSettings,
}

#[derive(Deserialize, Default)]
pub struct ContainerNetworkSettings {
    #[serde(rename = "Networks", default)]
    pub networks: HashMap<String, ContainerNetworkEndpoint>,
}

#[derive(Deserialize, Default)]
pub struct ContainerNetworkEndpoint {
    #[serde(rename = "IPAddress", default)]
    pub ip_address: String,
}

#[derive(Deserialize)]
pub struct PortBinding {
    #[serde(rename = "IP")]
    pub ip: Option<String>,
    #[serde(rename = "PrivatePort")]
    pub private_port: u16,
    #[serde(rename = "PublicPort")]
    pub public_port: Option<u16>,
    #[serde(rename = "Type")]
    pub port_type: String,
}

#[derive(Deserialize)]
pub struct ContainerCreateResponse {
    #[serde(rename = "Id")]
    pub id: String,
}

#[derive(Serialize)]
pub struct ContainerCreate {
    #[serde(rename = "Image")]
    pub image: String,
    #[serde(rename = "Env", skip_serializing_if = "Vec::is_empty")]
    pub env: Vec<String>,
    #[serde(rename = "ExposedPorts", skip_serializing_if = "HashMap::is_empty")]
    pub exposed_ports: HashMap<String, serde_json::Value>,
    #[serde(rename = "HostConfig")]
    pub host_config: ContainerCreateHostConfig,
}

#[derive(Serialize)]
pub struct ContainerCreateHostConfig {
    #[serde(rename = "PortBindings", skip_serializing_if = "HashMap::is_empty")]
    pub port_bindings: HashMap<String, Vec<ContainerCreatePortBinding>>,
    #[serde(rename = "Binds", skip_serializing_if = "Vec::is_empty")]
    pub binds: Vec<String>,
    #[serde(rename = "RestartPolicy")]
    pub restart_policy: ContainerCreateRestartPolicy,
}

#[derive(Serialize)]
pub struct ContainerCreatePortBinding {
    #[serde(rename = "HostIp")]
    pub host_ip: String,
    #[serde(rename = "HostPort")]
    pub host_port: String,
}

#[derive(Serialize)]
pub struct ContainerCreateRestartPolicy {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "MaximumRetryCount")]
    pub maximum_retry_count: u32,
}
