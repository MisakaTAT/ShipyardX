use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct DockerEngineInfo {
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
