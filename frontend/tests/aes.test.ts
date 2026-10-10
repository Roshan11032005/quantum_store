/**
 * aes.test.ts — Tests for AES-256-GCM chunked encryption and DEK wrapping.
 */

import { describe, it, expect } from 'vitest';
import { encryptChunks, decryptChunks, wrapDek, unwrapDek, buildNonce, buildAAD } from '../src/crypto/aes';
import { randomBytes, uuidToBytes } from '../src/crypto/encoding';

const FILE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('AES-256-GCM chunk roundtrip', () => {
  it('encrypts and decrypts a small file correctly', async () => {
    const plaintext = new TextEncoder().encode('Hello, quantum world!');
    const dek = randomBytes(32);
    const fileIdBytes = uuidToBytes(FILE_ID);

    const { chunks, baseNonce, chunkCount } = await encryptChunks(plaintext, dek, fileIdBytes);
    expect(chunks.length).toBe(chunkCount);

    const decrypted = await decryptChunks(chunks, dek, fileIdBytes, baseNonce);
    expect(Buffer.from(decrypted)).toEqual(Buffer.from(plaintext));
  });

  it('splits a 9 MiB file into 3 chunks', async () => {
    // Use fill instead of randomBytes to avoid jsdom's 65536-byte getRandomValues limit
    const plaintext = new Uint8Array(9 * 1024 * 1024).fill(0xab);
    const dek = randomBytes(32);
    const fileIdBytes = uuidToBytes(FILE_ID);

    const { chunks, chunkCount } = await encryptChunks(plaintext, dek, fileIdBytes);
    expect(chunkCount).toBe(3);
    expect(chunks.length).toBe(3);
  });

  it('fails decryption with wrong DEK', async () => {
    const plaintext = new TextEncoder().encode('secret');
    const dek = randomBytes(32);
    const wrongDek = randomBytes(32);
    const fileIdBytes = uuidToBytes(FILE_ID);

    const { chunks, baseNonce } = await encryptChunks(plaintext, dek, fileIdBytes);
    await expect(decryptChunks(chunks, wrongDek, fileIdBytes, baseNonce)).rejects.toThrow();
  });

  it('fails decryption if nonce is wrong', async () => {
    const plaintext = new TextEncoder().encode('secret');
    const dek = randomBytes(32);
    const fileIdBytes = uuidToBytes(FILE_ID);

    const { chunks } = await encryptChunks(plaintext, dek, fileIdBytes);
    const wrongNonce = randomBytes(8);
    await expect(decryptChunks(chunks, dek, fileIdBytes, wrongNonce)).rejects.toThrow();
  });
});

describe('DEK wrapping', () => {
  it('wraps and unwraps DEK correctly', async () => {
    const dek = randomBytes(32);
    const kek = randomBytes(32);

    const { wrappedDek, wrapNonce } = await wrapDek(dek, kek);
    const unwrapped = await unwrapDek(wrappedDek, kek, wrapNonce);

    expect(unwrapped).toEqual(dek);
  });

  it('fails unwrap with wrong KEK', async () => {
    const dek = randomBytes(32);
    const kek = randomBytes(32);
    const wrongKek = randomBytes(32);

    const { wrappedDek, wrapNonce } = await wrapDek(dek, kek);
    await expect(unwrapDek(wrappedDek, wrongKek, wrapNonce)).rejects.toThrow();
  });
});

describe('Nonce construction', () => {
  it('produces 12-byte nonce with correct structure', () => {
    const base = randomBytes(8);
    const nonce = buildNonce(base, 5);
    expect(nonce.length).toBe(12);
    expect(nonce.slice(0, 8)).toEqual(base);
    // last 4 bytes = uint32BE(5) = [0, 0, 0, 5]
    expect(nonce[11]).toBe(5);
  });
});

describe('AAD construction', () => {
  it('produces 25-byte AAD with correct structure', () => {
    const fileIdBytes = uuidToBytes(FILE_ID);
    const aad = buildAAD(fileIdBytes, 0, 3, true);
    expect(aad.length).toBe(25);
    expect(aad[24]).toBe(1); // final flag
  });

  it('marks non-final chunks correctly', () => {
    const fileIdBytes = uuidToBytes(FILE_ID);
    const aad = buildAAD(fileIdBytes, 0, 3, false);
    expect(aad[24]).toBe(0); // not final
  });
});
