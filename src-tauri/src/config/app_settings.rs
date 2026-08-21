use std::path::PathBuf;

use log::LevelFilter;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::config::store::atomic_write;
use crate::error::{AppError, AppResult};

const APP_IDENTIFIER: &str = "com.mikuac.shipyardx";
const APP_SETTINGS_FILE: &str = "app-settings.json";
const DEFAULT_LOG_LEVEL: &str = "info";

#[derive(Debug, Default, Deserialize, Serialize)]
struct AppSettings {
    log_level: Option<String>,
}

pub fn startup_log_level() -> LevelFilter {
    startup_settings_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<AppSettings>(&raw).ok())
        .and_then(|settings| settings.log_level)
        .as_deref()
        .and_then(log_level_filter)
        .unwrap_or(LevelFilter::Info)
}

pub fn get_log_level(app: &AppHandle) -> AppResult<String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(DEFAULT_LOG_LEVEL.to_string());
    }

    let raw = std::fs::read_to_string(path).map_err(|e| AppError::internal("settings.read_failed").with_source(e))?;
    let settings: AppSettings =
        serde_json::from_str(&raw).map_err(|e| AppError::internal("settings.parse_failed").with_source(e))?;
    Ok(normalize_log_level(settings.log_level.as_deref()).to_string())
}

pub fn update_log_level(app: &AppHandle, level: String) -> AppResult<String> {
    let normalized = normalize_log_level(Some(&level));
    let settings = AppSettings {
        log_level: Some(normalized.to_string()),
    };
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| AppError::internal("settings.serialize_failed").with_source(e))?;
    atomic_write(&settings_path(app)?, json.as_bytes())
        .map_err(|e| AppError::internal("settings.write_failed").with_detail(e.detail.unwrap_or(e.code)))?;
    Ok(normalized.to_string())
}

fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal("config.data_dir_unavailable").with_source(e))?;
    Ok(data_dir.join(APP_SETTINGS_FILE))
}

fn startup_settings_path() -> Option<PathBuf> {
    dirs::data_dir().map(|dir| dir.join(APP_IDENTIFIER).join(APP_SETTINGS_FILE))
}

fn normalize_log_level(level: Option<&str>) -> &'static str {
    level
        .and_then(log_level_filter)
        .map(log_level_name)
        .unwrap_or(DEFAULT_LOG_LEVEL)
}

fn log_level_filter(level: &str) -> Option<LevelFilter> {
    match level.trim().to_ascii_lowercase().as_str() {
        "off" => Some(LevelFilter::Off),
        "error" => Some(LevelFilter::Error),
        "warn" | "warning" => Some(LevelFilter::Warn),
        "info" => Some(LevelFilter::Info),
        "debug" => Some(LevelFilter::Debug),
        "trace" => Some(LevelFilter::Trace),
        _ => None,
    }
}

fn log_level_name(level: LevelFilter) -> &'static str {
    match level {
        LevelFilter::Off => "off",
        LevelFilter::Error => "error",
        LevelFilter::Warn => "warn",
        LevelFilter::Info => "info",
        LevelFilter::Debug => "debug",
        LevelFilter::Trace => "trace",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_log_levels() {
        assert_eq!(normalize_log_level(Some("debug")), "debug");
        assert_eq!(normalize_log_level(Some("WARNING")), "warn");
        assert_eq!(normalize_log_level(Some("unknown")), "info");
        assert_eq!(normalize_log_level(None), "info");
    }
}
