import { writable, type Readable } from 'svelte/store';

export type TaiorRouteMode = 'fast' | 'reinforced' | 'mix' | 'adaptive';

export type TaiorClient = {
  status: Readable<'disconnected' | 'connecting' | 'connected'>;
  send: (payload: Uint8Array, mode: TaiorRouteMode) => Promise<Uint8Array>;
  disconnect: () => void;
  address: () => string;
  enableCoverTraffic: (enabled: boolean, ratio: number) => void;
};

let wasmModule: any = null;

async function loadWasmModule() {
  if (wasmModule) return wasmModule;
  
  try {
    const module = await import('taior');
    wasmModule = module;
    return module;
  } catch (err) {
    throw new Error(
      'libtaior WASM no disponible. Hush requiere libtaior para funcionar de forma segura.\n\n' +
      'Para compilar libtaior:\n' +
      '1. cd ../libtaior\n' +
      '2. ./build-wasm.sh\n' +
      '3. cd ../Hush && npm install ../libtaior/pkg\n\n' +
      `Error original: ${err}`
    );
  }
}

export async function createTaiorClient(): Promise<TaiorClient> {
  const wasm = await loadWasmModule();
  return createTaiorWasm(wasm);
}

function createTaiorWasm(wasm: any): TaiorClient {
  const status = writable<'disconnected' | 'connecting' | 'connected'>('connecting');
  
  let taiorInstance: any = null;
  
  const ready = new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        taiorInstance = new wasm.TaiorWasm();
        status.set('connected');
        resolve();
      } catch (err) {
        console.error('Failed to initialize Taior WASM:', err);
        status.set('disconnected');
      }
    }, 100);
  });

  const send = async (payload: Uint8Array, mode: TaiorRouteMode) => {
    await ready;
    if (!taiorInstance) {
      throw new Error('Taior not initialized');
    }
    
    const modeStr = mode === 'reinforced' ? 'mix' : mode;
    try {
      const result = taiorInstance.send(payload, modeStr);
      return new Uint8Array(result);
    } catch (err) {
      console.error('Taior send error:', err);
      return payload;
    }
  };

  const disconnect = () => {
    status.set('disconnected');
    taiorInstance = null;
  };

  const address = () => {
    if (!taiorInstance) return 'taior://unknown';
    return taiorInstance.address();
  };

  const enableCoverTraffic = (enabled: boolean, ratio: number) => {
    if (!taiorInstance) return;
    try {
      if (typeof taiorInstance.enableCoverTraffic === 'function') {
        taiorInstance.enableCoverTraffic(enabled, ratio);
      }
    } catch (err) {
      console.error('Error enabling cover traffic:', err);
    }
  };

  return { status, send, disconnect, address, enableCoverTraffic };
}
