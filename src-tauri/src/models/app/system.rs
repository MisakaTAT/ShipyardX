use serde::{Deserialize, Serialize};

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
pub struct DockerDaemonUpdate {
    pub server_id: String,
    pub mirror_urls: Vec<String>,
    pub log_rotation: bool,
    pub log_max_size: String,
    pub log_max_file: String,
    pub live_restore: bool,
    pub cgroup_driver: String,
    pub socket_path: String,
    pub sudo_password: Option<String>,
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
