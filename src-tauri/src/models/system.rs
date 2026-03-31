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

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct DockerInfoResp {
    #[serde(rename = "Containers")]
    pub containers: Option<i64>,
    #[serde(rename = "ContainersRunning")]
    pub containers_running: Option<i64>,
    #[serde(rename = "ContainersPaused")]
    pub containers_paused: Option<i64>,
    #[serde(rename = "ContainersStopped")]
    pub containers_stopped: Option<i64>,
    #[serde(rename = "Images")]
    pub images: Option<i64>,
    #[serde(rename = "ServerVersion")]
    pub server_version: Option<String>,
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "NCPU")]
    pub ncpu: Option<i64>,
    #[serde(rename = "MemTotal")]
    pub mem_total: Option<i64>,
    #[serde(rename = "OperatingSystem")]
    pub os: Option<String>,
    #[serde(rename = "OSVersion")]
    pub os_version: Option<String>,
    #[serde(rename = "KernelVersion")]
    pub kernel_version: Option<String>,
    #[serde(rename = "Architecture")]
    pub architecture: Option<String>,
    #[serde(rename = "Driver")]
    pub storage_driver: Option<String>,
    #[serde(rename = "Warnings")]
    pub warnings: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct DockerDaemonConfig {
    #[serde(rename = "registry-mirrors", skip_serializing_if = "Option::is_none")]
    pub registry_mirrors: Option<Vec<String>>,
    #[serde(rename = "log-driver", skip_serializing_if = "Option::is_none")]
    pub log_driver: Option<String>,
    #[serde(rename = "log-opts", skip_serializing_if = "Option::is_none")]
    pub log_opts: Option<std::collections::HashMap<String, String>>,
    #[serde(rename = "live-restore", skip_serializing_if = "Option::is_none")]
    pub live_restore: Option<bool>,
    #[serde(rename = "exec-opts", skip_serializing_if = "Option::is_none")]
    pub exec_opts: Option<Vec<String>>,
    #[serde(rename = "hosts", skip_serializing_if = "Option::is_none")]
    pub hosts: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, serde_json::Value>,
}
