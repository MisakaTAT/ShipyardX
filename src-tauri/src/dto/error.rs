use std::collections::BTreeMap;

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

/// 面向前端的错误。不带任何用户可见文案：`code` 决定显示什么，
/// 文案与建议统一放在前端词条 `errors.<code>.{message,action}` 里。
///
/// `params` 供词条插值，`detail` 是底层库抛出的原始错误串（不翻译，原样展示）。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AppError {
    pub code: String,
    pub kind: AppErrorKind,
    pub params: BTreeMap<String, String>,
    pub detail: Option<String>,
    pub retryable: bool,
}
