use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct VolumeSummary {
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "Driver")]
    pub driver: Option<String>,
    #[serde(rename = "Mountpoint")]
    pub mountpoint: Option<String>,
    #[serde(rename = "Labels")]
    pub labels: Option<HashMap<String, String>>,
    #[serde(rename = "Scope")]
    pub scope: Option<String>,
    #[serde(rename = "CreatedAt")]
    pub created_at: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct VolumeList {
    #[serde(rename = "Volumes")]
    pub volumes: Option<Vec<VolumeSummary>>,
}

#[derive(Serialize)]
pub struct VolumeCreate {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Driver")]
    pub driver: String,
    #[serde(rename = "DriverOpts", skip_serializing_if = "Option::is_none")]
    pub driver_opts: Option<std::collections::HashMap<String, String>>,
}
