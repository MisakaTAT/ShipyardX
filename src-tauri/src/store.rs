use tauri::{AppHandle, Manager};

use crate::models::ServerConfig;

pub fn get_data_file(app: &AppHandle) -> std::path::PathBuf {
    let data_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("servers.json")
}

pub fn load_servers(path: &std::path::Path) -> Vec<ServerConfig> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_servers(path: &std::path::Path, servers: &[ServerConfig]) -> Result<(), String> {
    serde_json::to_string_pretty(servers)
        .map_err(|e| e.to_string())
        .and_then(|json| std::fs::write(path, json).map_err(|e| e.to_string()))
}

pub fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    format!("{:x}{:x}", t.as_secs(), t.subsec_nanos())
}
