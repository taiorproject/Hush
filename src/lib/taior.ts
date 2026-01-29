import { writable, type Readable } from 'svelte/store';

export type TaiorRouteMode = 'fast' | 'reinforced' | 'mix' | 'adaptive';

export type TaiorClient = {
  status: Readable<'disconnected' | 'connecting' | 'connected'>;
  send: (payload: Uint8Array, mode: TaiorRouteMode) => Promise<Uint8Array>;
  disconnect: () => void;
  address?: () => string;
};

let wasmModule: any = null;

async function loadWasmModule() {
  if (wasmModule) return wasmModule;
  
  try {
    const module = await import('taior');
    wasmModule = module;
    return module;
  } catch (err) {
    console.warn('libtaior WASM not available, using shim:', err);
    return null;
  }
}

export async function createTaiorClient(useWasm = true): Promise<TaiorClient> {
  if (useWasm) {
    const wasm = await loadWasmModule();
    if (wasm) {
      return createTaiorWasm(wasm);
    }
  }
  return createTaiorLite();
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

  return { status, send, disconnect, address };
}

function createTaiorLite(): TaiorClient {
  const status = writable<'disconnected' | 'connecting' | 'connected'>('connecting');

  const ready = new Promise<void>((resolve) => {
    setTimeout(() => {
      status.set('connected');
      resolve();
    }, 200);
  });

  const send = async (payload: Uint8Array, mode: TaiorRouteMode) => {
    await ready;
    if (mode === 'reinforced' || mode === 'mix') {
      await new Promise((r) => setTimeout(r, 150));
    }
    return payload;
  };

  const disconnect = () => {
    status.set('disconnected');
  };

  const address = () => {
    return `taior://lite-${Math.random().toString(36).slice(2, 14)}`;
  };

  return { status, send, disconnect, address };
}

export { createTaiorLite };
