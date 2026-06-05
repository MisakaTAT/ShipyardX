use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Deserialize, Type)]
pub struct DaemonUpdate {
    pub mirror_urls: Vec<String>,
    pub log_rotation: bool,
    pub log_max_size: String,
    pub log_max_file: String,
    pub live_restore: bool,
    pub cgroup_driver: String,
    pub socket_path: String,
    pub sudo_password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct DaemonSettings {
    pub mirror_urls: Vec<String>,
    pub log_rotation: bool,
    pub log_max_size: String,
    pub log_max_file: String,
    pub live_restore: bool,
    pub cgroup_driver: String,
    pub socket_path: String,
}
