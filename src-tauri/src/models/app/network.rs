use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct NetworkCreate {
    pub server_id: String,
    pub name: String,
    pub driver: Option<String>,
    pub subnet: Option<String>,
    pub gateway: Option<String>,
    pub internal: bool,
    pub attachable: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct LocalAddress {
    pub ip: String,
    pub name: String,
}
