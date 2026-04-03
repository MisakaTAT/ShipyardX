use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DaemonSettings {
    pub mirror_urls: Vec<String>,
    pub log_rotation: bool,
    pub log_max_size: String,
    pub log_max_file: String,
    pub live_restore: bool,
    pub cgroup_driver: String,
    pub socket_path: String,
}
