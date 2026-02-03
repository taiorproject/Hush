#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod quic_transport;
mod relay_client;
mod taior_bridge;

use std::sync::Arc;
use tokio::sync::RwLock;
use tracing_subscriber;

use crate::quic_transport::QuicTransport;
use crate::taior_bridge::TaiorState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let taior_state = Arc::new(RwLock::new(TaiorState::new()));
    let quic_transport = Arc::new(RwLock::new(QuicTransport::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(taior_state)
        .manage(quic_transport)
        .invoke_handler(tauri::generate_handler![
            taior_bridge::taior_init,
            taior_bridge::taior_send,
            taior_bridge::taior_address,
            taior_bridge::taior_enable_cover_traffic,
            quic_transport::connect_to_relay,
            quic_transport::disconnect_relay,
            quic_transport::send_via_quic,
            quic_transport::get_relay_status,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            
            tokio::spawn(async move {
                tracing::info!("Hush Tauri backend initialized with QUIC + AORP");
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
