use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};

use log::{LevelFilter, Metadata};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::config::store::atomic_write;
use crate::error::{AppError, AppResult};

const APP_IDENTIFIER: &str = "com.mikuac.shipyardx";
const APP_SETTINGS_FILE: &str = "app-settings.json";
const DEFAULT_LOG_LEVEL: &str = "info";
const DEFAULT_DEPENDENCY_LOG_LEVEL: &str = "warn";

/// Log target prefix shared by every log record emitted by this app; anything
/// else comes from a dependency.
const APP_LOG_TARGET_PREFIX: &str = "shipyardx_lib";

/// Live log levels, read by the logger filter on every record so level changes
/// apply without restarting the app.
static APP_LOG_LEVEL: AtomicU8 = AtomicU8::new(LevelFilter::Info as u8);
static DEPENDENCY_LOG_LEVEL: AtomicU8 = AtomicU8::new(LevelFilter::Warn as u8);

#[derive(Debug, Default, Deserialize, Serialize)]
struct AppSettings {
    log_level: Option<String>,
    dependency_log_level: Option<String>,
}

/// Seeds the live log levels from disk before the logger is built.
pub fn init_log_levels() {
    let settings = startup_settings_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<AppSettings>(&raw).ok())
        .unwrap_or_default();

    store_level(
        &APP_LOG_LEVEL,
        resolve_level_filter(settings.log_level.as_deref(), LevelFilter::Info),
    );
    store_level(
        &DEPENDENCY_LOG_LEVEL,
        resolve_level_filter(settings.dependency_log_level.as_deref(), LevelFilter::Warn),
    );
}

/// Logger filter: app records follow the app level, everything else follows the
/// dependency level. Both are read live, so changes need no restart.
pub fn log_record_enabled(metadata: &Metadata) -> bool {
    let level = if is_app_target(metadata.target()) {
        &APP_LOG_LEVEL
    } else {
        &DEPENDENCY_LOG_LEVEL
    };
    metadata.level() as u8 <= level.load(Ordering::Relaxed)
}

pub fn get_log_level(app: &AppHandle) -> AppResult<String> {
    let settings = read_settings(app)?;
    Ok(normalize_log_level(settings.log_level.as_deref(), DEFAULT_LOG_LEVEL).to_string())
}

pub fn update_log_level(app: &AppHandle, level: String) -> AppResult<String> {
    let filter = resolve_level_filter(Some(&level), LevelFilter::Info);
    let normalized = log_level_name(filter);
    let mut settings = read_settings(app)?;
    settings.log_level = Some(normalized.to_string());
    write_settings(app, &settings)?;
    store_level(&APP_LOG_LEVEL, filter);
    Ok(normalized.to_string())
}

pub fn get_dependency_log_level(app: &AppHandle) -> AppResult<String> {
    let settings = read_settings(app)?;
    Ok(normalize_log_level(settings.dependency_log_level.as_deref(), DEFAULT_DEPENDENCY_LOG_LEVEL).to_string())
}

pub fn update_dependency_log_level(app: &AppHandle, level: String) -> AppResult<String> {
    let filter = resolve_level_filter(Some(&level), LevelFilter::Warn);
    let normalized = log_level_name(filter);
    let mut settings = read_settings(app)?;
    settings.dependency_log_level = Some(normalized.to_string());
    write_settings(app, &settings)?;
    store_level(&DEPENDENCY_LOG_LEVEL, filter);
    Ok(normalized.to_string())
}

fn read_settings(app: &AppHandle) -> AppResult<AppSettings> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let raw = std::fs::read_to_string(path).map_err(|e| AppError::internal("settings.read_failed").with_source(e))?;
    serde_json::from_str(&raw).map_err(|e| AppError::internal("settings.parse_failed").with_source(e))
}

fn write_settings(app: &AppHandle, settings: &AppSettings) -> AppResult<()> {
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| AppError::internal("settings.serialize_failed").with_source(e))?;
    atomic_write(&settings_path(app)?, json.as_bytes())
        .map_err(|e| AppError::internal("settings.write_failed").with_detail(e.detail.unwrap_or(e.code)))
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

fn normalize_log_level(level: Option<&str>, fallback: &'static str) -> &'static str {
    level.and_then(log_level_filter).map(log_level_name).unwrap_or(fallback)
}

fn resolve_level_filter(level: Option<&str>, fallback: LevelFilter) -> LevelFilter {
    level.and_then(log_level_filter).unwrap_or(fallback)
}

fn store_level(slot: &AtomicU8, level: LevelFilter) {
    slot.store(level as u8, Ordering::Relaxed);
}

fn is_app_target(target: &str) -> bool {
    target == APP_LOG_TARGET_PREFIX
        || target
            .strip_prefix(APP_LOG_TARGET_PREFIX)
            .is_some_and(|rest| rest.starts_with("::"))
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
    use log::Level;

    use super::*;

    #[test]
    fn normalizes_log_levels() {
        assert_eq!(normalize_log_level(Some("debug"), DEFAULT_LOG_LEVEL), "debug");
        assert_eq!(normalize_log_level(Some("WARNING"), DEFAULT_LOG_LEVEL), "warn");
        assert_eq!(normalize_log_level(Some("unknown"), DEFAULT_LOG_LEVEL), "info");
        assert_eq!(normalize_log_level(None, DEFAULT_LOG_LEVEL), "info");
        assert_eq!(normalize_log_level(None, DEFAULT_DEPENDENCY_LOG_LEVEL), "warn");
    }

    #[test]
    fn legacy_settings_keep_dependency_default() {
        let settings: AppSettings = serde_json::from_str(r#"{"log_level":"debug"}"#).unwrap();
        assert_eq!(
            resolve_level_filter(settings.log_level.as_deref(), LevelFilter::Info),
            LevelFilter::Debug
        );
        assert_eq!(
            resolve_level_filter(settings.dependency_log_level.as_deref(), LevelFilter::Warn),
            LevelFilter::Warn
        );
    }

    #[test]
    fn app_targets_are_told_apart_from_dependencies() {
        assert!(is_app_target("shipyardx_lib"));
        assert!(is_app_target("shipyardx_lib::docker::transport"));
        assert!(!is_app_target("russh::client"));
        assert!(!is_app_target("bollard::read"));
        assert!(!is_app_target("shipyardx_libextra::thing"));
    }

    #[test]
    fn filter_applies_each_level_to_its_own_targets() {
        store_level(&APP_LOG_LEVEL, LevelFilter::Debug);
        store_level(&DEPENDENCY_LOG_LEVEL, LevelFilter::Warn);

        let enabled =
            |target: &str, level: Level| log_record_enabled(&Metadata::builder().level(level).target(target).build());

        assert!(enabled("shipyardx_lib::docker::transport", Level::Debug));
        assert!(!enabled("shipyardx_lib::docker::transport", Level::Trace));
        assert!(!enabled("russh::client", Level::Debug));
        assert!(enabled("russh::client", Level::Warn));
    }

    #[test]
    fn updating_one_level_preserves_the_other() {
        let raw = r#"{"log_level":"debug","dependency_log_level":"error"}"#;
        let mut settings: AppSettings = serde_json::from_str(raw).unwrap();
        settings.dependency_log_level =
            Some(normalize_log_level(Some("trace"), DEFAULT_DEPENDENCY_LOG_LEVEL).to_string());

        let round_tripped: AppSettings = serde_json::from_str(&serde_json::to_string(&settings).unwrap()).unwrap();
        assert_eq!(round_tripped.log_level.as_deref(), Some("debug"));
        assert_eq!(round_tripped.dependency_log_level.as_deref(), Some("trace"));
    }
}
