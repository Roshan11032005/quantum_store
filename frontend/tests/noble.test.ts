/**
 * noble.test.ts — Roundtrip tests for Noble PQ providers (ML-KEM, ML-DSA, SLH-DSA).
 * These tests are integration tests — they call the actual crypto libraries.
 */

import { describe, it, expect } from 'vitest';
import { mlKem768Provider, mlDsa65Provider, slhDsaSha2128fProvider } from '../src/crypto/providers/noble';
import { randomBytes } from '../src/crypto/encoding';

describe('ML-KEM-768 roundtrip', () => {
  it('keygen produces correct key sizes', async () => {
    const { publicKey, secretKey } = await mlKem768Provider.keygen();
    expect(publicKey.length).toBe(1184);
    expect(secretKey.length).toBe(2400);
  });

  it('encapsulate/decapsulate roundtrip', async () => {
    const { publicKey, secretKey } = await mlKem768Provider.keygen();
    const { ciphertext, sharedSecret } = await mlKem768Provider.encapsulate(publicKey);
    const decapsulated = await mlKem768Provider.decapsulate(secretKey, ciphertext);
    expect(decapsulated).toEqual(sharedSecret);
  });

  it('different encapsulations produce different shared secrets', async () => {
    const { publicKey } = await mlKem768Provider.keygen();
    const r1 = await mlKem768Provider.encapsulate(publicKey);
    const r2 = await mlKem768Provider.encapsulate(publicKey);
    expect(r1.sharedSecret).not.toEqual(r2.sharedSecret);
  });
});

describe('ML-DSA-65 roundtrip', () => {
  it('keygen produces correct key sizes', async () => {
    const { publicKey, secretKey } = await mlDsa65Provider.keygen();
    expect(publicKey.length).toBe(1952);
    expect(secretKey.length).toBeGreaterThan(0);
  });

  it('sign/verify roundtrip', async () => {
    const { publicKey, secretKey } = await mlDsa65Provider.keygen();
    const message = randomBytes(32);
    const sig = await mlDsa65Provider.sign(secretKey, message);
    const valid = await mlDsa65Provider.verify(publicKey, message, sig);
    expect(valid).toBe(true);
  });

  it('verify returns false for tampered message', async () => {
    const { publicKey, secretKey } = await mlDsa65Provider.keygen();
    const message = randomBytes(32);
    const sig = await mlDsa65Provider.sign(secretKey, message);

    const tampered = new Uint8Array(message);
    tampered[0] ^= 0xff;
    const valid = await mlDsa65Provider.verify(publicKey, tampered, sig);
    expect(valid).toBe(false);
  });

  it('verify returns false for tampered signature', async () => {
    const { publicKey, secretKey } = await mlDsa65Provider.keygen();
    const message = randomBytes(32);
    const sig = await mlDsa65Provider.sign(secretKey, message);

    const tamperedSig = new Uint8Array(sig);
    tamperedSig[10] ^= 0xff;
    const valid = await mlDsa65Provider.verify(publicKey, message, tamperedSig);
    expect(valid).toBe(false);
  });
});

describe('SLH-DSA-SHA2-128f roundtrip', () => {
  it('sign/verify roundtrip', async () => {
    const { publicKey, secretKey } = await slhDsaSha2128fProvider.keygen();
    const message = randomBytes(32);
    const sig = await slhDsaSha2128fProvider.sign(secretKey, message);
    const valid = await slhDsaSha2128fProvider.verify(publicKey, message, sig);
    expect(valid).toBe(true);
  }, 30_000); // SPHINCS+ signing can be slow
});
