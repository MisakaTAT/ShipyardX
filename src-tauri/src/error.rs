pub use crate::dto::error::{AppError, AppErrorKind};

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: impl Into<String>, kind: AppErrorKind, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            kind,
            message: message.into(),
            detail: None,
            retryable: false,
            action: None,
        }
    }

    pub fn validation(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Validation, message)
    }

    pub fn auth(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Auth, message)
    }

    pub fn permission(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Permission, message)
    }

    pub fn not_found(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::NotFound, message)
    }

    pub fn conflict(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Conflict, message)
    }

    pub fn unavailable(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Unavailable, message)
    }

    pub fn timeout(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Timeout, message)
    }

    pub fn internal(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, AppErrorKind::Internal, message)
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn with_action(mut self, action: impl Into<String>) -> Self {
        self.action = Some(action.into());
        self
    }

    pub fn retryable(mut self, retryable: bool) -> Self {
        self.retryable = retryable;
        self
    }

    pub fn with_source(self, source: impl std::fmt::Display) -> Self {
        self.with_detail(source.to_string())
    }

    pub fn wrap(
        code: impl Into<String>,
        kind: AppErrorKind,
        message: impl Into<String>,
        source: impl std::fmt::Display,
    ) -> Self {
        Self::new(code, kind, message).with_source(source)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for AppError {}

impl From<&str> for AppError {
    fn from(message: &str) -> Self {
        AppError::internal("internal.error", message)
    }
}

impl From<String> for AppError {
    fn from(message: String) -> Self {
        AppError::internal("internal.error", message)
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        AppError::internal("io.error", "本地 I/O 操作失败").with_detail(error.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        AppError::internal("serde.json", "JSON 处理失败").with_detail(error.to_string())
    }
}

impl From<serde_yaml::Error> for AppError {
    fn from(error: serde_yaml::Error) -> Self {
        AppError::internal("serde.yaml", "YAML 处理失败").with_detail(error.to_string())
    }
}

impl From<base64::DecodeError> for AppError {
    fn from(error: base64::DecodeError) -> Self {
        AppError::internal("base64.decode", "Base64 解码失败").with_detail(error.to_string())
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(error: tokio::task::JoinError) -> Self {
        AppError::internal("task.join", "后台任务执行失败").with_detail(error.to_string())
    }
}
