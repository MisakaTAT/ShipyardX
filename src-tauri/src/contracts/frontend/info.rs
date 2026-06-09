use serde::Serialize;
use specta::Type;
use crate::utils::serde_string::i64_string;

#[derive(Debug, Serialize, Clone, Type)]
pub struct DockerEngineInfo {
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub containers: i64,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub containers_running: i64,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub containers_paused: i64,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub containers_stopped: i64,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub images: i64,
    pub server_version: String,
    pub api_version: String,
    pub name: String,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub ncpu: i64,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub mem_total: i64,
    pub os: String,
    pub os_version: String,
    pub kernel_version: String,
    pub architecture: String,
    pub storage_driver: String,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub warnings: i64,
}
