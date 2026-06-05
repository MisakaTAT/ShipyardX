use std::path::Path;
use std::sync::{Arc, OnceLock};

use russh::keys::{PrivateKeyWithHashAlg, load_secret_key};
use russh::{Disconnect, client};
use tokio::runtime::{Builder, Runtime};

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

pub fn map_error(context: &str, err: impl std::fmt::Display) -> String {
    format!("{}: {}", context, err)
}

pub async fn connect(config: &ServerConfig) -> Result<client::Handle<SshClientHandler>, String> {
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
    .map_err(|_| format!("连接 {}:{} 超时", config.host, config.port))?
    .map_err(|e| map_error("SSH 连接失败", e))?;

    let auth = match config.auth_type.as_str() {
        "password" => {
            let password = config.password.as_deref().unwrap_or("");
            handle
                .authenticate_password(config.username.clone(), password.to_string())
                .await
                .map_err(|e| map_error("密码认证失败", e))?
        }
        "key" => {
            let raw = config.key_path.as_deref().unwrap_or("~/.ssh/id_rsa");
            let expanded = expand_key_path(raw);
            let key_path = Path::new(&expanded);
            if !key_path.is_file() {
                return Err(format!("密钥文件不存在或不可读: {}", expanded));
            }

            let key = load_secret_key(key_path, None).map_err(|e| map_error("读取私钥失败", e))?;
            let rsa_hash = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|e| map_error("探测 RSA 签名算法失败", e))?
                .flatten();

            handle
                .authenticate_publickey(
                    config.username.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(key), rsa_hash),
                )
                .await
                .map_err(|e| map_error("密钥认证失败", e))?
        }
        other => return Err(format!("不支持的认证类型: {}", other)),
    };

    if !auth.success() {
        return Err("认证未完成，请检查用户名和凭据".to_string());
    }

    Ok(handle)
}

pub async fn disconnect(handle: &mut client::Handle<SshClientHandler>) {
    let _ = handle.disconnect(Disconnect::ByApplication, "", "").await;
}
