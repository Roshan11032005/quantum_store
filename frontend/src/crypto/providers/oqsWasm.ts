/**
 * oqsWasm.ts — Falcon provider via liboqs-wasm.
 *
 * Attempts to load liboqs WebAssembly; falls back gracefully.
 * The Falcon provider is wrapped behind the same SigProvider interface.
 */

import type { SigProvider } from '../interfaces';

type OQS = {
  Signature: new (alg: string) => {
    keypair(): { publicKey: Uint8Array; secretKey: Uint8Array };
    sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
    verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean;
    free(): void;
  };
};

let oqsInstance: OQS | null = null;
let oqsLoadAttempted = false;

async function loadOqs(): Promise<OQS | null> {
  if (oqsLoadAttempted) return oqsInstance;
  oqsLoadAttempted = true;
  try {
    // Use new Function to prevent Vite's static import-analysis from erroring
    // on the absent /liboqs.js file. Falls back gracefully if WASM isn't served.
    const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<{ default: () => Promise<OQS> }>;
    const mod = await dynamicImport('/liboqs.js');
    const instance = await mod.default();
    oqsInstance = instance as OQS;
    return oqsInstance;
  } catch {
    console.warn('[oqsWasm] liboqs-wasm not available — Falcon will use agent fallback');
    return null;
  }
}

function makeFalconProvider(algorithm: string): SigProvider {
  return {
    name: algorithm,

    async keygen() {
      const oqs = await loadOqs();
      if (!oqs) throw new Error(`ALG_UNSUPPORTED: ${algorithm} — liboqs-wasm not loaded`);
      const sig = new oqs.Signature(algorithm);
      try {
        return sig.keypair();
      } finally {
        sig.free();
      }
    },

    async sign(secretKey, message) {
      const oqs = await loadOqs();
      if (!oqs) throw new Error(`ALG_UNSUPPORTED: ${algorithm}`);
      const sig = new oqs.Signature(algorithm);
      try {
        return sig.sign(message, secretKey);
      } finally {
        sig.free();
      }
    },

    async verify(publicKey, message, signature) {
      const oqs = await loadOqs();
      if (!oqs) throw new Error(`ALG_UNSUPPORTED: ${algorithm}`);
      const sig = new oqs.Signature(algorithm);
      try {
        return sig.verify(message, signature, publicKey);
      } finally {
        sig.free();
      }
    },
  };
}

export const falcon512Provider: SigProvider = makeFalconProvider('Falcon-512');
export const falcon1024Provider: SigProvider = makeFalconProvider('Falcon-1024');

export const oqsWasmSigProviders: SigProvider[] = [falcon512Provider, falcon1024Provider];

/** Check if OQS WASM is available */
export async function isOqsAvailable(): Promise<boolean> {
  const oqs = await loadOqs();
  return oqs !== null;
}
