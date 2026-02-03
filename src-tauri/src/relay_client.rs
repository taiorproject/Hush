use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayNode {
    pub id: String,
    pub address: String,
    pub port: u16,
    pub public_key: String,
    pub latency_ms: Option<u64>,
    pub bandwidth_mbps: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct RelayDiscovery {
    known_relays: HashMap<String, RelayNode>,
}

impl RelayDiscovery {
    pub fn new() -> Self {
        let mut known_relays = HashMap::new();
        
        known_relays.insert(
            "relay1".to_string(),
            RelayNode {
                id: "relay1".to_string(),
                address: "relay1.taior.net".to_string(),
                port: 4433,
                public_key: "placeholder_key_1".to_string(),
                latency_ms: Some(50),
                bandwidth_mbps: Some(100),
            },
        );
        
        known_relays.insert(
            "relay2".to_string(),
            RelayNode {
                id: "relay2".to_string(),
                address: "relay2.taior.net".to_string(),
                port: 4433,
                public_key: "placeholder_key_2".to_string(),
                latency_ms: Some(80),
                bandwidth_mbps: Some(80),
            },
        );

        Self { known_relays }
    }

    pub fn get_available_relays(&self) -> Vec<RelayNode> {
        self.known_relays.values().cloned().collect()
    }

    pub fn get_relay(&self, id: &str) -> Option<&RelayNode> {
        self.known_relays.get(id)
    }
}

pub struct RelayCircuit {
    hops: Vec<RelayNode>,
    max_hops: usize,
}

impl RelayCircuit {
    pub fn new(max_hops: usize) -> Self {
        Self {
            hops: Vec::new(),
            max_hops,
        }
    }

    pub fn add_hop(&mut self, relay: RelayNode) -> Result<()> {
        if self.hops.len() >= self.max_hops {
            anyhow::bail!("Circuit already has maximum hops");
        }
        
        self.hops.push(relay);
        Ok(())
    }

    pub fn get_hops(&self) -> &[RelayNode] {
        &self.hops
    }

    pub fn total_latency(&self) -> u64 {
        self.hops.iter()
            .filter_map(|h| h.latency_ms)
            .sum()
    }
}
