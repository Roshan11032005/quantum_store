/**
 * noble.ts — ML-KEM and ML-DSA / SLH-DSA providers via @noble/post-quantum.
 *
 * All operations run in a Web Worker (via crypto.worker.ts) so UI stays responsive.
 * This file provides the synchronous implementations; the worker wrapper handles offloading.
 */

import { ml_kem512, ml_kem768, ml_kem1024 } from '@noble/post-quantum/ml-kem';
import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa';
import { slh_dsa_sha2_128f } from '@noble/post-quantum/slh-dsa';
import type { KemProvider, SigProvider } from '../interfaces';

/** Generate 32 or 64 random bytes using WebCrypto */
function randSeed(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

// ─── ML-KEM ──────────────────────────────────────────────────────────────────

export const mlKem512Provider: KemProvider = {
  name: 'ML-KEM-512',
  async keygen() {
    const keys = ml_kem512.keygen(randSeed(64));
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  },
  async encapsulate(publicKey) {
    const result = ml_kem512.encapsulate(publicKey, randSeed(32));
    return { ciphertext: result.cipherText, sharedSecret: result.sharedSecret };
  },
  async decapsulate(secretKey, ciphertext) {
    return ml_kem512.decapsulate(ciphertext, secretKey);
  },
};

export const mlKem768Provider: KemProvider = {
  name: 'ML-KEM-768',
  async keygen() {
    const keys = ml_kem768.keygen(randSeed(64));
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  },
  async encapsulate(publicKey) {
    const result = ml_kem768.encapsulate(publicKey, randSeed(32));
    return { ciphertext: result.cipherText, sharedSecret: result.sharedSecret };
  },
  async decapsulate(secretKey, ciphertext) {
    return ml_kem768.decapsulate(ciphertext, secretKey);
  },
};

export const mlKem1024Provider: KemProvider = {
  name: 'ML-KEM-1024',
  async keygen() {
    const keys = ml_kem1024.keygen(randSeed(64));
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  },
  async encapsulate(publicKey) {
    const result = ml_kem1024.encapsulate(publicKey, randSeed(32));
    return { ciphertext: result.cipherText, sharedSecret: result.sharedSecret };
  },
  async decapsulate(secretKey, ciphertext) {
    return ml_kem1024.decapsulate(ciphertext, secretKey);
  },
};

// ─── ML-DSA ──────────────────────────────────────────────────────────────────

export const mlDsa44Provider: SigProvider = {
  name: 'ML-DSA-44',
  async keygen() {
    const keys = ml_dsa44.keygen(randSeed(32));
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  },
  // sign(sk, msg, ctx?, random?) — pass no ctx so 3rd arg is treated as random
  async sign(secretKey, message) { return ml_dsa44.sign(secretKey, message); },
  async verify(publicKey, message, signature) {
    try { return ml_dsa44.verify(publicKey, message, signature); } catch { return false; }
  },
};

export const mlDsa65Provider: SigProvider = {
  name: 'ML-DSA-65',
  async keygen() {
    const keys = ml_dsa65.keygen(randSeed(32));
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  },
  async sign(secretKey, message) { return ml_dsa65.sign(secretKey, message); },
  async verify(publicKey, message, signature) {
    try { return ml_dsa65.verify(publicKey, message, signature); } catch { return false; }
  },
};

export const mlDsa87Provider: SigProvider = {
  name: 'ML-DSA-87',
  async keygen() {
    const keys = ml_dsa87.keygen(randSeed(32));
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  },
  async sign(secretKey, message) { return ml_dsa87.sign(secretKey, message); },
  async verify(publicKey, message, signature) {
    try { return ml_dsa87.verify(publicKey, message, signature); } catch { return false; }
  },
};

// ─── SLH-DSA (SPHINCS+) SHA2-128f ───────────────────────────────────────────

export const slhDsaSha2128fProvider: SigProvider = {
  name: 'SLH-DSA-SHA2-128f',
  async keygen() {
    // slh_dsa_sha2_128f.keygen requires a 48-byte seed (3 * n where n=16)
    const keys = slh_dsa_sha2_128f.keygen(randSeed(48));
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  },
  // sign(sk, msg, random?) — 3rd arg is optional random (no ctx)
  async sign(secretKey, message) { return slh_dsa_sha2_128f.sign(secretKey, message); },
  async verify(publicKey, message, signature) {
    try { return slh_dsa_sha2_128f.verify(publicKey, message, signature); } catch { return false; }
  },
};

export const nobleKemProviders: KemProvider[] = [mlKem512Provider, mlKem768Provider, mlKem1024Provider];
export const nobleSigProviders: SigProvider[] = [mlDsa44Provider, mlDsa65Provider, mlDsa87Provider, slhDsaSha2128fProvider];
