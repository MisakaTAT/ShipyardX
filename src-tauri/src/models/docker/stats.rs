use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct DockerStats {
    pub cpu_stats: CpuStats,
    pub precpu_stats: CpuStats,
    pub memory_stats: MemStats,
    pub networks: Option<HashMap<String, NetStats>>,
    pub blkio_stats: BlkioStats,
}

#[derive(Deserialize)]
pub struct CpuStats {
    pub cpu_usage: CpuUsage,
    pub system_cpu_usage: Option<u64>,
    pub online_cpus: Option<u32>,
}

#[derive(Deserialize)]
pub struct CpuUsage {
    pub total_usage: u64,
    pub percpu_usage: Option<Vec<u64>>,
}

#[derive(Deserialize)]
pub struct MemStats {
    pub usage: Option<u64>,
    pub limit: Option<u64>,
    pub stats: Option<HashMap<String, u64>>,
}

#[derive(Deserialize)]
pub struct NetStats {
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Deserialize)]
pub struct BlkioStats {
    pub io_service_bytes_recursive: Option<Vec<BlkioEntry>>,
}

#[derive(Deserialize)]
pub struct BlkioEntry {
    pub op: String,
    pub value: u64,
}
