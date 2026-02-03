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
        "Message routed via AORP - mode: {}, size: {} bytes", 
        mode, 
        packet.size()
    );
    
    Ok(packet.encrypted_payload)
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
