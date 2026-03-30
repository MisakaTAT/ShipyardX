use tauri::{AppHandle, Manager};

use crate::core::models::ServerConfig;

const KEYRING_SERVICE: &str = "ShipyardX";

fn keyring_entry(server_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, server_id).map_err(|e| e.to_string())
}

pub fn get_data_file(app: &AppHandle) -> std::path::PathBuf {
    let data_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("servers.json")
}

pub fn load_servers(path: &std::path::Path) -> Vec<ServerConfig> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<ServerConfig>>(&s).ok())
        .map(|mut servers| {
            for s in &mut servers {
                if s.auth_type == "password" {
                    if let Ok(entry) = keyring_entry(&s.id) {
                        if let Ok(p) = entry.get_password() {
                            s.password = Some(p);
                        } else {
                            s.password = None;
                        }
                    } else {
                        s.password = None;
                    }
                }
            }
            servers
        })
        .unwrap_or_default()
}

pub fn save_servers(path: &std::path::Path, servers: &[ServerConfig]) -> Result<(), String> {
    let mut out: Vec<ServerConfig> = servers.to_vec();
    for s in &mut out {
        if s.auth_type == "password" {
            if let Some(p) = s.password.as_deref() {
                let entry = keyring_entry(&s.id)?;
                entry.set_password(p).map_err(|e| e.to_string())?;
            }
            s.password = None;
        } else {
            s.password = None;
        }
    }

    serde_json::to_string_pretty(&out)
        .map_err(|e| e.to_string())
        .and_then(|json| std::fs::write(path, json).map_err(|e| e.to_string()))
}
