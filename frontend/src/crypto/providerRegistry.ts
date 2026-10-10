/**
 * providerRegistry.ts — Maps algorithm names to provider instances.
 * The UI only offers algorithms that BOTH the server and a local provider support.
 */

import type { KemProvider, SigProvider } from './interfaces';
import {
  mlKem512Provider,
  mlKem768Provider,
  mlKem1024Provider,
  mlDsa44Provider,
  mlDsa65Provider,
  mlDsa87Provider,
  slhDsaSha2128fProvider,
} from './providers/noble';
import { falcon512Provider, falcon1024Provider } from './providers/oqsWasm';
import { agentFalcon512Provider, agentFalcon1024Provider } from './providers/agent';

const kemRegistry = new Map<string, KemProvider>([
  ['ML-KEM-512', mlKem512Provider],
  ['ML-KEM-768', mlKem768Provider],
  ['ML-KEM-1024', mlKem1024Provider],
]);

const sigRegistry = new Map<string, SigProvider>([
  ['ML-DSA-44', mlDsa44Provider],
  ['ML-DSA-65', mlDsa65Provider],
  ['ML-DSA-87', mlDsa87Provider],
  ['SLH-DSA-SHA2-128f', slhDsaSha2128fProvider],
  ['Falcon-512', falcon512Provider],
  ['Falcon-1024', falcon1024Provider],
]);

export function getKemProviderByName(name: string): KemProvider {
  const provider = kemRegistry.get(name);
  if (!provider) throw new Error(`ALG_UNSUPPORTED: KEM ${name}`);
  return provider;
}

export function getSigProviderByName(name: string): SigProvider {
  const provider = sigRegistry.get(name);
  if (!provider) throw new Error(`ALG_UNSUPPORTED: SIG ${name}`);
  return provider;
}

/**
 * Try WASM Falcon first; fall back to local agent if WASM not available.
 */
export async function getResolvableSigProvider(name: string): Promise<SigProvider> {
  if (name === 'Falcon-512') {
    try {
      await falcon512Provider.keygen();
      return falcon512Provider;
    } catch {
      return agentFalcon512Provider;
    }
  }
  if (name === 'Falcon-1024') {
    try {
      await falcon1024Provider.keygen();
      return falcon1024Provider;
    } catch {
      return agentFalcon1024Provider;
    }
  }
  return getSigProviderByName(name);
}

export { kemRegistry, sigRegistry };
