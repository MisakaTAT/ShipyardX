use crate::dto::container::ContainerStats;
use crate::utils::formatting::format_bytes_u64;
use bollard::models::ContainerStatsResponse;

fn cpu_percent(raw: &ContainerStatsResponse) -> f64 {
    let cpu_delta = raw
        .cpu_stats
        .as_ref()
        .and_then(|stats| stats.cpu_usage.as_ref())
        .and_then(|usage| usage.total_usage)
        .unwrap_or(0)
        .saturating_sub(
            raw.precpu_stats
                .as_ref()
                .and_then(|stats| stats.cpu_usage.as_ref())
                .and_then(|usage| usage.total_usage)
                .unwrap_or(0),
        );
    let sys_delta = raw
        .cpu_stats
        .as_ref()
        .and_then(|stats| stats.system_cpu_usage)
        .unwrap_or(0)
        .saturating_sub(
            raw.precpu_stats
                .as_ref()
                .and_then(|stats| stats.system_cpu_usage)
                .unwrap_or(0),
        );
    let num_cpus = raw
        .cpu_stats
        .as_ref()
        .and_then(|stats| stats.online_cpus)
        .unwrap_or_else(|| {
            raw.cpu_stats
                .as_ref()
                .and_then(|stats| stats.cpu_usage.as_ref())
                .and_then(|usage| usage.percpu_usage.as_ref())
                .map(|v| v.len() as u32)
                .unwrap_or(1)
        });
    if sys_delta > 0 {
        ((cpu_delta as f64 / sys_delta as f64) * num_cpus as f64 * 100.0 * 10.0).round() / 10.0
    } else {
        0.0
    }
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

pub fn compute_stats(raw: ContainerStatsResponse) -> ContainerStats {
    let cpu_percent = cpu_percent(&raw);
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
