use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use taior::{Taior, SendOptions, RoutingMode};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaiorConfig {
    pub bootstrap_nodes: Vec<String>,
}

pub struct TaiorState {
    instance: Option<Taior>,
    cover_traffic_enabled: bool,
    cover_traffic_ratio: f32,
}

impl TaiorState {
    pub fn new() -> Self {
        Self {
            instance: None,
            cover_traffic_enabled: false,
            cover_traffic_ratio: 0.0,
        }
    }
}

#[tauri::command]
pub async fn taior_init(
    config: TaiorConfig,
    state: State<'_, Arc<RwLock<TaiorState>>>,
) -> Result<String, String> {
    let mut taior_state = state.write().await;
    
    let taior = if config.bootstrap_nodes.is_empty() {
        Taior::new()
    } else {
        Taior::with_bootstrap(config.bootstrap_nodes)
    };
    
    let address = taior.address().to_string();
    taior_state.instance = Some(taior);
    
    tracing::info!("Taior initialized with address: {}", address);
    Ok(address)
}

#[tauri::command]
pub async fn taior_send(
    payload: Vec<u8>,
    mode: String,
    state: State<'_, Arc<RwLock<TaiorState>>>,
) -> Result<Vec<u8>, String> {
    let mut taior_state = state.write().await;
    
    let taior = taior_state.instance.as_mut()
        .ok_or_else(|| "Taior not initialized".to_string())?;
    
    let routing_mode = match mode.as_str() {
        "fast" => RoutingMode::Fast,
        "mix" | "reinforced" => RoutingMode::Mix,
        "adaptive" => RoutingMode::Adaptive,
        _ => return Err(format!("Invalid routing mode: {}", mode)),
    };
    
    let options = match routing_mode {
        RoutingMode::Fast => SendOptions::fast(),
        RoutingMode::Mix => SendOptions::mix(),
        RoutingMode::Adaptive => SendOptions::adaptive(),
    };
    
    let packet = taior.send(&payload, options)
        .map_err(|e| format!("AORP routing failed: {}", e))?;
    
    tracing::debug!(
        "Message routed via AORP - size: {} bytes", 
        packet.size()
    );
    
    // Serialize: [4 bytes payload_len] [encrypted_payload] [ikm]
    // Same format as wasm.rs send() for consistency
    let payload_len = packet.encrypted_payload.len() as u32;
    let mut result = Vec::with_capacity(4 + packet.encrypted_payload.len() + packet.ikm.len());
    result.extend_from_slice(&payload_len.to_be_bytes());
    result.extend_from_slice(&packet.encrypted_payload);
    result.extend_from_slice(&packet.ikm);
    
    Ok(result)
}

#[tauri::command]
pub async fn taior_address(
    state: State<'_, Arc<RwLock<TaiorState>>>,
) -> Result<String, String> {
    let taior_state = state.read().await;
    
    let taior = taior_state.instance.as_ref()
        .ok_or_else(|| "Taior not initialized".to_string())?;
    
    Ok(taior.address().to_string())
}

#[tauri::command]
pub async fn taior_enable_cover_traffic(
    enabled: bool,
    ratio: f32,
    state: State<'_, Arc<RwLock<TaiorState>>>,
) -> Result<(), String> {
    let mut taior_state = state.write().await;
    
    let taior = taior_state.instance.as_mut()
        .ok_or_else(|| "Taior not initialized".to_string())?;
    
    taior.enable_cover_traffic(enabled, ratio);
    taior_state.cover_traffic_enabled = enabled;
    taior_state.cover_traffic_ratio = ratio;
    
    tracing::info!("Cover traffic: enabled={}, ratio={}", enabled, ratio);
    Ok(())
}
