import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface RelayInfo {
  address: string;
  port: number;
  public_key?: string;
}

export interface RelayStatus {
  connected: boolean;
  relay_address?: string;
  latency_ms?: number;
}

export class QuicTransport {
  private unlistenFn?: UnlistenFn;

  async connectToRelay(relay: RelayInfo): Promise<string> {
    try {
      const result = await invoke<string>('connect_to_relay', { relay });
      console.log('Connected to relay via QUIC:', result);
      return result;
    } catch (err) {
      throw new Error(`Failed to connect to relay: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await invoke('disconnect_relay');
      console.log('Disconnected from relay');
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  }

  async send(data: Uint8Array): Promise<void> {
    try {
      await invoke('send_via_quic', { data: Array.from(data) });
    } catch (err) {
      throw new Error(`Failed to send via QUIC: ${err}`);
    }
  }

  async getStatus(): Promise<RelayStatus> {
    try {
      return await invoke<RelayStatus>('get_relay_status');
    } catch (err) {
      console.error('Failed to get relay status:', err);
      return { connected: false };
    }
  }

  async setupMessageListener(callback: (data: Uint8Array) => void): Promise<void> {
    this.unlistenFn = await listen<number[]>('quic-message', (event) => {
      callback(new Uint8Array(event.payload));
    });
  }

  cleanup(): void {
    if (this.unlistenFn) {
      this.unlistenFn();
    }
  }
}

// Relay public keys must be the SHA-256 fingerprint of the relay's TLS certificate.
// These are verified by PinnedCertVerifier on the Tauri/QUIC side.
// In production, these MUST be replaced with real certificate fingerprints.
export const DEFAULT_RELAYS: RelayInfo[] = [
  {
    address: 'relay1.taior.net',
    port: 4433,
    // TODO: Replace with real relay certificate SHA-256 fingerprint
    public_key: undefined
  },
  {
    address: 'relay2.taior.net',
    port: 4433,
    // TODO: Replace with real relay certificate SHA-256 fingerprint
    public_key: undefined
  },
  {
    address: 'localhost',
    port: 4433,
    // Local dev relay — no pinning required in development
    public_key: undefined
  }
];
