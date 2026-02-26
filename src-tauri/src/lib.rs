mod models;
mod ollama;
mod commands;
mod sync_server;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Connection
            test_connection,
            get_connection_status,
            // Models
            list_models,
            show_model,
            pull_model,
            delete_model,
            // Chat
            send_message,
            generate_title,
            // Tools
            fetch_webpage,
            // LAN Sync
            start_sync_server,
            stop_sync_server,
            is_sync_server_running,
            get_local_ip,
            update_sync_data,
            // Comparison
            compare_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
