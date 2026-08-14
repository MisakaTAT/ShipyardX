use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use log::error;
use std::pin::Pin;
use std::task::{Context, Poll};

use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::TcpListener as TokioTcpListener;
use tokio::net::TcpStream as TokioTcpStream;
use tokio::sync::Semaphore;
use tokio::sync::watch;
use tokio::task::JoinSet;

use crate::config::timeouts::PORT_FORWARD_ACCEPT_RETRY_DELAY;
use crate::dto::port_forward::PortForwardError;
use crate::dto::server::ServerConfig;
use crate::error::AppError;
use crate::ssh::pool;

pub(super) struct PortForwardBridgeArgs {
    pub(super) local_stream: TcpStream,
    pub(super) server_cfg: Arc<ServerConfig>,
    pub(super) remote_host: Arc<str>,
    pub(super) remote_port: u16,
    pub(super) last_error: Arc<Mutex<Option<PortForwardError>>>,
    pub(super) tx_bytes: Arc<AtomicU64>,
    pub(super) rx_bytes: Arc<AtomicU64>,
    pub(super) stop_rx: watch::Receiver<bool>,
}

pub(super) struct PortForwardAcceptArgs {
    pub(super) listener: TcpListener,
    pub(super) server_cfg: Arc<ServerConfig>,
    pub(super) remote_host: Arc<str>,
    pub(super) remote_port: u16,
    pub(super) stop_rx: watch::Receiver<bool>,
    pub(super) last_error: Arc<Mutex<Option<PortForwardError>>>,
    pub(super) tx_bytes: Arc<AtomicU64>,
    pub(super) rx_bytes: Arc<AtomicU64>,
}

struct CountingStream<T> {
    inner: T,
    read_counter: Arc<AtomicU64>,
    write_counter: Arc<AtomicU64>,
}

impl<T: AsyncRead + Unpin> AsyncRead for CountingStream<T> {
    fn poll_read(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        match Pin::new(&mut self.inner).poll_read(cx, buf) {
            Poll::Ready(Ok(())) => {
                self.read_counter
                    .fetch_add((buf.filled().len() - before) as u64, Ordering::Relaxed);
                Poll::Ready(Ok(()))
            }
            result => result,
        }
    }
}

impl<T: AsyncWrite + Unpin> AsyncWrite for CountingStream<T> {
    fn poll_write(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<std::io::Result<usize>> {
        match Pin::new(&mut self.inner).poll_write(cx, buf) {
            Poll::Ready(Ok(written)) => {
                self.write_counter.fetch_add(written as u64, Ordering::Relaxed);
                Poll::Ready(Ok(written))
            }
            result => result,
        }
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
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
        mut stop_rx,
    } = args;

    let _ = local_stream.set_nodelay(true);
    let log_server_id = server_cfg.id.clone();
    let log_remote_host = remote_host.to_string();

    let transfer = async move {
        let channel = pool::open_direct_tcpip(&server_cfg, remote_host.as_ref(), remote_port)
            .await?
            .map_err(|e| AppError::unavailable("port_forward.remote_unreachable").with_source(e))?;

        local_stream
            .set_nonblocking(true)
            .map_err(|e| AppError::internal("port_forward.local_socket_config_failed").with_source(e))?;
        let local_stream = TokioTcpStream::from_std(local_stream)
            .map_err(|e| AppError::internal("port_forward.local_socket_takeover_failed").with_source(e))?;
        let remote_stream = channel.into_stream();

        let mut local_stream = CountingStream {
            inner: local_stream,
            read_counter: tx_bytes,
            write_counter: rx_bytes,
        };
        let mut remote_stream = remote_stream;
        tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream)
            .await
            .map(|_| ())
            .map_err(|e| AppError::internal("port_forward.transfer_failed").with_source(e))
    };
    let result = tokio::select! {
        result = transfer => result,
        changed = stop_rx.changed() => {
            let _ = changed;
            Ok(())
        }
    };

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

    const MAX_ACTIVE_BRIDGES: usize = 64;
    let permits = Arc::new(Semaphore::new(MAX_ACTIVE_BRIDGES));
    let mut bridges = JoinSet::new();
    loop {
        tokio::select! {
            Some(_) = bridges.join_next(), if !bridges.is_empty() => {}
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
                    let stop_rx = stop_rx.clone();
                    let permits = Arc::clone(&permits);
                    bridges.spawn(async move {
                        let Ok(_permit) = permits.acquire_owned().await else {
                            return;
                        };
                        bridge_once(PortForwardBridgeArgs {
                            local_stream: stream,
                            server_cfg: cfg,
                            remote_host: rh,
                            remote_port: rp,
                            last_error: le,
                            tx_bytes: tx,
                            rx_bytes: rx,
                            stop_rx,
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
