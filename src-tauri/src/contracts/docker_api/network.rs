use serde::{Deserialize, Serialize};

use crate::contracts::docker_api::common::null_vec_default;

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct IpamConfig {
    #[serde(rename = "Subnet")]
    pub subnet: Option<String>,
    #[serde(rename = "Gateway")]
    pub gateway: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Ipam {
    #[serde(rename = "Config")]
    pub config: Option<Vec<IpamConfig>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct NetworkSummary {
    #[serde(rename = "Id")]
    pub id: Option<String>,
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "Driver")]
    pub driver: Option<String>,
    #[serde(rename = "Scope")]
    pub scope: Option<String>,
    #[serde(rename = "IPAM")]
    pub ipam: Option<Ipam>,
    #[serde(rename = "Labels")]
    pub labels: Option<std::collections::HashMap<String, String>>,
    #[serde(rename = "Created")]
    pub created: Option<String>,
    #[serde(rename = "Internal")]
    pub internal: Option<bool>,
    #[serde(rename = "Attachable")]
    pub attachable: Option<bool>,
}

#[derive(Serialize)]
pub struct NetworkCreateIpamConfig {
    #[serde(rename = "Subnet", skip_serializing_if = "Option::is_none")]
    pub subnet: Option<String>,
    #[serde(rename = "Gateway", skip_serializing_if = "Option::is_none")]
    pub gateway: Option<String>,
}

#[derive(Serialize)]
pub struct NetworkCreateIpam {
    #[serde(rename = "Driver")]
    pub driver: String,
    #[serde(rename = "Config")]
    pub config: Vec<NetworkCreateIpamConfig>,
}

#[derive(Serialize)]
pub struct NetworkCreate {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Driver")]
    pub driver: String,
    #[serde(rename = "CheckDuplicate")]
    pub check_duplicate: bool,
    #[serde(rename = "Internal", skip_serializing_if = "Option::is_none")]
    pub internal: Option<bool>,
    #[serde(rename = "Attachable", skip_serializing_if = "Option::is_none")]
    pub attachable: Option<bool>,
    #[serde(rename = "IPAM", skip_serializing_if = "Option::is_none")]
    pub ipam: Option<NetworkCreateIpam>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct NetworkPruneResponse {
    #[serde(rename = "NetworksDeleted", default, deserialize_with = "null_vec_default")]
    pub networks_deleted: Vec<String>,
}
