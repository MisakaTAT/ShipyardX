use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct Volume {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub scope: String,
    pub created_at: String,
}
