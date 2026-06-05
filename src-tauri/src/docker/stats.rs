use crate::contracts::docker_api::stats::DockerStats;
use crate::contracts::frontend::container::ContainerStats;

fn cpu_percent(raw: &DockerStats) -> f64 {
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
    if sys_delta > 0 {
        ((cpu_delta as f64 / sys_delta as f64) * num_cpus as f64 * 100.0 * 10.0).round() / 10.0
    } else {
        0.0
    }
}

fn memory(raw: &DockerStats) -> (u64, u64, f64) {
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
    (mem_usage, mem_limit, mem_percent)
}

fn net_totals(raw: &DockerStats) -> (u64, u64) {
    raw.networks
        .as_ref()
        .map(|nets| {
            nets.values()
                .fold((0u64, 0u64), |(rx, tx), n| (rx + n.rx_bytes, tx + n.tx_bytes))
        })
        .unwrap_or((0, 0))
}

fn blk_totals(raw: &DockerStats) -> (u64, u64) {
    raw.blkio_stats
        .io_service_bytes_recursive
        .as_ref()
        .map(|entries| {
            entries.iter().fold((0u64, 0u64), |(r, w), e| {
                if e.op.eq_ignore_ascii_case("read") {
                    (r + e.value, w)
                } else if e.op.eq_ignore_ascii_case("write") {
                    (r, w + e.value)
                } else {
                    (r, w)
                }
            })
        })
        .unwrap_or((0, 0))
}

pub fn compute_stats(raw: DockerStats) -> ContainerStats {
    let cpu_percent = cpu_percent(&raw);
    let (mem_usage, mem_limit, mem_percent) = memory(&raw);
    let (net_rx, net_tx) = net_totals(&raw);
    let (blk_read, blk_write) = blk_totals(&raw);

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
