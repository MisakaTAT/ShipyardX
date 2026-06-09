use serde::Serialize;
use specta::Type;
use crate::utils::serde_string::u64_string;

#[derive(Debug, Serialize, Clone, Type)]
pub struct CleanupResult {
    pub deleted_count: u32,
    #[serde(with = "u64_string")]
    #[specta(type = String)]
    pub reclaimed_bytes: u64,
}
