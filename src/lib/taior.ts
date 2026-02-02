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
    const wasmUrl = await import('@taiorproject/taior/taior_bg.wasm?url');
    const wasmInstance = await WebAssembly.instantiateStreaming(
      fetch(wasmUrl.default),
      {
        './taior_bg.js': await import('@taiorproject/taior/taior_bg.js')
      }
    );

    const bindings = await import('@taiorproject/taior/taior_bg.js');
    bindings.__wbg_set_wasm(wasmInstance.instance.exports);

    if (typeof wasmInstance.instance.exports.__wbindgen_start === 'function') {
      (wasmInstance.instance.exports.__wbindgen_start as () => void)();
    }

    wasmModule = { TaiorWasm: bindings.TaiorWasm };
    return wasmModule;
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

  const ready = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      try {
        taiorInstance = new wasm.TaiorWasm();
        status.set('connected');
        resolve();
      } catch (err) {
        console.error('Failed to initialize Taior WASM:', err);
        status.set('disconnected');
        reject(new Error(
          'CRITICAL: libtaior WASM initialization failed. ' +
          'Cannot proceed without AORP privacy guarantees. ' +
          `Error: ${err}`
        ));
      }
    }, 100);
  });

  const send = async (payload: Uint8Array, mode: TaiorRouteMode) => {
    await ready;

    if (!taiorInstance) {
      throw new Error(
        'CRITICAL: Taior not initialized. ' +
        'Cannot send data without AORP privacy protection.'
      );
    }

    const modeStr = mode === 'reinforced' ? 'mix' : mode;

    // NEVER return plaintext on failure - throw instead
    try {
      const result = taiorInstance.send(payload, modeStr);

      // Verify WASM actually processed the data
      if (!result) {
        throw new Error('WASM send returned null/undefined');
      }

      const processed = new Uint8Array(result);

      // Sanity check: WASM should transform the data
      // (at minimum, add AORP routing headers)
      if (processed.length === 0) {
        throw new Error('WASM send returned empty result');
      }

      return processed;
    } catch (err) {
      // CRITICAL: Never fail silently and return plaintext
      throw new Error(
        'CRITICAL: AORP routing failed. Message NOT sent to protect privacy. ' +
        `Original error: ${err instanceof Error ? err.message : String(err)}`
      );
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
