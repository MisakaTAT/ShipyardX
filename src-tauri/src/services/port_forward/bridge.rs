use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use log::error;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpListener as TokioTcpListener;
use tokio::net::TcpStream as TokioTcpStream;
use tokio::sync::watch;

use crate::config::timeouts::PORT_FORWARD_ACCEPT_RETRY_DELAY;
use crate::dto::port_forward::PortForwardError;
use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::ssh::pool;

pub(super) struct PortForwardBridgeArgs {
    pub(super) local_stream: TcpStream,
    pub(super) server_cfg: ServerConfig,
    pub(super) remote_host: String,
    pub(super) remote_port: u16,
    pub(super) last_error: Arc<Mutex<Option<PortForwardError>>>,
    pub(super) tx_bytes: Arc<AtomicU64>,
    pub(super) rx_bytes: Arc<AtomicU64>,
}

pub(super) struct PortForwardAcceptArgs {
    pub(super) listener: TcpListener,
    pub(super) server_cfg: ServerConfig,
    pub(super) remote_host: String,
    pub(super) remote_port: u16,
    pub(super) stop_rx: watch::Receiver<bool>,
    pub(super) last_error: Arc<Mutex<Option<PortForwardError>>>,
    pub(super) tx_bytes: Arc<AtomicU64>,
    pub(super) rx_bytes: Arc<AtomicU64>,
}

pub(super) fn error_message(error: &AppError) -> String {
    error.detail.clone().unwrap_or_else(|| error.code.clone())
}

/// 通配地址和「无网络 IP」都落到回环。
/// `host` 网络模式的容器在容器列表里 ip 是 "-"，它的端口本就开在宿主回环上，
/// 原样存下去会让 direct-tcpip 拿着 "-" 去解析，必然失败。
pub(super) fn normalize_host(ip: &str) -> String {
    let v = ip.trim();
    if v.is_empty() || v == "-" || v == "0.0.0.0" || v == "::" || v == "::0" {
        "127.0.0.1".to_string()
    } else {
        v.to_string()
    }
}

pub(super) async fn bridge_once(args: PortForwardBridgeArgs) {
    let PortForwardBridgeArgs {
        local_stream,
        server_cfg,
        remote_host,
        remote_port,
        last_error,
        tx_bytes,
        rx_bytes,
    } = args;

    let _ = local_stream.set_nodelay(true);
    let log_server_id = server_cfg.id.clone();
    let log_remote_host = remote_host.clone();

    let result = async move {
        let channel = pool::open_direct_tcpip(&server_cfg, remote_host.clone(), remote_port)
            .await?
            .map_err(|e| AppError::unavailable("port_forward.remote_unreachable").with_source(e))?;

        local_stream
            .set_nonblocking(true)
            .map_err(|e| AppError::internal("port_forward.local_socket_config_failed").with_source(e))?;
        let local_stream = TokioTcpStream::from_std(local_stream)
            .map_err(|e| AppError::internal("port_forward.local_socket_takeover_failed").with_source(e))?;
        let remote_stream = channel.into_stream();

        let (local_read, local_write) = tokio::io::split(local_stream);
        let (remote_read, remote_write) = tokio::io::split(remote_stream);

        tokio::select! {
            res = async {
                tokio::try_join!(
                    transfer_stream(local_read, remote_write, tx_bytes.clone()),
                    transfer_stream(remote_read, local_write, rx_bytes.clone())
                )?;
                Ok::<(), AppError>(())
            } => res
        }
    }
    .await;

    let failure = match result {
        Ok(()) => None,
        Err(e) => {
            error!(
                target: "shipyardx_lib::services::port_forward",
                "port forward bridge failed; server_id={} remote_host={} remote_port={} code={} detail={:?}",
                log_server_id,
                log_remote_host,
                remote_port,
                e.code,
                e.detail
            );
            Some(PortForwardError::now(e))
        }
    };
    if let Ok(mut last_error_guard) = last_error.lock() {
        *last_error_guard = failure;
    }
}

async fn transfer_stream<R, W>(mut reader: R, mut writer: W, counter: Arc<AtomicU64>) -> AppResult<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut buf = [0u8; 16 * 1024];
    loop {
        let n = reader
            .read(&mut buf)
            .await
            .map_err(|e| AppError::internal("port_forward.read_failed").with_source(e))?;
        if n == 0 {
            writer
                .shutdown()
                .await
                .map_err(|e| AppError::internal("port_forward.shutdown_failed").with_source(e))?;
            return Ok(());
        }
        writer
            .write_all(&buf[..n])
            .await
            .map_err(|e| AppError::internal("port_forward.write_failed").with_source(e))?;
        counter.fetch_add(n as u64, Ordering::Relaxed);
    }
}

pub(super) async fn accept_loop(args: PortForwardAcceptArgs) {
    let PortForwardAcceptArgs {
        listener,
        server_cfg,
        remote_host,
        remote_port,
        mut stop_rx,
        last_error,
        tx_bytes,
        rx_bytes,
    } = args;

    let _ = listener.set_nonblocking(true);
    let listener = match TokioTcpListener::from_std(listener) {
        Ok(listener) => listener,
        Err(_) => return,
    };

    loop {
        tokio::select! {
            changed = stop_rx.changed() => {
                if changed.is_ok() && *stop_rx.borrow() {
                    break;
                }
            }
            accepted = listener.accept() => match accepted {
                Ok((stream, _addr)) => {
                    let stream = match stream.into_std() {
                        Ok(stream) => stream,
                        Err(_) => continue,
                    };
                    let cfg = server_cfg.clone();
                    let rh = remote_host.clone();
                    let le = last_error.clone();
                    let tx = tx_bytes.clone();
                    let rx = rx_bytes.clone();
                    let rp = remote_port;
                    tokio::spawn(async move {
                        bridge_once(PortForwardBridgeArgs {
                            local_stream: stream,
                            server_cfg: cfg,
                            remote_host: rh,
                            remote_port: rp,
                            last_error: le,
                            tx_bytes: tx,
                            rx_bytes: rx,
                        })
                        .await;
                    });
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => {}
                Err(_) => {
                    tokio::time::sleep(PORT_FORWARD_ACCEPT_RETRY_DELAY).await;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wildcards_and_missing_ips_fall_back_to_loopback() {
        for raw in ["", "  ", "-", "0.0.0.0", "::", "::0"] {
            assert_eq!(normalize_host(raw), "127.0.0.1", "input: {raw:?}");
        }
    }

    #[test]
    fn keeps_real_container_ips() {
        assert_eq!(normalize_host("172.18.0.5"), "172.18.0.5");
        assert_eq!(normalize_host(" 10.4.0.9 "), "10.4.0.9");
        assert_eq!(normalize_host("fd00::2"), "fd00::2");
    }

    #[test]
    fn error_message_prefers_detail_then_code() {
        assert_eq!(
            error_message(&AppError::internal("port_forward.read_failed")),
            "port_forward.read_failed"
        );
        assert_eq!(
            error_message(&AppError::internal("port_forward.read_failed").with_detail("broken pipe")),
            "broken pipe"
        );
    }
}
