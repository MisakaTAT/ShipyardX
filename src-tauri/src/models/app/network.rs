use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
pub struct Network {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub created_at: String,
    pub subnets: Vec<String>,
    pub gateways: Vec<String>,
    pub labels: Vec<String>,
    pub internal: bool,
    pub attachable: bool,
}

#[derive(Debug, Deserialize)]
pub struct NetworkCreate {
    pub name: String,
    pub driver: Option<String>,
    pub subnet: Option<String>,
    pub gateway: Option<String>,
    pub internal: bool,
    pub attachable: bool,
}
