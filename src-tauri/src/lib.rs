mod commands;
mod config;
mod core;
mod utils;

pub use core::state::AppState;

use std::collections::HashMap;
use std::sync::Mutex;

use config::store::{get_data_file, load_servers};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_file = get_data_file(app.handle());
            let servers = load_servers(&data_file);
            app.manage(AppState {
                servers: Mutex::new(servers),
                data_file: Mutex::new(data_file),
                terminals: Mutex::new(HashMap::new()),
                streams: Mutex::new(HashMap::new()),
                terminal_ws_clients: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 服务器管理
            commands::servers::get_servers,
            commands::servers::add_server,
            commands::servers::update_server,
            commands::servers::delete_server,
            commands::servers::test_connection,
            commands::servers::test_connection_direct,
            // 容器管理
            commands::containers::list_containers,
            commands::containers::start_container,
            commands::containers::stop_container,
            commands::containers::restart_container,
            commands::containers::remove_container,
            commands::containers::get_container_logs,
            // 镜像管理
            commands::images::list_images,
            commands::images::remove_image,
            commands::images::start_image_pull,
            commands::images::cancel_stream,
            // 系统信息 & 统计
            commands::system::get_docker_info,
            commands::system::get_container_stats,
            // 日志流
            commands::log_stream::start_log_stream,
            commands::log_stream::stop_log_stream,
            // SSH 终端
            commands::terminal::open_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("运行应用时出错");
}
