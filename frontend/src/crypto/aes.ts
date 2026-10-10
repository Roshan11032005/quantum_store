/**
 * aes.ts — AES-256-GCM chunked encrypt/decrypt using the Web Crypto API.
 *
 * Nonce construction: base_nonce(8 bytes) ‖ uint32_be(chunk_index) — 12 bytes total.
 * AAD: file_id(16 bytes) ‖ uint32_be(chunk_index) ‖ uint32_be(chunk_count) ‖ final_flag(1 byte)
 */

import { uint32BE, randomBytes } from './encoding';

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB
const TAG_LENGTH = 128; // bits

/** Cast Uint8Array to BufferSource-compatible type for WebCrypto APIs */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asBufferSource = (u: Uint8Array): BufferSource => u as any;

export interface EncryptedChunk {
  ciphertext: Uint8Array; // includes GCM auth tag
  nonce: Uint8Array;       // 12 bytes (base_nonce ‖ index)
}

export interface ChunkEncryptResult {
  chunks: EncryptedChunk[];
  baseNonce: Uint8Array;  // 8 bytes, stored so decryption can reconstruct nonces
  chunkCount: number;
}

/** Import a raw 32-byte DEK as an AES-GCM CryptoKey */
export async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asBufferSource(rawKey), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Build the 12-byte nonce: 8-byte base_nonce ‖ 4-byte big-endian index.
 */
export function buildNonce(baseNonce: Uint8Array, index: number): Uint8Array {
  const nonce = new Uint8Array(12);
  nonce.set(baseNonce.slice(0, 8), 0);
  nonce.set(uint32BE(index), 8);
  return nonce;
}

/**
 * Build the AAD for a chunk.
 * AAD: file_id(16 bytes) ‖ uint32_be(chunk_index) ‖ uint32_be(chunk_count) ‖ final_flag(1 byte)
 */
export function buildAAD(
  fileIdBytes: Uint8Array,
  chunkIndex: number,
  chunkCount: number,
  isFinal: boolean
): Uint8Array {
  const aad = new Uint8Array(16 + 4 + 4 + 1);
  aad.set(fileIdBytes.slice(0, 16), 0);
  aad.set(uint32BE(chunkIndex), 16);
  aad.set(uint32BE(chunkCount), 20);
  aad[24] = isFinal ? 1 : 0;
  return aad;
}

/**
 * Encrypt a file's bytes in 4-MiB chunks using AES-256-GCM.
 * Returns per-chunk ciphertexts and the base nonce.
 *
 * @param fileBytes  - Raw file bytes
 * @param dek        - 32-byte data encryption key (Uint8Array)
 * @param fileIdBytes - 16 bytes of the file UUID
 * @param onProgress - Optional per-chunk progress callback (0-1)
 */
export async function encryptChunks(
  fileBytes: Uint8Array,
  dek: Uint8Array,
  fileIdBytes: Uint8Array,
  onProgress?: (progress: number) => void
): Promise<ChunkEncryptResult> {
  const key = await importAesKey(dek);
  const baseNonce = randomBytes(8);

  const chunkCount = Math.ceil(fileBytes.length / CHUNK_SIZE) || 1;
  const chunks: EncryptedChunk[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fileBytes.length);
    const plaintext = fileBytes.slice(start, end);
    const isFinal = i === chunkCount - 1;

    const nonce = buildNonce(baseNonce, i);
    const aad = buildAAD(fileIdBytes, i, chunkCount, isFinal);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: asBufferSource(nonce), additionalData: asBufferSource(aad), tagLength: TAG_LENGTH },
      key,
      asBufferSource(plaintext)
    );

    chunks.push({ ciphertext: new Uint8Array(ciphertext), nonce });
    onProgress?.((i + 1) / chunkCount);
  }

  return { chunks, baseNonce, chunkCount };
}

/**
 * Decrypt chunks produced by encryptChunks.
 *
 * @param chunks      - Array of { ciphertext, nonce } objects
 * @param dek         - 32-byte DEK
 * @param fileIdBytes - 16-byte file UUID
 * @param baseNonce   - 8-byte base nonce used during encryption
 * @param onProgress  - Optional per-chunk progress callback
 */
export async function decryptChunks(
  chunks: EncryptedChunk[],
  dek: Uint8Array,
  fileIdBytes: Uint8Array,
  baseNonce: Uint8Array,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  const key = await importAesKey(dek);
  const chunkCount = chunks.length;
  const plaintextChunks: Uint8Array[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const { ciphertext } = chunks[i];
    const isFinal = i === chunkCount - 1;

    const nonce = buildNonce(baseNonce, i);
    const aad = buildAAD(fileIdBytes, i, chunkCount, isFinal);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(nonce), additionalData: asBufferSource(aad), tagLength: TAG_LENGTH },
      key,
      asBufferSource(ciphertext)
    );

    plaintextChunks.push(new Uint8Array(plaintext));
    onProgress?.((i + 1) / chunkCount);
  }

  // Assemble output
  const totalLen = plaintextChunks.reduce((s, c) => s + c.length, 0);
  const output = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of plaintextChunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Wrap a DEK with a KEK using AES-256-GCM.
 * Returns { wrappedDek, wrapNonce } — both needed for unwrapping.
 */
export async function wrapDek(
  dek: Uint8Array,
  kek: Uint8Array
): Promise<{ wrappedDek: Uint8Array; wrapNonce: Uint8Array }> {
  const wrapNonce = randomBytes(12);
  const kekKey = await importAesKey(kek);
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(wrapNonce), tagLength: TAG_LENGTH },
    kekKey,
    asBufferSource(dek)
  );
  return { wrappedDek: new Uint8Array(wrapped), wrapNonce };
}

/** Unwrap a DEK using a KEK. */
export async function unwrapDek(
  wrappedDek: Uint8Array,
  kek: Uint8Array,
  wrapNonce: Uint8Array
): Promise<Uint8Array> {
  const kekKey = await importAesKey(kek);
  const dek = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(wrapNonce), tagLength: TAG_LENGTH },
    kekKey,
    asBufferSource(wrappedDek)
  );
  return new Uint8Array(dek);
}

/** Compute SHA-256 of a byte array using WebCrypto */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', asBufferSource(data));
  return new Uint8Array(digest);
}

/** Concatenate all chunk ciphertexts and compute SHA-256 */
export async function computeCiphertextHash(chunks: EncryptedChunk[]): Promise<Uint8Array> {
  const total = chunks.reduce((s, c) => s + c.ciphertext.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c.ciphertext, offset);
    offset += c.ciphertext.length;
  }
  return sha256(combined);
}

