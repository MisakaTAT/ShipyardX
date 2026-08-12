use std::path::{Path, PathBuf};

use log::{debug, info};
use russh::client::Handle;
use russh_sftp::client::{SftpSession, error::Error as SftpError};
use russh_sftp::protocol::StatusCode;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};

use super::client::{SshClientHandler, connect};

const COPY_BUFFER_BYTES: usize = 256 * 1024;

pub struct SshSftpSession {
    _handle: Handle<SshClientHandler>,
    session: SftpSession,
    home_dir: String,
}

impl SshSftpSession {
    pub async fn connect(config: &ServerConfig) -> AppResult<Self> {
        let handle = connect(config).await?;
        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| AppError::unavailable("sftp.channel_open_failed").with_source(e))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| AppError::unavailable("sftp.subsystem_request_failed").with_source(e))?;
        let session = SftpSession::new(channel.into_stream())
            .await
            .map_err(map_sftp_error("sftp.session_init_failed"))?;
        let home_dir = session
            .canonicalize(".")
            .await
            .map_err(map_sftp_error("sftp.resolve_home_failed"))?;

        info!(target: "shipyardx_lib::ssh::sftp", "sftp session ready; server_id={} home_dir={}", config.id, home_dir);
        Ok(Self {
            _handle: handle,
            session,
            home_dir,
        })
    }

    pub fn home_path(&self, relative_path: &str) -> String {
        let relative = relative_path.trim_matches('/');
        if relative.is_empty() {
            return self.home_dir.clone();
        }
        format!("{}/{}", self.home_dir.trim_end_matches('/'), relative)
    }

    pub async fn create_dir_all(&self, remote_dir: &str) -> AppResult<()> {
        let remote_dir = remote_dir.trim();
        if remote_dir.is_empty() || remote_dir == "/" {
            return Ok(());
        }

        let normalized = normalize_remote_path(remote_dir);
        let mut current = if normalized.starts_with('/') {
            "/".to_string()
        } else {
            String::new()
        };

        for segment in normalized.split('/').filter(|segment| !segment.is_empty()) {
            if current.is_empty() || current == "/" {
                current.push_str(segment);
            } else {
                current.push('/');
                current.push_str(segment);
            }
            if normalized.starts_with('/') {
                current.insert(0, '/');
                current = normalize_remote_path(&current);
            }

            match self.session.metadata(current.clone()).await {
                Ok(meta) => {
                    if !meta.is_dir() {
                        return Err(AppError::conflict("sftp.remote_path_conflict").param("path", current));
                    }
                }
                Err(SftpError::Status(status)) if status.status_code == StatusCode::NoSuchFile => {
                    self.session
                        .create_dir(current.clone())
                        .await
                        .map_err(map_sftp_error_at("sftp.mkdir_failed", &current))?;
                }
                Err(err) => return Err(map_sftp_error("sftp.stat_failed")(err)),
            }
        }

        Ok(())
    }

    pub async fn upload_bytes(&self, remote_path: &str, bytes: &[u8]) -> AppResult<()> {
        if let Some(parent) = remote_parent(remote_path) {
            self.create_dir_all(parent).await?;
        }
        let mut remote_file = self
            .session
            .create(remote_path)
            .await
            .map_err(map_sftp_error_at("sftp.create_file_failed", remote_path))?;
        remote_file
            .write_all(bytes)
            .await
            .map_err(|e| AppError::internal("sftp.write_failed").with_source(e))?;
        remote_file
            .shutdown()
            .await
            .map_err(|e| AppError::internal("sftp.shutdown_failed").with_source(e))?;
        Ok(())
    }

    pub async fn upload_local_file_with_progress<F>(
        &self,
        local_path: &Path,
        remote_path: &str,
        mut on_progress: F,
    ) -> AppResult<u64>
    where
        F: FnMut(u64),
    {
        if let Some(parent) = remote_parent(remote_path) {
            self.create_dir_all(parent).await?;
        }

        let mut local_file = fs::File::open(local_path)
            .await
            .map_err(|e| AppError::internal("sftp.local_file_open_failed").with_source(e))?;
        let mut remote_file = self
            .session
            .create(remote_path)
            .await
            .map_err(map_sftp_error_at("sftp.create_file_failed", remote_path))?;

        let mut buffer = vec![0u8; COPY_BUFFER_BYTES];
        let mut transferred = 0u64;
        loop {
            let read = local_file
                .read(&mut buffer)
                .await
                .map_err(|e| AppError::internal("sftp.local_file_read_failed").with_source(e))?;
            if read == 0 {
                break;
            }
            remote_file
                .write_all(&buffer[..read])
                .await
                .map_err(|e| AppError::internal("sftp.write_failed").with_source(e))?;
            transferred = transferred.saturating_add(read as u64);
            on_progress(transferred);
        }

        remote_file
            .shutdown()
            .await
            .map_err(|e| AppError::internal("sftp.shutdown_failed").with_source(e))?;
        Ok(transferred)
    }

    pub async fn upload_dir_recursive<F>(
        &self,
        local_dir: &Path,
        remote_dir: &str,
        mut on_progress: F,
    ) -> AppResult<u64>
    where
        F: FnMut(u64),
    {
        self.create_dir_all(remote_dir).await?;

        let mut transferred_total = 0u64;
        let mut stack: Vec<(PathBuf, String)> = vec![(local_dir.to_path_buf(), normalize_remote_path(remote_dir))];

        while let Some((current_local_dir, current_remote_dir)) = stack.pop() {
            self.create_dir_all(&current_remote_dir).await?;
            let mut entries = fs::read_dir(&current_local_dir)
                .await
                .map_err(|e| AppError::internal("sftp.local_dir_read_failed").with_source(e))?;

            while let Some(entry) = entries
                .next_entry()
                .await
                .map_err(|e| AppError::internal("sftp.local_dir_entry_failed").with_source(e))?
            {
                let entry_path = entry.path();
                let entry_name = entry.file_name().to_string_lossy().to_string();
                let remote_entry = format!("{}/{}", current_remote_dir.trim_end_matches('/'), entry_name);
                let metadata = entry
                    .metadata()
                    .await
                    .map_err(|e| AppError::internal("sftp.local_metadata_failed").with_source(e))?;

                if metadata.is_dir() {
                    stack.push((entry_path, remote_entry));
                    continue;
                }
                if !metadata.is_file() {
                    debug!(target: "shipyardx_lib::ssh::sftp", "skipping non-regular entry during upload; path={}", entry_path.display());
                    continue;
                }

                let uploaded = self
                    .upload_local_file_with_progress(&entry_path, &remote_entry, |file_transferred| {
                        on_progress(transferred_total.saturating_add(file_transferred));
                    })
                    .await?;
                transferred_total = transferred_total.saturating_add(uploaded);
                on_progress(transferred_total);
            }
        }

        Ok(transferred_total)
    }
}

