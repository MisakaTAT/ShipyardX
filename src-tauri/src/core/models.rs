use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerInfo {
    pub containers: i64,
    pub containers_running: i64,
    pub containers_paused: i64,
    pub containers_stopped: i64,
    pub images: i64,
    pub server_version: String,
    pub api_version: String,
    pub name: String,
    pub ncpu: i64,
    pub mem_total: i64,
    pub os: String,
    pub os_version: String,
    pub kernel_version: String,
    pub architecture: String,
    pub storage_driver: String,
    pub warnings: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub created_ts: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_ts: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerNetwork {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub created_at: String,
    pub subnets: Vec<String>,
    pub gateways: Vec<String>,
    pub labels: Vec<String>,
    pub internal: bool,
    pub attachable: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerVolume {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub scope: String,
    pub created_at: String,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DockerDaemonSettings {
    pub mirror_urls: Vec<String>,
    pub log_rotation: bool,
    pub log_max_size: String,
    pub log_max_file: String,
    pub live_restore: bool,
    pub cgroup_driver: String,
    pub socket_path: String,
}
