use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PortForwardCreate {
    pub server_id: String,
    pub container_id: String,
    pub container_name: Option<String>,
    pub remote_host: String,
    pub remote_port: u16,
    pub container_port: u16,
    pub protocol: String,
    pub local_port: u16,
    pub bind_address: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PortForwardRule {
    pub id: String,
    pub server_id: String,
    pub container_id: String,
    pub container_name: Option<String>,
    pub enabled: bool,
    pub protocol: String,
    pub container_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub local_port: u16,
    #[serde(default = "default_bind_address")]
    pub bind_address: String,
}

fn default_bind_address() -> String {
    "127.0.0.1".to_string()
}

#[derive(Debug, Serialize, Clone)]
pub struct PortForward {
    pub id: String,
    pub server_id: String,
    pub container_id: String,
    pub container_name: Option<String>,
    pub enabled: bool,
    pub protocol: String,
    pub container_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub local_port: u16,
    pub bind_address: String,
    pub running: bool,
    pub tx_bytes: u64,
    pub rx_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}
