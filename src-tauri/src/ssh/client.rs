use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

use log::{debug, info, warn};
use russh::keys::{PrivateKeyWithHashAlg, load_secret_key};
use russh::{Disconnect, Error as RusshError, client};
use tokio::runtime::{Builder, Runtime};

use crate::config::timeouts::{SSH_CONNECT_TIMEOUT, SSH_KEEPALIVE_INTERVAL, SSH_SOCKET_IO_TIMEOUT};
use crate::dto::server::{HostKeyPrompt, ServerConfig};
use crate::error::{AppError, AppResult, HOST_KEY_CHANGED, HOST_KEY_UNKNOWN};
use crate::ssh::known_hosts;

#[derive(Debug, Clone)]
enum HostKeyVerdict {
    Trusted,
    Unknown { fingerprint: String },
    Changed { expected: String, actual: String },
}

pub(crate) struct SshClientHandler {
    host: String,
    port: u16,
    verdict: Arc<Mutex<Option<HostKeyVerdict>>>,
}

fn fingerprint_of(key: &russh::keys::ssh_key::PublicKey) -> String {
    key.fingerprint(russh::keys::ssh_key::HashAlg::Sha256).to_string()
}

impl client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = fingerprint_of(server_public_key);
        let known = known_hosts::lookup(&self.host, self.port);
        let verdict = match known.clone() {
            Some(expected) if expected == fingerprint => HostKeyVerdict::Trusted,
            Some(expected) => HostKeyVerdict::Changed {
                expected,
                actual: fingerprint.clone(),
            },
            None => HostKeyVerdict::Unknown {
                fingerprint: fingerprint.clone(),
            },
        };
        let trusted = matches!(verdict, HostKeyVerdict::Trusted);

        if !trusted {
            warn!(
                target: "shipyardx_lib::ssh::client",
                "host key verification failed; host={} port={} fingerprint={} known={:?}",
                self.host,
                self.port,
                fingerprint,
                known
            );
            known_hosts::set_pending(HostKeyPrompt {
                host: self.host.clone(),
                port: self.port,
                fingerprint,
                known_fingerprint: known,
            });
        }

        if let Ok(mut slot) = self.verdict.lock() {
            *slot = Some(verdict);
        }
        Ok(trusted)
    }
}

