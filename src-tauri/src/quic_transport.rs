use anyhow::{Context, Result};
use quinn::{ClientConfig, Endpoint, Connection};
use rustls::pki_types::CertificateDer;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayInfo {
    pub address: String,
    pub port: u16,
    pub public_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RelayStatus {
    pub connected: bool,
    pub relay_address: Option<String>,
    pub latency_ms: Option<u64>,
}

pub struct QuicTransport {
    endpoint: Option<Endpoint>,
    active_connection: Option<Connection>,
    relay_info: Option<RelayInfo>,
}

impl QuicTransport {
    pub fn new() -> Self {
        Self {
            endpoint: None,
            active_connection: None,
            relay_info: None,
        }
    }

    async fn create_endpoint() -> Result<Endpoint> {
        let client_config = configure_client()?;
        
        let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;
        endpoint.set_default_client_config(client_config);
        
        Ok(endpoint)
    }

    async fn connect_to_address(&mut self, addr: SocketAddr) -> Result<Connection> {
        let endpoint = if let Some(ep) = &self.endpoint {
            ep
        } else {
            let ep = Self::create_endpoint().await?;
            self.endpoint = Some(ep);
            self.endpoint.as_ref().unwrap()
        };

        let connection = endpoint
            .connect(addr, "localhost")?
            .await
            .context("Failed to establish QUIC connection")?;

        tracing::info!("QUIC connection established to {}", addr);
        Ok(connection)
    }
}

fn configure_client() -> Result<ClientConfig> {
    let crypto = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(SkipServerVerification))
        .with_no_client_auth();

    Ok(ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(crypto)?
    )))
}

#[derive(Debug)]
struct SkipServerVerification;

impl rustls::client::danger::ServerCertVerifier for SkipServerVerification {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        vec![
            rustls::SignatureScheme::RSA_PKCS1_SHA256,
            rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
            rustls::SignatureScheme::ED25519,
        ]
    }
}

#[tauri::command]
pub async fn connect_to_relay(
    relay: RelayInfo,
    state: State<'_, Arc<RwLock<QuicTransport>>>,
) -> Result<String, String> {
    let mut transport = state.write().await;
    
    let addr: SocketAddr = format!("{}:{}", relay.address, relay.port)
        .parse()
        .map_err(|e| format!("Invalid relay address: {}", e))?;
    
    let connection = transport
        .connect_to_address(addr)
        .await
        .map_err(|e| format!("QUIC connection failed: {}", e))?;
    
    transport.active_connection = Some(connection);
    transport.relay_info = Some(relay.clone());
    
    tracing::info!("Connected to relay: {}:{}", relay.address, relay.port);
    Ok(format!("Connected to {}:{}", relay.address, relay.port))
}

#[tauri::command]
pub async fn disconnect_relay(
    state: State<'_, Arc<RwLock<QuicTransport>>>,
) -> Result<(), String> {
    let mut transport = state.write().await;
    
    if let Some(conn) = transport.active_connection.take() {
        conn.close(0u32.into(), b"Client disconnect");
        tracing::info!("Disconnected from relay");
    }
    
    transport.relay_info = None;
    Ok(())
}

#[tauri::command]
pub async fn send_via_quic(
    data: Vec<u8>,
    state: State<'_, Arc<RwLock<QuicTransport>>>,
) -> Result<(), String> {
    let transport = state.read().await;
    
    let connection = transport.active_connection.as_ref()
        .ok_or_else(|| "Not connected to relay".to_string())?;
    
    let mut send_stream = connection
        .open_uni()
        .await
        .map_err(|e| format!("Failed to open QUIC stream: {}", e))?;
    
    send_stream
        .write_all(&data)
        .await
        .map_err(|e| format!("Failed to send data: {}", e))?;
    
    send_stream
        .finish()
        .map_err(|e| format!("Failed to finish stream: {}", e))?;
    
    tracing::debug!("Sent {} bytes via QUIC", data.len());
    Ok(())
}

#[tauri::command]
pub async fn get_relay_status(
    state: State<'_, Arc<RwLock<QuicTransport>>>,
) -> Result<RelayStatus, String> {
    let transport = state.read().await;
    
    let connected = transport.active_connection.is_some();
    let relay_address = transport.relay_info.as_ref()
        .map(|r| format!("{}:{}", r.address, r.port));
    
    Ok(RelayStatus {
        connected,
        relay_address,
        latency_ms: None,
    })
}
