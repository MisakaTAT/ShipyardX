use std::path::Path;
use std::sync::{Arc, OnceLock};

use log::{debug, info, warn};
use russh::keys::{PrivateKeyWithHashAlg, load_secret_key};
use russh::{Disconnect, client};
use tokio::runtime::{Builder, Runtime};

use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};

use super::limits::{CONNECT_TIMEOUT, SOCKET_IO_TIMEOUT};

#[derive(Default)]
pub(crate) struct SshClientHandler;

impl client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

fn expand_key_path(raw: &str) -> String {
    if let Some(rest) = raw.strip_prefix("~/") {
        format!("{}/{}", std::env::var("HOME").unwrap_or_default(), rest)
    } else {
        raw.to_string()
    }
}

fn ssh_runtime() -> AppResult<&'static Runtime> {
    static RUNTIME: OnceLock<AppResult<Runtime>> = OnceLock::new();
    let runtime = RUNTIME.get_or_init(|| {
        debug!(target: "shipyardx_lib::ssh::client", "initializing dedicated ssh runtime");
        Builder::new_multi_thread()
            .enable_all()
            .thread_name("shipyardx-russh")
            .build()
            .map_err(|e| AppError::internal("ssh.runtime_init_failed", "初始化 SSH 运行时失败").with_source(e))
    });

    match runtime {
        Ok(runtime) => Ok(runtime),
        Err(error) => Err(error.clone()),
    }
}

pub fn spawn_on_runtime<F>(future: F) -> AppResult<tokio::task::JoinHandle<F::Output>>
where
    F: std::future::Future + Send + 'static,
    F::Output: Send + 'static,
{
    Ok(ssh_runtime()?.handle().spawn(future))
}

pub async fn connect(config: &ServerConfig) -> AppResult<client::Handle<SshClientHandler>> {
    info!(target: "shipyardx_lib::ssh::client", "opening ssh connection; server_id={} host={} port={} auth_type={}", config.id, config.host, config.port, config.auth_type);
    let client_config = Arc::new(client::Config {
        inactivity_timeout: Some(SOCKET_IO_TIMEOUT),
        keepalive_interval: Some(std::time::Duration::from_secs(15)),
        keepalive_max: 4,
        ..Default::default()
    });

    let mut handle = tokio::time::timeout(
        CONNECT_TIMEOUT,
        client::connect(client_config, (config.host.as_str(), config.port), SshClientHandler),
    )
    .await
    .map_err(|_| {
        AppError::timeout(
            "ssh.connect_timeout",
            format!("连接 {}:{} 超时", config.host, config.port),
        )
        .retryable(true)
    })?
    .map_err(|e| {
        AppError::unavailable("ssh.connect_failed", "SSH 连接失败")
            .with_detail(e.to_string())
            .retryable(true)
    })?;

    let auth = match config.auth_type.as_str() {
        "password" => {
            debug!(target: "shipyardx_lib::ssh::client", "authenticating over ssh with password; server_id={} username={}", config.id, config.username);
            let password = config.password.as_deref().unwrap_or("");
            handle
                .authenticate_password(config.username.clone(), password.to_string())
                .await
                .map_err(|e| AppError::auth("ssh.password_auth_failed", "密码认证失败").with_detail(e.to_string()))?
        }
        "key" => {
            let raw = config.key_path.as_deref().unwrap_or("~/.ssh/id_rsa");
            let expanded = expand_key_path(raw);
            debug!(target: "shipyardx_lib::ssh::client", "authenticating over ssh with key; server_id={} username={} key_path={}", config.id, config.username, expanded);
            let key_path = Path::new(&expanded);
            if !key_path.is_file() {
                return Err(AppError::validation(
                    "ssh.key_not_found",
                    format!("密钥文件不存在或不可读: {}", expanded),
                ));
            }

            let key = load_secret_key(key_path, None)
                .map_err(|e| AppError::validation("ssh.key_read_failed", "读取私钥失败").with_detail(e.to_string()))?;
            let rsa_hash = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|e| {
                    AppError::internal("ssh.rsa_probe_failed", "探测 RSA 签名算法失败").with_detail(e.to_string())
                })?
                .flatten();

            handle
                .authenticate_publickey(
                    config.username.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(key), rsa_hash),
                )
                .await
                .map_err(|e| AppError::auth("ssh.public_key_auth_failed", "密钥认证失败").with_detail(e.to_string()))?
        }
        other => {
            warn!(target: "shipyardx_lib::ssh::client", "unsupported ssh auth type; server_id={} auth_type={}", config.id, other);
            return Err(AppError::validation(
                "ssh.auth_type_invalid",
                format!("不支持的认证类型: {}", other),
            ));
        }
    };

    if !auth.success() {
        warn!(target: "shipyardx_lib::ssh::client", "ssh authentication incomplete; server_id={} username={}", config.id, config.username);
        return Err(AppError::auth("ssh.auth_incomplete", "认证未完成，请检查用户名和凭据")
            .with_action("请检查用户名、密码或密钥配置"));
    }

    info!(target: "shipyardx_lib::ssh::client", "ssh connection authenticated; server_id={} username={}", config.id, config.username);
    Ok(handle)
}

pub async fn disconnect(handle: &mut client::Handle<SshClientHandler>) {
    debug!(target: "shipyardx_lib::ssh::client", "closing ssh connection");
    let _ = handle.disconnect(Disconnect::ByApplication, "", "").await;
}
