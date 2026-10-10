/**
 * bench.worker.ts — Web Worker for running performance benchmarks.
 */
import * as Comlink from 'comlink';
import { mlKem512Provider, mlKem768Provider, mlKem1024Provider, mlDsa44Provider, mlDsa65Provider, mlDsa87Provider, slhDsaSha2128fProvider } from '../providers/noble';
import { falcon512Provider, falcon1024Provider } from '../providers/oqsWasm';
import type { KemProvider, SigProvider } from '../interfaces';
import { randomBytes } from '../encoding';

export interface BenchmarkResult {
  algorithm: string;
  operation: string;
  iterations: number;
  mean: number;
  median: number;
  stdev: number;
  p95: number;
  min: number;
  max: number;
  unit: string;
}

function stats(times: number[]): { mean: number; median: number; stdev: number; p95: number; min: number; max: number } {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((s, v) => s + v, 0) / times.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const variance = times.reduce((s, v) => s + (v - mean) ** 2, 0) / times.length;
  const stdev = Math.sqrt(variance);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { mean, median, stdev, p95, min, max };
}

async function benchmarkKem(provider: KemProvider, iterations: number): Promise<BenchmarkResult[]> {
  const keygenTimes: number[] = [];
  const encapsTimes: number[] = [];
  const decapsTimes: number[] = [];

  let keys = await provider.keygen(); // warm up

  for (let i = 0; i < iterations; i++) {
    let t = performance.now();
    keys = await provider.keygen();
    keygenTimes.push(performance.now() - t);

    t = performance.now();
    const { ciphertext, sharedSecret } = await provider.encapsulate(keys.publicKey);
    encapsTimes.push(performance.now() - t);

    t = performance.now();
    await provider.decapsulate(keys.secretKey, ciphertext);
    decapsTimes.push(performance.now() - t);

    // Zeroize
    sharedSecret.fill(0);
    keys.secretKey.fill(0);
  }

  return [
    { algorithm: provider.name, operation: 'keygen', iterations, ...stats(keygenTimes), unit: 'ms' },
    { algorithm: provider.name, operation: 'encapsulate', iterations, ...stats(encapsTimes), unit: 'ms' },
    { algorithm: provider.name, operation: 'decapsulate', iterations, ...stats(decapsTimes), unit: 'ms' },
  ];
}

async function benchmarkSig(provider: SigProvider, iterations: number, messageSizes: number[]): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const keygenTimes: number[] = [];

  let keys = await provider.keygen(); // warm up

  for (let i = 0; i < iterations; i++) {
    const t = performance.now();
    keys = await provider.keygen();
    keygenTimes.push(performance.now() - t);
    keys.secretKey.fill(0);
  }

  results.push({ algorithm: provider.name, operation: 'keygen', iterations, ...stats(keygenTimes), unit: 'ms' });
  keys = await provider.keygen();

  for (const msgSize of messageSizes) {
    const signTimes: number[] = [];
    const verifyTimes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const msg = randomBytes(msgSize);
      let t = performance.now();
      const sig = await provider.sign(keys.secretKey, msg);
      signTimes.push(performance.now() - t);

      t = performance.now();
      await provider.verify(keys.publicKey, msg, sig);
      verifyTimes.push(performance.now() - t);
    }

    results.push({ algorithm: provider.name, operation: `sign_${msgSize}b`, iterations, ...stats(signTimes), unit: 'ms' });
    results.push({ algorithm: provider.name, operation: `verify_${msgSize}b`, iterations, ...stats(verifyTimes), unit: 'ms' });
  }

  return results;
}

const allKemProviders: KemProvider[] = [mlKem512Provider, mlKem768Provider, mlKem1024Provider];
const allSigProviders: SigProvider[] = [mlDsa44Provider, mlDsa65Provider, mlDsa87Provider, slhDsaSha2128fProvider, falcon512Provider, falcon1024Provider];

const api = {
  async runKemBenchmark(algorithmNames: string[], iterations: number): Promise<BenchmarkResult[]> {
    const providers = allKemProviders.filter(p => algorithmNames.includes(p.name));
    const results: BenchmarkResult[] = [];
    for (const provider of providers) {
      try {
        const r = await benchmarkKem(provider, iterations);
        results.push(...r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith('ALG_UNSUPPORTED')) {
          console.warn(`[bench] Skipping ${provider.name}: ${msg}`);
        } else {
          throw e;
        }
      }
    }
    return results;
  },

  async runSigBenchmark(algorithmNames: string[], iterations: number, messageSizes: number[]): Promise<BenchmarkResult[]> {
    const providers = allSigProviders.filter(p => algorithmNames.includes(p.name));
    const results: BenchmarkResult[] = [];
    for (const provider of providers) {
      try {
        const r = await benchmarkSig(provider, iterations, messageSizes);
        results.push(...r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith('ALG_UNSUPPORTED')) {
          console.warn(`[bench] Skipping ${provider.name}: ${msg}`);
        } else {
          throw e;
        }
      }
    }
    return results;
  },
};

Comlink.expose(api);
