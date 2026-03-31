use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct RawStats {
    pub cpu_stats: RawCpuStats,
    pub precpu_stats: RawCpuStats,
    pub memory_stats: RawMemStats,
    pub networks: Option<HashMap<String, RawNetStats>>,
    pub blkio_stats: RawBlkioStats,
}

#[derive(Deserialize)]
pub struct RawCpuStats {
    pub cpu_usage: RawCpuUsage,
    pub system_cpu_usage: Option<u64>,
    pub online_cpus: Option<u32>,
}

#[derive(Deserialize)]
pub struct RawCpuUsage {
    pub total_usage: u64,
    pub percpu_usage: Option<Vec<u64>>,
}

#[derive(Deserialize)]
pub struct RawMemStats {
    pub usage: Option<u64>,
    pub limit: Option<u64>,
    pub stats: Option<HashMap<String, u64>>,
}

#[derive(Deserialize)]
pub struct RawNetStats {
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Deserialize)]
pub struct RawBlkioStats {
    pub io_service_bytes_recursive: Option<Vec<RawBlkioEntry>>,
}

#[derive(Deserialize)]
pub struct RawBlkioEntry {
    pub op: String,
    pub value: u64,
}
