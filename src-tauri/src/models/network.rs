use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct IpamConfigResp {
    #[serde(rename = "Subnet")]
    pub subnet: Option<String>,
    #[serde(rename = "Gateway")]
    pub gateway: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct IpamResp {
    #[serde(rename = "Config")]
    pub config: Option<Vec<IpamConfigResp>>,
}

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct NetworkResp {
    #[serde(rename = "Id")]
    pub id: Option<String>,
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "Driver")]
    pub driver: Option<String>,
    #[serde(rename = "Scope")]
    pub scope: Option<String>,
    #[serde(rename = "IPAM")]
    pub ipam: Option<IpamResp>,
    #[serde(rename = "Labels")]
    pub labels: Option<std::collections::HashMap<String, String>>,
    #[serde(rename = "Created")]
    pub created: Option<String>,
    #[serde(rename = "Internal")]
    pub internal: Option<bool>,
    #[serde(rename = "Attachable")]
    pub attachable: Option<bool>,
}

impl Default for NetworkResp {
    fn default() -> Self {
        Self {
            id: None,
            name: None,
            driver: None,
            scope: None,
            ipam: None,
            labels: None,
            created: None,
            internal: None,
            attachable: None,
        }
    }
}

#[derive(Serialize)]
pub struct CreateNetworkIpamConfigReq {
    #[serde(rename = "Subnet", skip_serializing_if = "Option::is_none")]
    pub subnet: Option<String>,
    #[serde(rename = "Gateway", skip_serializing_if = "Option::is_none")]
    pub gateway: Option<String>,
}

#[derive(Serialize)]
pub struct CreateNetworkIpamReq {
    #[serde(rename = "Driver")]
    pub driver: String,
    #[serde(rename = "Config")]
    pub config: Vec<CreateNetworkIpamConfigReq>,
}

#[derive(Serialize)]
pub struct CreateNetworkReq {
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
    pub ipam: Option<CreateNetworkIpamReq>,
}
