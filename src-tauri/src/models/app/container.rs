use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ip: String,
    pub ports: String,
    pub created_ts: i64,
}

#[derive(Serialize, Clone)]
pub struct ContainerStats {
    pub cpu_percent: f64,
    pub mem_usage: u64,
    pub mem_limit: u64,
    pub mem_percent: f64,
    pub net_rx: u64,
    pub net_tx: u64,
    pub blk_read: u64,
    pub blk_write: u64,
}

#[derive(Debug, Deserialize)]
pub struct RunContainer {
    pub image: String,
    pub name: Option<String>,
    #[serde(default)]
    pub env: Vec<String>,
    #[serde(default)]
    pub ports: Vec<RunContainerPortSpec>,
    #[serde(default)]
    pub volumes: Vec<RunContainerVolumeSpec>,
    pub restart_policy: String,
    #[serde(default)]
    pub restart_max_retry: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct RunContainerPortSpec {
    pub container_port: u16,
    pub host_port: Option<u16>,
    #[serde(default = "default_port_protocol")]
    pub protocol: String,
}

fn default_port_protocol() -> String {
    "tcp".to_string()
}

#[derive(Debug, Deserialize)]
pub struct RunContainerVolumeSpec {
    pub host_path: String,
    pub container_path: String,
    #[serde(default)]
    pub read_only: bool,
}
