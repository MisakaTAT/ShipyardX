use serde::Serialize;
use specta::Type;

#[derive(Debug, Serialize, Clone, Type)]
pub struct CleanupResult {
    pub deleted_count: u32,
    pub reclaimed: String,
}