fn remote_parent(remote_path: &str) -> Option<&str> {
    remote_path
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .filter(|parent| !parent.is_empty())
}

fn normalize_remote_path(path: &str) -> String {
    let is_absolute = path.starts_with('/');
    let mut parts = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            value => parts.push(value),
        }
    }

    let joined = parts.join("/");
    if is_absolute {
        if joined.is_empty() {
            "/".to_string()
        } else {
            format!("/{}", joined)
        }
    } else {
        joined
    }
}

/// 带远程路径的变体：路径以 param 形式带给词条，而不是拼进文案
fn map_sftp_error_at(code: impl Into<String>, path: &str) -> impl FnOnce(SftpError) -> AppError {
    let path = path.to_string();
    let inner = map_sftp_error(code);
    move |error| inner(error).param("path", path)
}

fn map_sftp_error(code: impl Into<String>) -> impl FnOnce(SftpError) -> AppError {
    let code = code.into();
    move |error| match error {
        SftpError::Status(status) if status.status_code == StatusCode::PermissionDenied => {
            AppError::permission(code.clone()).with_detail(status.error_message)
        }
        SftpError::Status(status) if status.status_code == StatusCode::NoSuchFile => {
            AppError::not_found(code.clone()).with_detail(status.error_message)
        }
        SftpError::Timeout => AppError::timeout(code.clone()).retryable(true),
        other => AppError::unavailable(code.clone())
            .with_detail(other.to_string())
            .retryable(true),
    }
}
