import { invoke } from '@tauri-apps/api/core';
import { writable, type Readable } from 'svelte/store';

export type TaiorRouteMode = 'fast' | 'reinforced' | 'mix' | 'adaptive';

export type TaiorClient = {
  status: Readable<'disconnected' | 'connecting' | 'connected'>;
  send: (payload: Uint8Array, mode: TaiorRouteMode) => Promise<Uint8Array>;
  disconnect: () => void;
  address: () => Promise<string>;
  enableCoverTraffic: (enabled: boolean, ratio: number) => Promise<void>;
};

export interface TaiorConfig {
  bootstrap_nodes: string[];
}

export async function createTauriTaiorClient(config?: TaiorConfig): Promise<TaiorClient> {
  const status = writable<'disconnected' | 'connecting' | 'connected'>('connecting');

  const defaultConfig: TaiorConfig = {
    bootstrap_nodes: config?.bootstrap_nodes || [
      'relay1.taior.net:4433',
      'relay2.taior.net:4433'
    ]
  };

  try {
    const address = await invoke<string>('taior_init', { config: defaultConfig });
    status.set('connected');
    console.log('Tauri Taior initialized:', address);
  } catch (err) {
    console.error('Failed to initialize Tauri Taior:', err);
    status.set('disconnected');
    throw new Error(`Taior initialization failed: ${err}`);
  }

  const send = async (payload: Uint8Array, mode: TaiorRouteMode): Promise<Uint8Array> => {
    try {
      const modeStr = mode === 'reinforced' ? 'mix' : mode;
      
      const result = await invoke<number[]>('taior_send', {
        payload: Array.from(payload),
        mode: modeStr
      });

      if (!result || result.length === 0) {
        throw new Error('AORP routing returned empty result');
      }

      console.log(`Message routed via AORP (${modeStr}): ${result.length} bytes`);
      return new Uint8Array(result);
    } catch (err) {
      throw new Error(
        `CRITICAL: AORP routing failed. Message NOT sent. ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const disconnect = () => {
    status.set('disconnected');
  };

  const address = async (): Promise<string> => {
    try {
      return await invoke<string>('taior_address');
    } catch (err) {
      console.error('Failed to get Taior address:', err);
      return 'taior://unknown';
    }
  };

  const enableCoverTraffic = async (enabled: boolean, ratio: number): Promise<void> => {
    try {
      await invoke('taior_enable_cover_traffic', { enabled, ratio });
      console.log(`Cover traffic: enabled=${enabled}, ratio=${ratio}`);
    } catch (err) {
      console.error('Failed to enable cover traffic:', err);
    }
  };

  return { status, send, disconnect, address, enableCoverTraffic };
}
