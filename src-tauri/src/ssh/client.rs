use std::path::Path;
use std::sync::{Arc, OnceLock};

use russh::keys::{PrivateKeyWithHashAlg, load_secret_key};
use russh::{Disconnect, client};
use tokio::runtime::{Builder, Runtime};

use crate::error::{AppError, AppResult};
use crate::models::app::server::ServerConfig;

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

fn ssh_runtime() -> &'static Runtime {
    static RUNTIME: OnceLock<Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        Builder::new_multi_thread()
            .enable_all()
            .thread_name("shipyardx-russh")
            .build()
            .expect("failed to create ssh runtime")
    })
}

pub fn block_on<F>(future: F) -> F::Output
where
    F: std::future::Future,
{
    if tokio::runtime::Handle::try_current().is_ok() {
        tokio::task::block_in_place(|| ssh_runtime().handle().block_on(future))
    } else {
        ssh_runtime().block_on(future)
    }
}

pub async fn connect(config: &ServerConfig) -> AppResult<client::Handle<SshClientHandler>> {
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
            let password = config.password.as_deref().unwrap_or("");
            handle
                .authenticate_password(config.username.clone(), password.to_string())
                .await
                .map_err(|e| AppError::auth("ssh.password_auth_failed", "密码认证失败").with_detail(e.to_string()))?
        }
        "key" => {
            let raw = config.key_path.as_deref().unwrap_or("~/.ssh/id_rsa");
            let expanded = expand_key_path(raw);
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
            return Err(AppError::validation(
                "ssh.auth_type_invalid",
                format!("不支持的认证类型: {}", other),
            ));
        }
    };

    if !auth.success() {
        return Err(AppError::auth("ssh.auth_incomplete", "认证未完成，请检查用户名和凭据")
            .with_action("请检查用户名、密码或密钥配置"));
    }

    Ok(handle)
}

pub async fn disconnect(handle: &mut client::Handle<SshClientHandler>) {
    let _ = handle.disconnect(Disconnect::ByApplication, "", "").await;
}
