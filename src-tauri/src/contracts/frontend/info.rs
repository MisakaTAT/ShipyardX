use serde::Serialize;
use specta::Type;

#[derive(Debug, Serialize, Clone, Type)]
pub struct DockerEngineInfo {
    pub containers: String,
    pub containers_running: String,
    pub containers_paused: String,
    pub containers_stopped: String,
    pub images: String,
    pub containers_running_percent: f64,
    pub containers_paused_percent: f64,
    pub containers_stopped_percent: f64,
    pub server_version: String,
    pub api_version: String,
    pub name: String,
    pub ncpu: String,
    pub mem_total: String,
    pub os: String,
    pub os_version: String,
    pub kernel_version: String,
    pub architecture: String,
    pub storage_driver: String,
    pub warnings: String,
}
