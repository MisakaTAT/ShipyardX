use std::time::Duration;

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

pub const SOCKET_IO_TIMEOUT: Duration = Duration::from_secs(120);

pub const TERMINAL_SSH_READ_POLL_MS: u32 = 50;

pub const TERMINAL_WS_IDLE_SLEEP_MS: u64 = 2;
