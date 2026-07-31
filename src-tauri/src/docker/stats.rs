use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::dto::container::ContainerStats;
use crate::utils::formatting::format_bytes_u64;
use bollard::models::ContainerStatsResponse;

/// 采样有效期，过期的不再作为差值基准
const SAMPLE_TTL: Duration = Duration::from_secs(60);

#[derive(Clone, Copy)]
struct CpuSample {
    total_usage: u64,
    system_usage: u64,
    at: Instant,
}

fn cpu_samples() -> &'static Mutex<HashMap<String, CpuSample>> {
    static SAMPLES: OnceLock<Mutex<HashMap<String, CpuSample>>> = OnceLock::new();
    SAMPLES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 记录本次采样并返回上一次采样
fn swap_sample(key: &str, current: CpuSample) -> Option<CpuSample> {
    let mut guard = cpu_samples().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.retain(|_, sample| current.at.duration_since(sample.at) < SAMPLE_TTL);
    guard.insert(key.to_string(), current)
}

fn cpu_percent(key: &str, raw: &ContainerStatsResponse) -> f64 {
    let cpu_stats = raw.cpu_stats.as_ref();
    let total_usage = cpu_stats
        .and_then(|stats| stats.cpu_usage.as_ref())
        .and_then(|usage| usage.total_usage)
        .unwrap_or(0);
    let system_usage = cpu_stats.and_then(|stats| stats.system_cpu_usage).unwrap_or(0);
    let num_cpus = cpu_stats.and_then(|stats| stats.online_cpus).unwrap_or_else(|| {
        cpu_stats
            .and_then(|stats| stats.cpu_usage.as_ref())
            .and_then(|usage| usage.percpu_usage.as_ref())
            .map(|v| v.len() as u32)
            .unwrap_or(1)
    });

    let previous = swap_sample(
        key,
        CpuSample {
            total_usage,
            system_usage,
            at: Instant::now(),
        },
    );

    // one-shot 查询下 precpu_stats 全为 0，相减得到的是生命周期均值，只能拿上次采样做基准
    let precpu_system = raw
        .precpu_stats
        .as_ref()
        .and_then(|stats| stats.system_cpu_usage)
        .unwrap_or(0);
    let (prev_total, prev_system) = if precpu_system > 0 {
        (
            raw.precpu_stats
                .as_ref()
                .and_then(|stats| stats.cpu_usage.as_ref())
                .and_then(|usage| usage.total_usage)
                .unwrap_or(0),
            precpu_system,
        )
    } else {
        match previous {
            Some(sample) => (sample.total_usage, sample.system_usage),
            // 首次采样没有基准
            None => return 0.0,
        }
    };

    let cpu_delta = total_usage.saturating_sub(prev_total);
    let sys_delta = system_usage.saturating_sub(prev_system);
    if sys_delta == 0 {
        return 0.0;
    }
    ((cpu_delta as f64 / sys_delta as f64) * num_cpus as f64 * 100.0 * 10.0).round() / 10.0
}

fn memory(raw: &ContainerStatsResponse) -> (u64, u64, f64) {
    let usage = raw.memory_stats.as_ref().and_then(|stats| stats.usage).unwrap_or(0) as u64;
    let cache = raw
        .memory_stats
        .as_ref()
        .and_then(|stats| stats.stats.as_ref())
        .and_then(|s| s.get("cache").or(s.get("inactive_file")).copied())
        .unwrap_or(0) as u64;
    let mem_usage = usage.saturating_sub(cache);
    let mem_limit = raw.memory_stats.as_ref().and_then(|stats| stats.limit).unwrap_or(1) as u64;
    let mem_percent = ((mem_usage as f64 / mem_limit as f64) * 100.0 * 10.0).round() / 10.0;
    (mem_usage, mem_limit, mem_percent)
}

fn net_totals(raw: &ContainerStatsResponse) -> (u64, u64) {
    raw.networks
        .as_ref()
        .map(|nets| {
            nets.values().fold((0u64, 0u64), |(rx, tx), n| {
                (rx + n.rx_bytes.unwrap_or(0), tx + n.tx_bytes.unwrap_or(0))
            })
        })
        .unwrap_or((0, 0))
}

fn blk_totals(raw: &ContainerStatsResponse) -> (u64, u64) {
    raw.blkio_stats
        .as_ref()
        .and_then(|stats| stats.io_service_bytes_recursive.as_ref())
        .map(|entries: &Vec<_>| {
            entries.iter().fold((0u64, 0u64), |(r, w), e| {
                let op = e.op.as_deref().unwrap_or_default();
                let value = e.value.unwrap_or(0);
                if op.eq_ignore_ascii_case("read") {
                    (r + value, w)
                } else if op.eq_ignore_ascii_case("write") {
                    (r, w + value)
                } else {
                    (r, w)
                }
            })
        })
        .unwrap_or((0, 0))
}

/// key 形如 `server_id|container_id`，用于区分不同服务器上的同名容器
pub fn compute_stats(key: &str, raw: ContainerStatsResponse) -> ContainerStats {
    let cpu_percent = cpu_percent(key, &raw);
    let (mem_usage, mem_limit, mem_percent) = memory(&raw);
    let (net_rx, net_tx) = net_totals(&raw);
    let (blk_read, blk_write) = blk_totals(&raw);

    ContainerStats {
        cpu_percent,
        mem_percent,
        mem_usage: format_bytes_u64(mem_usage),
        mem_limit: format_bytes_u64(mem_limit),
        mem: format!("{} / {}", format_bytes_u64(mem_usage), format_bytes_u64(mem_limit)),
        net_rx: format_bytes_u64(net_rx),
        net_tx: format_bytes_u64(net_tx),
        net: format!("{} / {}", format_bytes_u64(net_rx), format_bytes_u64(net_tx)),
        blk_read: format_bytes_u64(blk_read),
        blk_write: format_bytes_u64(blk_write),
        blk: format!("{} / {}", format_bytes_u64(blk_read), format_bytes_u64(blk_write)),
    }
}
