use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct DockerVersion {
    #[serde(rename = "ApiVersion")]
    pub api_version: String,
}

#[derive(Deserialize)]
pub struct DockerError {
    pub message: Option<String>,
}

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
pub struct ImageSummary {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "RepoTags")]
    pub repo_tags: Option<Vec<String>>,
    #[serde(rename = "Size")]
    pub size: i64,
    #[serde(rename = "Created")]
    pub created: i64,
}
