use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Serialize, Clone, Type)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub stack: String,
    pub ip: String,
    pub ports: String,
    pub created_at: String,
    pub created_ago: String,
    pub volumes: Vec<String>,
}

#[derive(Serialize, Clone, Type)]
pub struct ContainerStats {
    pub cpu_percent: f64,
    pub mem_percent: f64,
    pub mem_usage: String,
    pub mem_limit: String,
    pub mem: String,
    pub net_rx: String,
    pub net_tx: String,
    pub net: String,
    pub blk_read: String,
    pub blk_write: String,
    pub blk: String,
}

#[derive(Debug, Deserialize, Type)]
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
    #[serde(default)]
    pub publish_all_ports: bool,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub ipv4_address: String,
    #[serde(default)]
    pub ipv6_address: String,
    #[serde(default)]
    pub command: Vec<String>,
    #[serde(default)]
    pub entrypoint: Vec<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub auto_remove: bool,
    #[serde(default)]
    pub privileged: bool,
    #[serde(default)]
    pub tty: bool,
    #[serde(default)]
    pub open_stdin: bool,
    #[serde(default)]
    pub cpu_shares: u32,
    #[serde(default)]
    pub cpu_quota_cores: f64,
    #[serde(default)]
    pub memory_mb: u32,
}

#[derive(Debug, Deserialize, Type)]
pub struct RunContainerPortSpec {
    pub container_port: u16,
    pub host_port: Option<u16>,
    #[serde(default = "default_port_protocol")]
    pub protocol: String,
}

fn default_port_protocol() -> String {
    "tcp".to_string()
}

#[derive(Debug, Deserialize, Type)]
pub struct RunContainerVolumeSpec {
    pub host_path: String,
    pub container_path: String,
    #[serde(default)]
    pub read_only: bool,
}
