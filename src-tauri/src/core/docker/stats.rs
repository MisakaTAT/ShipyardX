use crate::models::docker::stats::DockerStats;
use crate::models::app::system::ContainerStats;

// ── 计算逻辑 ─────────────────────────────────────────────────

pub fn compute_stats(raw: DockerStats) -> ContainerStats {
    // CPU %
    let cpu_delta = raw
        .cpu_stats
        .cpu_usage
        .total_usage
        .saturating_sub(raw.precpu_stats.cpu_usage.total_usage);
    let sys_delta = raw
        .cpu_stats
        .system_cpu_usage
        .unwrap_or(0)
        .saturating_sub(raw.precpu_stats.system_cpu_usage.unwrap_or(0));
    let num_cpus = raw.cpu_stats.online_cpus.unwrap_or_else(|| {
        raw.cpu_stats
            .cpu_usage
            .percpu_usage
            .as_ref()
            .map(|v| v.len() as u32)
            .unwrap_or(1)
    });
    let cpu_percent = if sys_delta > 0 {
        ((cpu_delta as f64 / sys_delta as f64) * num_cpus as f64 * 100.0 * 10.0).round() / 10.0
    } else {
        0.0
    };

    // 内存（减去 page cache）
    let usage = raw.memory_stats.usage.unwrap_or(0);
    let cache = raw
        .memory_stats
        .stats
        .as_ref()
        .and_then(|s| s.get("cache").or(s.get("inactive_file")).copied())
        .unwrap_or(0);
    let mem_usage = usage.saturating_sub(cache);
    let mem_limit = raw.memory_stats.limit.unwrap_or(1);
    let mem_percent = ((mem_usage as f64 / mem_limit as f64) * 100.0 * 10.0).round() / 10.0;

    // 网络 I/O（汇总所有接口）
    let (net_rx, net_tx) = raw
        .networks
        .as_ref()
        .map(|nets| {
            nets.values()
                .fold((0u64, 0u64), |(rx, tx), n| (rx + n.rx_bytes, tx + n.tx_bytes))
        })
        .unwrap_or((0, 0));

    // 块 I/O
    let (blk_read, blk_write) = raw
        .blkio_stats
        .io_service_bytes_recursive
        .as_ref()
        .map(|entries| {
            entries
                .iter()
                .fold((0u64, 0u64), |(r, w), e| match e.op.to_lowercase().as_str() {
                    "read" => (r + e.value, w),
                    "write" => (r, w + e.value),
                    _ => (r, w),
                })
        })
        .unwrap_or((0, 0));

    ContainerStats {
        cpu_percent,
        mem_usage,
        mem_limit,
        mem_percent,
        net_rx,
        net_tx,
        blk_read,
        blk_write,
    }
}
