use chrono::{Local, TimeZone, Utc};

const KB: f64 = 1024.0;
const MB: f64 = KB * 1024.0;
const GB: f64 = MB * 1024.0;
const TB: f64 = GB * 1024.0;

pub fn format_bytes_u64(bytes: u64) -> String {
    format_bytes(bytes as f64)
}

pub fn format_bytes_i64(bytes: i64) -> String {
    if bytes <= 0 {
        return "0 B".to_string();
    }
    format_bytes(bytes as f64)
}

fn format_bytes(bytes: f64) -> String {
    if !bytes.is_finite() || bytes <= 0.0 {
        return "0 B".to_string();
    }
    if bytes >= TB {
        return format!("{:.2} TiB", bytes / TB);
    }
    if bytes >= GB {
        return format!("{:.2} GiB", bytes / GB);
    }
    if bytes >= MB {
        return format!("{:.2} MiB", bytes / MB);
    }
    if bytes >= KB {
        return format!("{:.2} KiB", bytes / KB);
    }
    format!("{:.0} B", bytes)
}

pub fn format_unix_seconds(ts: i64) -> String {
    if ts <= 0 {
        return "-".to_string();
    }
    match Local.timestamp_opt(ts, 0).single() {
        Some(dt) => dt.format("%Y/%m/%d %H:%M:%S").to_string(),
        None => "-".to_string(),
    }
}

pub fn format_unix_seconds_time(ts: i64) -> String {
    if ts <= 0 {
        return "-".to_string();
    }
    match Local.timestamp_opt(ts, 0).single() {
        Some(dt) => dt.format("%H:%M:%S").to_string(),
        None => "-".to_string(),
    }
}

pub fn format_time_ago_from_unix(ts: i64) -> String {
    if ts <= 0 {
        return "-".to_string();
    }
    let Some(dt) = Utc.timestamp_opt(ts, 0).single() else {
        return "-".to_string();
    };
    let diff = Utc::now().signed_duration_since(dt);
    let secs = diff.num_seconds().max(0);
    if secs < 60 {
        return "刚刚".to_string();
    }
    let mins = diff.num_minutes();
    if mins < 60 {
        return format!("{mins} 分钟前");
    }
    let hours = diff.num_hours();
    if hours < 24 {
        return format!("{hours} 小时前");
    }
    let days = diff.num_days();
    if days < 30 {
        return format!("{days} 天前");
    }
    if days < 365 {
        return format!("{} 个月前", days / 30);
    }
    format!("{} 年前", days / 365)
}

pub fn format_datetime_string(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "-".to_string();
    }
    match chrono::DateTime::parse_from_rfc3339(trimmed) {
        Ok(dt) => dt.with_timezone(&Local).format("%Y/%m/%d %H:%M:%S").to_string(),
        Err(_) => trimmed.to_string(),
    }
}

pub fn format_time_ago_from_datetime_string(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "-".to_string();
    }
    let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trimmed) else {
        return trimmed.to_string();
    };
    let diff = Utc::now().signed_duration_since(dt.with_timezone(&Utc));
    let secs = diff.num_seconds().max(0);
    if secs < 60 {
        return "刚刚".to_string();
    }
    let mins = diff.num_minutes();
    if mins < 60 {
        return format!("{mins} 分钟前");
    }
    let hours = diff.num_hours();
    if hours < 24 {
        return format!("{hours} 小时前");
    }
    let days = diff.num_days();
    if days < 30 {
        return format!("{days} 天前");
    }
    if days < 365 {
        return format!("{} 个月前", days / 30);
    }
    format!("{} 年前", days / 365)
}

pub fn format_speed(bytes_per_sec: f64) -> String {
    if !bytes_per_sec.is_finite() || bytes_per_sec <= 0.0 {
        return "0 B/s".to_string();
    }
    format!("{}/s", format_bytes(bytes_per_sec))
}
