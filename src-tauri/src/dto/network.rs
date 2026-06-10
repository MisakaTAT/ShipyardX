use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Serialize, Clone, Type)]
pub struct Network {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub created_at: String,
    pub created_ago: String,
    pub subnets: Vec<String>,
    pub gateways: Vec<String>,
    pub labels: Vec<String>,
    pub internal: bool,
    pub attachable: bool,
}

#[derive(Debug, Deserialize, Type)]
pub struct NetworkCreate {
    pub name: String,
    pub driver: Option<String>,
    pub subnet: Option<String>,
    pub gateway: Option<String>,
    pub internal: bool,
    pub attachable: bool,
}
