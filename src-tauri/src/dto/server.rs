use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct HostKeyPrompt {
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
    pub known_fingerprint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct KnownHostEntry {
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
}
