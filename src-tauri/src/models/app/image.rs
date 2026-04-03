use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct Image {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_ts: i64,
}
