use serde::Serialize;
use specta::Type;

#[derive(Debug, Serialize, Clone, Type)]
pub struct Image {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_ts: i64,
    pub used_by_count: u32,
}

#[derive(Debug, Serialize, Clone, Type)]
pub struct ImageLayer {
    pub id: String,
    pub created_ts: i64,
    pub size: i64,
    pub command: String,
    pub comment: String,
}
