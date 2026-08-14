use std::time::Duration;

pub const SSH_CONNECT_TIMEOUT: Duration = Duration::from_secs(12);
pub const SSH_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(15);
pub const SSH_SOCKET_IO_TIMEOUT: Duration = Duration::from_secs(90);

pub const DOCKER_HTTP_REQUEST_TIMEOUT_SECS: u64 = 90;
pub const DOCKER_HIJACK_HEAD_READ_TIMEOUT: Duration = Duration::from_secs(12);
pub const DOCKER_HIJACK_ERROR_READ_TIMEOUT: Duration = Duration::from_secs(3);

pub const DOCKER_EVENT_RECONNECT_DELAYS_SECS: &[u64] = &[1, 2, 4, 8, 15, 30];
pub const DOCKER_EVENT_REFRESH_THROTTLE_MS: u128 = 500;

pub const PORT_FORWARD_ACCEPT_RETRY_DELAY: Duration = Duration::from_millis(100);
pub const PORT_FORWARD_SPEED_TICK: Duration = Duration::from_secs(1);
pub const PORT_FORWARD_WARMUP_TIMEOUT: Duration = Duration::from_secs(15);
