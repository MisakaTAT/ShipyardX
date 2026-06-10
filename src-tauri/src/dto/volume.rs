use serde::Serialize;
use specta::Type;

#[derive(Debug, Serialize, Clone, Type)]
pub struct Volume {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub scope: String,
    pub created_at: String,
    pub created_ago: String,
    pub stack: String,
    pub used_by: String,
}
