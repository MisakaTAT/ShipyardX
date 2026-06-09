use serde::Serialize;
use specta::Type;
use crate::utils::serde_string::i64_string;

#[derive(Debug, Serialize, Clone, Type)]
pub struct Image {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub size_bytes: i64,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub created_ts: i64,
    pub used_by_count: u32,
}

#[derive(Debug, Serialize, Clone, Type)]
pub struct ImageLayer {
    pub id: String,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub created_ts: i64,
    #[serde(with = "i64_string")]
    #[specta(type = String)]
    pub size: i64,
    pub command: String,
    pub comment: String,
}