fn host_key_error(config: &ServerConfig, verdict: HostKeyVerdict) -> Option<AppError> {
    match verdict {
        HostKeyVerdict::Trusted => None,
        HostKeyVerdict::Unknown { fingerprint } => Some(
            AppError::auth(
                HOST_KEY_UNKNOWN,
                format!("{}:{} 的主机密钥尚未被信任", config.host, config.port),
            )
            .with_detail(fingerprint)
            .with_action("请核对服务器指纹后确认信任"),
        ),
        HostKeyVerdict::Changed { expected, actual } => Some(
            AppError::auth(
                HOST_KEY_CHANGED,
                format!("{}:{} 的主机密钥已变更", config.host, config.port),
            )
            .with_detail(format!("已记录指纹：{expected}；当前指纹：{actual}"))
            .with_action("这可能是中间人攻击。请确认服务器确实更换了密钥后再重新信任"),
        ),
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

fn map_ssh_connect_error(host: &str, port: u16, error: RusshError) -> AppError {
    use std::io::ErrorKind;

    match error {
        RusshError::ConnectionTimeout => {
            AppError::timeout("ssh.connect_timeout", format!("连接 {host}:{port} 超时")).retryable(true)
        }
        RusshError::KeepaliveTimeout | RusshError::InactivityTimeout => {
            AppError::timeout("ssh.connection_lost", "连接已超时中断")
                .with_action("请检查网络连通性后重试")
                .retryable(true)
        }
        RusshError::NoCommonAlgo { kind, ours, theirs } => AppError::unavailable("ssh.no_common_algo", "算法不兼容")
            .with_detail(format!(
                "协商类型：{kind:?}；客户端：{}；服务端：{}",
                ours.join(", "),
                theirs.join(", ")
            ))
            .with_action("请调整 SSH 服务端或客户端支持的算法后重试"),
        RusshError::WrongServerSig | RusshError::KeyChanged { .. } | RusshError::UnknownKey => {
            AppError::auth("ssh.host_key_verification_failed", "主机身份校验失败")
                .with_detail(error.to_string())
                .with_action("请确认连接到的是正确的服务器，并检查主机密钥是否发生变化")
        }
        RusshError::NoAuthMethod | RusshError::UnsupportedAuthMethod => {
            AppError::auth("ssh.auth_method_unsupported", "认证方式不受支持")
                .with_detail(error.to_string())
                .with_action("请切换为服务端支持的认证方式")
        }
        RusshError::CouldNotReadKey => AppError::validation("ssh.key_parse_failed", "密钥无法解析")
            .with_action("请检查私钥格式是否正确，或重新选择密钥文件"),
        RusshError::InvalidConfig(_) => {
            AppError::validation("ssh.config_invalid", "配置无效").with_detail(error.to_string())
        }
        RusshError::Kex
        | RusshError::KexInit
        | RusshError::PacketAuth
        | RusshError::DecryptionError
        | RusshError::StrictKeyExchangeViolation { .. } => AppError::unavailable("ssh.handshake_failed", "握手失败")
            .with_detail(error.to_string())
            .with_action("请检查 SSH 服务端配置和协议兼容性")
            .retryable(true),
        RusshError::Disconnect | RusshError::HUP => AppError::unavailable("ssh.disconnected", "连接被远端关闭")
            .with_detail(error.to_string())
            .retryable(true),
        RusshError::NotAuthenticated => {
            AppError::auth("ssh.not_authenticated", "尚未完成认证").with_action("请检查用户名、密码或密钥配置")
        }
        RusshError::IO(io_error) => {
            let base = match io_error.kind() {
                ErrorKind::ConnectionRefused => AppError::unavailable("ssh.connection_refused", "服务器拒绝连接")
                    .with_action("请确认目标主机 SSH 服务已启动，端口配置正确"),
                ErrorKind::TimedOut => AppError::timeout("ssh.connect_timeout", format!("连接 {host}:{port} 超时"))
                    .with_action("请检查目标主机是否可达，以及安全组或防火墙设置")
                    .retryable(true),
                ErrorKind::ConnectionReset | ErrorKind::ConnectionAborted | ErrorKind::NotConnected => {
                    AppError::unavailable("ssh.connection_interrupted", "连接已中断")
                        .with_action("请检查网络连通性后重试")
                        .retryable(true)
                }
                ErrorKind::AddrNotAvailable | ErrorKind::AddrInUse => {
                    AppError::validation("ssh.address_invalid", "地址或端口无效")
                }
                _ => AppError::unavailable("ssh.connect_failed", "连接失败").retryable(true),
            };
            base.with_detail(io_error.to_string())
        }
        other => AppError::unavailable("ssh.connect_failed", "连接失败")
            .with_detail(other.to_string())
            .retryable(true),
    }
}

pub async fn connect(config: &ServerConfig) -> AppResult<client::Handle<SshClientHandler>> {
    info!(target: "shipyardx_lib::ssh::client", "opening ssh connection; server_id={} host={} port={} auth_type={}", config.id, config.host, config.port, config.auth_type);
    let client_config = Arc::new(client::Config {
        inactivity_timeout: Some(SSH_SOCKET_IO_TIMEOUT),
        keepalive_interval: Some(SSH_KEEPALIVE_INTERVAL),
        keepalive_max: 4,
        ..Default::default()
    });

    let verdict: Arc<Mutex<Option<HostKeyVerdict>>> = Arc::new(Mutex::new(None));
    let handler = SshClientHandler {
        host: config.host.clone(),
        port: config.port,
        verdict: Arc::clone(&verdict),
    };

    let mut handle = tokio::time::timeout(
        SSH_CONNECT_TIMEOUT,
        client::connect(client_config, (config.host.as_str(), config.port), handler),
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
        verdict
            .lock()
            .ok()
            .and_then(|mut slot| slot.take())
            .and_then(|verdict| host_key_error(config, verdict))
            .unwrap_or_else(|| map_ssh_connect_error(&config.host, config.port, e))
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
                    format!("密钥文件不存在或不可读：{}", expanded),
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
                format!("不支持的认证类型：{}", other),
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

struct HostKeyProbeHandler {
    fingerprint: Arc<Mutex<Option<String>>>,
}

impl client::Handler for HostKeyProbeHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        if let Ok(mut slot) = self.fingerprint.lock() {
            *slot = Some(fingerprint_of(server_public_key));
        }
        Ok(true)
    }
}

/// 读取服务器当前指纹：只做密钥交换就断开，不认证、不比对、不写入信任记录
pub async fn probe_host_key(host: &str, port: u16) -> AppResult<String> {
    info!(target: "shipyardx_lib::ssh::client", "probing host key; host={} port={}", host, port);
    let client_config = Arc::new(client::Config {
        inactivity_timeout: Some(SSH_SOCKET_IO_TIMEOUT),
        ..Default::default()
    });

    let fingerprint: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let handler = HostKeyProbeHandler {
        fingerprint: Arc::clone(&fingerprint),
    };

    let mut handle = tokio::time::timeout(
        SSH_CONNECT_TIMEOUT,
        client::connect(client_config, (host, port), handler),
    )
    .await
    .map_err(|_| AppError::timeout("ssh.connect_timeout", format!("连接 {host}:{port} 超时")).retryable(true))?
    .map_err(|e| map_ssh_connect_error(host, port, e))?;

    disconnect(&mut handle).await;

    fingerprint
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
        .ok_or_else(|| AppError::internal("ssh.host_key_probe_failed", "未能读取服务器主机密钥"))
}

pub async fn disconnect<H: client::Handler>(handle: &mut client::Handle<H>) {
    debug!(target: "shipyardx_lib::ssh::client", "closing ssh connection");
    let _ = handle.disconnect(Disconnect::ByApplication, "", "").await;
}
