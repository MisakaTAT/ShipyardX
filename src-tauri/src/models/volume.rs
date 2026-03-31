use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct VolumeResp {
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "Driver")]
    pub driver: Option<String>,
    #[serde(rename = "Mountpoint")]
    pub mountpoint: Option<String>,
    #[serde(rename = "Scope")]
    pub scope: Option<String>,
    #[serde(rename = "CreatedAt")]
    pub created_at: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct VolumesResp {
    #[serde(rename = "Volumes")]
    pub volumes: Option<Vec<VolumeResp>>,
}

#[derive(Serialize)]
pub struct CreateVolumeReq {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Driver")]
    pub driver: String,
    #[serde(rename = "DriverOpts", skip_serializing_if = "Option::is_none")]
    pub driver_opts: Option<std::collections::HashMap<String, String>>,
}
