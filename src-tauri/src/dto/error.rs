use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AppErrorKind {
    Validation,
    Auth,
    Permission,
    NotFound,
    Conflict,
    Unavailable,
    Timeout,
    Internal,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AppError {
    pub code: String,
    pub kind: AppErrorKind,
    pub message: String,
    pub detail: Option<String>,
    pub retryable: bool,
    pub action: Option<String>,
}
