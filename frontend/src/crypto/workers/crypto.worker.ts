/**
 * crypto.worker.ts — Web Worker for heavy crypto operations (Comlink).
 * Keeps the main UI thread responsive.
 */
import * as Comlink from 'comlink';
import { mlKem768Provider, mlDsa65Provider, slhDsaSha2128fProvider, mlKem512Provider, mlKem1024Provider, mlDsa44Provider, mlDsa87Provider } from '../providers/noble';
import { falcon512Provider, falcon1024Provider } from '../providers/oqsWasm';

const kemProviders = {
  'ML-KEM-512': mlKem512Provider,
  'ML-KEM-768': mlKem768Provider,
  'ML-KEM-1024': mlKem1024Provider,
};

const sigProviders = {
  'ML-DSA-44': mlDsa44Provider,
  'ML-DSA-65': mlDsa65Provider,
  'ML-DSA-87': mlDsa87Provider,
  'SLH-DSA-SHA2-128f': slhDsaSha2128fProvider,
  'Falcon-512': falcon512Provider,
  'Falcon-1024': falcon1024Provider,
};

const api = {
  async kemKeygen(name: string) {
    const provider = kemProviders[name as keyof typeof kemProviders];
    if (!provider) throw new Error(`Unknown KEM: ${name}`);
    return provider.keygen();
  },

  async kemEncapsulate(name: string, publicKey: Uint8Array) {
    const provider = kemProviders[name as keyof typeof kemProviders];
    if (!provider) throw new Error(`Unknown KEM: ${name}`);
    return provider.encapsulate(publicKey);
  },

  async kemDecapsulate(name: string, secretKey: Uint8Array, ciphertext: Uint8Array) {
    const provider = kemProviders[name as keyof typeof kemProviders];
    if (!provider) throw new Error(`Unknown KEM: ${name}`);
    return provider.decapsulate(secretKey, ciphertext);
  },

  async sigKeygen(name: string) {
    const provider = sigProviders[name as keyof typeof sigProviders];
    if (!provider) throw new Error(`Unknown SIG: ${name}`);
    return provider.keygen();
  },

  async sigSign(name: string, secretKey: Uint8Array, message: Uint8Array) {
    const provider = sigProviders[name as keyof typeof sigProviders];
    if (!provider) throw new Error(`Unknown SIG: ${name}`);
    return provider.sign(secretKey, message);
  },

  async sigVerify(name: string, publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array) {
    const provider = sigProviders[name as keyof typeof sigProviders];
    if (!provider) throw new Error(`Unknown SIG: ${name}`);
    return provider.verify(publicKey, message, signature);
  },
};

Comlink.expose(api);
