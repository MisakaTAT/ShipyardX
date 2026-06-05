use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct SystemInfo {
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
pub struct DaemonConfig {
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
