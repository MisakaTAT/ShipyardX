use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct PortForwardError {
    pub error: AppError,
    #[specta(type = specta_typescript::Number)]
    pub at_ms: i64,
}

impl PortForwardError {
    pub fn now(error: AppError) -> Self {
        Self {
            error,
            at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|since| since.as_millis() as i64)
                .unwrap_or(0),
        }
    }
}

#[cfg(test)]
mod tests {
    use specta::Types;
    use specta_typescript::Typescript;

    use super::PortForwardError;

    #[test]
    fn exports_error_timestamp_as_a_typescript_number() {
        let types = Types::default().register::<PortForwardError>();
        let bindings = Typescript::default()
            .export(&types, specta_serde::Format)
            .expect("PortForwardError should export to TypeScript");

        assert!(bindings.contains("at_ms: number"));
    }
}

#[derive(Debug, Serialize, Clone, Type)]
pub struct LocalAddress {
    pub ip: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct PortForwardCreate {
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

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
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

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
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
    pub tx_speed_bps: f64,
    pub rx_speed_bps: f64,
    pub last_error: Option<PortForwardError>,
}
