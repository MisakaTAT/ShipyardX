mod commands;
mod config;
mod docker;
mod dto;
mod error;
mod scripts;
mod services;
mod ssh;
mod state;
mod utils;

pub use error::{AppError, AppErrorKind, AppResult};
pub use state::AppState;

use std::collections::HashMap;
use std::sync::{Mutex, RwLock};

use config::store::{get_data_file, load_servers};
use dto::events::{
    AppstoreSyncProgress, DockerStreamError, DockerStreamPayload, DockerStreamRefresh, DockerStreamStatus,
    EventStreamStatus, ImageExportProgress, ImageImportProgress, ImagePullDone, ImagePullLayerProgress,
    ImagePullProgress, InstallStepEvent,
};
use log::{error, info, warn};
#[cfg(debug_assertions)]
use specta_typescript::Typescript;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_specta::{Builder, ErrorHandlingMode, collect_commands, collect_events};

pub fn run() {
    let specta_builder = Builder::<tauri::Wry>::new()
        .error_handling(ErrorHandlingMode::Throw)
        .commands(collect_commands![
            commands::servers::get_servers,
            commands::servers::add_server,
            commands::servers::update_server,
            commands::servers::delete_server,
            commands::servers::test_connection,
            commands::servers::test_server_connection,
            commands::servers::test_connection_direct,
            commands::servers::test_server_connection_direct,
            commands::containers::list_containers,
            commands::containers::start_container,
            commands::containers::stop_container,
            commands::containers::restart_container,
            commands::containers::remove_container,
            commands::containers::prune_stopped_containers,
            commands::containers::inspect_container,
            commands::containers::get_container_logs,
            commands::containers::run_container,
            commands::images::list_images,
            commands::images::inspect_image,
            commands::images::get_image_history,
            commands::images::remove_image,
            commands::images::prune_dangling_images,
            commands::images::prune_unused_images,
            commands::images::prune_builder_cache,
            commands::images::export_image,
            commands::images::import_image,
            commands::images::start_image_pull,
            commands::images::cancel_stream,
            commands::networks::list_networks,
            commands::networks::create_network,
            commands::networks::inspect_network,
            commands::networks::remove_network,
            commands::networks::prune_unused_networks,
            commands::volumes::list_volumes,
            commands::volumes::create_volume,
            commands::volumes::inspect_volume,
            commands::volumes::remove_volume,
            commands::volumes::prune_unused_volumes,
            commands::system::check_docker_access,
            commands::system::list_system_fonts,
            commands::system::get_docker_info,
            commands::system::get_container_stats,
            commands::system::get_docker_daemon_settings,
            commands::system::update_docker_daemon_settings,
            commands::system::restart_docker_daemon,
            commands::system::open_devtools,
            commands::log_stream::start_log_stream,
            commands::log_stream::stop_log_stream,
            commands::docker_events::start_event_stream,
            commands::docker_events::stop_event_stream,
            commands::port_forward::list_local_addresses,
            commands::port_forward::list_port_forwards,
            commands::port_forward::list_port_forwards_all,
            commands::port_forward::create_port_forward_rule,
            commands::port_forward::set_port_forward_enabled,
            commands::port_forward::delete_port_forward,
            commands::port_forward::start_all_enabled,
            commands::port_forward::start_all_enabled_global,
            commands::port_forward::stop_all_global,
            commands::port_forward::stop_port_forward,
            commands::terminal::open_terminal,
            commands::terminal::open_container_exec_terminal,
            commands::terminal::close_terminal,
            commands::terminal::save_terminal_export,
            commands::appstore::sync_appstore,
            commands::appstore::list_apps,
            commands::appstore::get_appstore_settings,
            commands::appstore::update_appstore_settings,
            commands::appstore::get_appstore_cache_info,
            commands::appstore::clear_appstore_cache,
            commands::appstore::get_app_detail,
            commands::appstore::install_app,
        ])
        .events(collect_events![
            DockerStreamPayload,
            DockerStreamStatus,
            DockerStreamRefresh,
            DockerStreamError,
            ImagePullProgress,
            ImagePullDone,
            ImageExportProgress,
            ImageImportProgress,
            InstallStepEvent,
            AppstoreSyncProgress,
        ])
        .typ::<EventStreamStatus>()
        .typ::<ImagePullLayerProgress>()
        .typ::<AppError>()
        .typ::<AppErrorKind>();

    #[cfg(debug_assertions)]
    if let Err(error) = specta_builder.export(Typescript::default(), "../src/types/app-bindings.ts") {
        eprintln!("导出 Tauri Specta TypeScript 绑定失败: {error}");
    }

    let invoke_handler = specta_builder.invoke_handler();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("shipyardx".into()),
                    }),
                ])
                .level(log::LevelFilter::Info)
                .level_for("shipyardx_lib::services::terminal", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::services::port_forward", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::services::docker_events", log::LevelFilter::Info)
                .level_for("shipyardx_lib::services::log_stream", log::LevelFilter::Info)
                .level_for("shipyardx_lib::services::images", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::services::system", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::services::appstore", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::services::appstore_repo", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::docker::client", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::docker::transport", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::ssh::client", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::ssh::exec", log::LevelFilter::Debug)
                .level_for("shipyardx_lib::ssh::pool", log::LevelFilter::Debug)
                .rotation_strategy(RotationStrategy::KeepAll)
                .max_file_size(10_000_000)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(invoke_handler)
        .setup(move |app| {
            specta_builder.mount_events(app);
            let data_file = get_data_file(app.handle()).map_err(|error| {
                let detail = error.detail.unwrap_or(error.message);
                Box::<dyn std::error::Error>::from(detail)
            })?;
            let servers = load_servers(&data_file);
            match app.path().app_log_dir() {
                Ok(log_dir) => info!(target: "shipyardx_lib::app", "app log directory: {}", log_dir.display()),
                Err(error) => warn!(
                    target: "shipyardx_lib::app",
                    "failed to resolve app log directory: {}",
                    error
                ),
            }
            info!(
                target: "shipyardx_lib::app",
                "app setup complete; server_count={} data_file={}",
                servers.len(),
                data_file.display()
            );
            app.manage(AppState {
                server_store: Mutex::new(()),
                servers: RwLock::new(servers),
                data_file: Mutex::new(data_file),
                terminals: RwLock::new(HashMap::new()),
                streams: Mutex::new(HashMap::new()),
                terminal_ws_clients: RwLock::new(HashMap::new()),
                terminal_handshakes: RwLock::new(HashMap::new()),
                event_streams: RwLock::new(HashMap::new()),
                port_forwards: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            error!(target: "shipyardx_lib::app", "app run failed: {}", error);
            eprintln!("运行应用时出错: {error}");
        });
}
