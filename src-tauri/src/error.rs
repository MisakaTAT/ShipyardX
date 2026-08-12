use std::collections::BTreeMap;

pub use crate::dto::error::{AppError, AppErrorKind};

pub type AppResult<T> = Result<T, AppError>;

pub const HOST_KEY_UNKNOWN: &str = "ssh.host_key_unknown";
pub const HOST_KEY_CHANGED: &str = "ssh.host_key_changed";

impl AppError {
    /// 主机密钥相关错误需要原样冒泡到前端
    pub fn is_host_key(&self) -> bool {
        self.code == HOST_KEY_UNKNOWN || self.code == HOST_KEY_CHANGED
    }
}

impl AppError {
    pub fn new(code: impl Into<String>, kind: AppErrorKind) -> Self {
        Self {
            code: code.into(),
            kind,
            params: BTreeMap::new(),
            detail: None,
            retryable: false,
        }
    }

    pub fn validation(code: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Validation)
    }

    pub fn auth(code: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Auth)
    }

    pub fn permission(code: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Permission)
    }

    pub fn not_found(code: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::NotFound)
    }

    pub fn conflict(code: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Conflict)
    }

    pub fn unavailable(code: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Unavailable)
    }

    pub fn timeout(code: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Timeout)
    }

    pub fn internal(code: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Internal)
    }

    /// 词条插值参数，例如 `errors.ssh.connect_timeout` 的 `{{host}}`
    pub fn param(mut self, key: impl Into<String>, value: impl std::fmt::Display) -> Self {
        self.params.insert(key.into(), value.to_string());
        self
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn retryable(mut self, retryable: bool) -> Self {
        self.retryable = retryable;
        self
    }

    pub fn with_source(self, source: impl std::fmt::Display) -> Self {
        self.with_detail(source.to_string())
    }

    pub fn wrap(code: impl Into<String>, kind: AppErrorKind, source: impl std::fmt::Display) -> Self {
        Self::new(code, kind).with_source(source)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.code)?;
        if !self.params.is_empty() {
            let params = self
                .params
                .iter()
                .map(|(key, value)| format!("{key}={value}"))
                .collect::<Vec<_>>()
                .join(", ");
            write!(f, " ({params})")?;
        }
        if let Some(detail) = &self.detail {
            write!(f, ": {detail}")?;
        }
        Ok(())
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        AppError::internal("io.error").with_detail(error.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        AppError::internal("serde.json").with_detail(error.to_string())
    }
}

impl From<serde_yaml::Error> for AppError {
    fn from(error: serde_yaml::Error) -> Self {
        AppError::internal("serde.yaml").with_detail(error.to_string())
    }
}

impl From<base64::DecodeError> for AppError {
    fn from(error: base64::DecodeError) -> Self {
        AppError::internal("base64.decode").with_detail(error.to_string())
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(error: tokio::task::JoinError) -> Self {
        AppError::internal("task.join").with_detail(error.to_string())
    }
}
