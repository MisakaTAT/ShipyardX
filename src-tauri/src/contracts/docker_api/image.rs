use serde::Deserialize;

use crate::contracts::docker_api::common::null_vec_default;

#[derive(Deserialize)]
pub struct ImageSummary {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "RepoTags")]
    pub repo_tags: Option<Vec<String>>,
    #[serde(rename = "Size")]
    pub size: i64,
    #[serde(rename = "Created")]
    pub created: i64,
}

#[derive(Debug, Deserialize)]
pub struct ImageHistoryItem {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Created")]
    pub created: i64,
    #[serde(rename = "CreatedBy")]
    pub created_by: String,
    #[serde(rename = "Size")]
    pub size: i64,
    #[serde(rename = "Comment", default)]
    pub comment: String,
}

#[derive(Debug, Deserialize)]
pub struct ImagePruneItem {
    #[serde(rename = "Deleted")]
    pub deleted: Option<String>,
    #[serde(rename = "Untagged")]
    pub untagged: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImagePruneResponse {
    #[serde(rename = "ImagesDeleted", default, deserialize_with = "null_vec_default")]
    pub images_deleted: Vec<ImagePruneItem>,
    #[serde(rename = "SpaceReclaimed", default)]
    pub space_reclaimed: u64,
}

#[derive(Debug, Deserialize)]
pub struct BuilderPruneResponse {
    #[serde(rename = "CachesDeleted", default, deserialize_with = "null_vec_default")]
    pub caches_deleted: Vec<String>,
    #[serde(rename = "SpaceReclaimed", default)]
    pub space_reclaimed: u64,
}
