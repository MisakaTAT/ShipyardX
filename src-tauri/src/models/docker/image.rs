use serde::Deserialize;

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
