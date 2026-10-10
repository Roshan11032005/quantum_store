/**
 * hkdf.test.ts — Tests for HKDF-SHA256.
 */

import { describe, it, expect } from 'vitest';
import { hkdfSha256 } from '../src/crypto/hkdf';
import { randomBytes } from '../src/crypto/encoding';

describe('hkdfSha256', () => {
  it('produces a 32-byte key by default', async () => {
    const ikm = randomBytes(32);
    const salt = randomBytes(16);
    const derived = await hkdfSha256(ikm, salt, 'test-info');
    expect(derived.length).toBe(32);
  });

  it('is deterministic for the same inputs', async () => {
    const ikm = new Uint8Array(32).fill(1);
    const salt = new Uint8Array(16).fill(2);
    const info = 'pqc-storage-kek-v1';

    const a = await hkdfSha256(ikm, salt, info);
    const b = await hkdfSha256(ikm, salt, info);
    expect(a).toEqual(b);
  });

  it('produces different output for different info strings', async () => {
    const ikm = randomBytes(32);
    const salt = randomBytes(16);

    const a = await hkdfSha256(ikm, salt, 'info-a');
    const b = await hkdfSha256(ikm, salt, 'info-b');
    expect(a).not.toEqual(b);
  });

  it('produces different output for different salts', async () => {
    const ikm = randomBytes(32);
    const info = 'test';

    const a = await hkdfSha256(ikm, randomBytes(16), info);
    const b = await hkdfSha256(ikm, randomBytes(16), info);
    expect(a).not.toEqual(b);
  });

  it('supports custom output length', async () => {
    const ikm = randomBytes(32);
    const salt = randomBytes(16);
    const derived = await hkdfSha256(ikm, salt, 'test', 64);
    expect(derived.length).toBe(64);
  });
});
