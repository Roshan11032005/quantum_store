/**
 * protocol.ts — Upload and Download pipelines.
 *
 * Implements the protocol defined in 02_BACKEND.md §4.
 * Plaintext and secret keys NEVER leave this pipeline.
 */

import { v4 as uuidv4 } from 'uuid';
import type { KemProvider, SigProvider } from './interfaces';
import { randomBytes, uuidToBytes, toBase64Url, fromBase64Url, zeroize } from './encoding';
import { encryptChunks, wrapDek, unwrapDek, decryptChunks, computeCiphertextHash, sha256 } from './aes';
import { hkdfSha256 } from './hkdf';
import { canonicalJsonBytes } from './canonical';

export type PipelineStage =
  | 'encrypting'
  | 'encapsulating'
  | 'signing'
  | 'uploading'
  | 'fetching'
  | 'verifying_hash'
  | 'verifying_signature'
  | 'decapsulating'
  | 'decrypting'
  | 'done'
  | 'error';

export interface PipelineProgress {
  stage: PipelineStage;
  progress: number; // 0-1
  stageMs?: number; // time taken for current stage
}

/**
 * Canonical metadata — MUST match backend/app/core/canonical.py.
 * Extra field `wrap_nonce` is stored for client-side DEK unwrapping.
 * Extra fields `kem_ciphertext`/`wrapped_dek` are merged in on download
 * from the top-level FileDetail response.
 */
export interface UploadMetadata {
  version: number;              // always 1
  file_id: string;
  owner_id: string;             // UUID of the file owner
  original_filename: string;
  original_size: number;
  mime_type: string;
  sym_alg: string;              // "AES-256-GCM"
  chunk_size: number;           // 4194304
  chunk_count: number;
  base_nonce: string;           // base64url 8 bytes
  kem_alg: string;
  kem_ct_sha256: string;        // hex – SHA-256 of kem_ciphertext bytes
  wrapped_dek_sha256: string;   // hex – SHA-256 of wrapped_dek bytes
  sig_alg: string;
  ciphertext_sha256: string;    // hex – SHA-256 of full ciphertext
  ciphertext_size: number;
  created_at: string;           // ISO-8601 UTC
  wrap_nonce: string;           // base64url 12 bytes (extra, for client unwrap)
  // Merged on download from FileDetail top-level fields:
  kem_ciphertext?: string;      // base64url
  wrapped_dek?: string;         // base64url
}

export interface UploadResult {
  fileId: string;
  ciphertextHash: string;
  signatureSize: number;
  totalCiphertextSize: number;
  originalSize: number;
  stageTimings: Record<PipelineStage, number>;
}

export interface DownloadResult {
  plaintext: Uint8Array;
  stageTimings: Record<PipelineStage, number>;
}

const HKDF_INFO = 'pqc-storage-kek-v1';

function nowMs(): number {
  return performance.now();
}

/**
 * Upload pipeline:
 * 1. Generate file_id + DEK
 * 2. Encrypt file in 4 MiB chunks (AES-256-GCM)
 * 3. KEM encapsulate → derive KEK → wrap DEK
 * 4. Build canonical metadata + sign
 * 5. POST multipart to server
 */
export async function uploadPipeline(
  file: File,
  ownerId: string,      // user's UUID from server
  sigKeyId: string,     // UUID of the user's active sig key
  kemProvider: KemProvider,
  sigProvider: SigProvider,
  kemPublicKey: Uint8Array,
  sigSecretKey: Uint8Array,
  hideFilename: boolean,
  uploadFn: (
    fileId: string,
    metadata: UploadMetadata,
    kemCiphertext: Uint8Array,
    wrappedDek: Uint8Array,
    metadataSignature: Uint8Array,
    ciphertextBlob: Blob,
    sigKeyId: string,
    onProgress: (p: number) => void
  ) => Promise<void>,
  onProgress: (p: PipelineProgress) => void
): Promise<UploadResult> {
  const timings: Partial<Record<PipelineStage, number>> = {};

  // ── Stage 1: Encrypt ───────────────────────────────────────────────────────
  onProgress({ stage: 'encrypting', progress: 0 });
  let t = nowMs();

  const fileId = uuidv4();
  const fileIdBytes = uuidToBytes(fileId);
  const dek = randomBytes(32);

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const { chunks, baseNonce, chunkCount } = await encryptChunks(
    fileBytes,
    dek,
    fileIdBytes,
    (p) => onProgress({ stage: 'encrypting', progress: p })
  );

  // Assemble ciphertext and compute hash
  const totalCiphertextBytes = chunks.reduce((s, c) => s + c.ciphertext.length, 0);
  const ciphertextBuffer = new Uint8Array(totalCiphertextBytes);
  let offset = 0;
  for (const chunk of chunks) {
    ciphertextBuffer.set(chunk.ciphertext, offset);
    offset += chunk.ciphertext.length;
  }
  const ciphertextHashBytes = await computeCiphertextHash(chunks);
  const ciphertextSha256 = Array.from(ciphertextHashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  timings['encrypting'] = nowMs() - t;
  onProgress({ stage: 'encrypting', progress: 1, stageMs: timings['encrypting'] });

  // ── Stage 2: Encapsulate KEM → derive KEK → wrap DEK ─────────────────────
  onProgress({ stage: 'encapsulating', progress: 0 });
  t = nowMs();

  const { ciphertext: kemCiphertext, sharedSecret } = await kemProvider.encapsulate(kemPublicKey);
  const kek = await hkdfSha256(sharedSecret, fileIdBytes, HKDF_INFO, 32);
  const { wrappedDek, wrapNonce } = await wrapDek(dek, kek);

  // Compute hashes of KEM ciphertext and wrapped DEK for metadata integrity
  const kemCtHashBytes = await sha256(kemCiphertext);
  const kemCtSha256 = Array.from(kemCtHashBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const wrappedDekHashBytes = await sha256(wrappedDek);
  const wrappedDekSha256 = Array.from(wrappedDekHashBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  // Zeroize sensitive intermediates
  zeroize(dek);
  zeroize(kek);
  zeroize(sharedSecret);

  timings['encapsulating'] = nowMs() - t;
  onProgress({ stage: 'encapsulating', progress: 1, stageMs: timings['encapsulating'] });

  // ── Stage 3: Build canonical metadata + sign ──────────────────────────────
  onProgress({ stage: 'signing', progress: 0 });
  t = nowMs();

  const now = new Date();
  const metadata: UploadMetadata = {
    version: 1,
    file_id: fileId,
    owner_id: ownerId,
    original_filename: hideFilename ? '' : file.name,
    original_size: file.size,
    mime_type: file.type || 'application/octet-stream',
    sym_alg: 'AES-256-GCM',
    chunk_size: 4194304,
    chunk_count: chunkCount,
    base_nonce: toBase64Url(baseNonce),
    kem_alg: kemProvider.name,
    kem_ct_sha256: kemCtSha256,
    wrapped_dek_sha256: wrappedDekSha256,
    sig_alg: sigProvider.name,
    ciphertext_sha256: ciphertextSha256,
    ciphertext_size: totalCiphertextBytes,
    created_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    wrap_nonce: toBase64Url(wrapNonce),
  };

  const metadataBytes = canonicalJsonBytes(metadata as unknown as Record<string, unknown>);
  const metadataHash = await sha256(metadataBytes);
  const metadataSignature = await sigProvider.sign(sigSecretKey, metadataHash);

  timings['signing'] = nowMs() - t;
  onProgress({ stage: 'signing', progress: 1, stageMs: timings['signing'] });

  // ── Stage 4: Upload ────────────────────────────────────────────────────────
  onProgress({ stage: 'uploading', progress: 0 });
  t = nowMs();

  const ciphertextBlob = new Blob([ciphertextBuffer], { type: 'application/octet-stream' });

  await uploadFn(
    fileId,
    metadata,
    kemCiphertext,
    wrappedDek,
    metadataSignature,
    ciphertextBlob,
    sigKeyId,
    (p) => onProgress({ stage: 'uploading', progress: p })
  );

  timings['uploading'] = nowMs() - t;
  onProgress({ stage: 'done', progress: 1, stageMs: timings['uploading'] });

  return {
    fileId,
    ciphertextHash: ciphertextSha256,
    signatureSize: metadataSignature.length,
    totalCiphertextSize: totalCiphertextBytes,
    originalSize: file.size,
    stageTimings: timings as Record<PipelineStage, number>,
  };
}

/**
 * Download pipeline:
 * Stages: Fetching → Verifying hash → Verifying signature → Decapsulating → Decrypting → Done
 * Aborts if hash or signature verification fails.
 */
export async function downloadPipeline(
  metadata: UploadMetadata,
  ciphertextBytes: Uint8Array,
  serverSignature: Uint8Array,
  sigProvider: SigProvider,
  sigPublicKey: Uint8Array,
  kemProvider: KemProvider,
  kemSecretKey: Uint8Array,
  onProgress: (p: PipelineProgress) => void,
  allowUnsafe = false
): Promise<DownloadResult> {
  const timings: Partial<Record<PipelineStage, number>> = {};

  // ── Stage 1: Verify ciphertext hash ───────────────────────────────────────
  onProgress({ stage: 'verifying_hash', progress: 0 });
  let t = nowMs();

  const computedHash = await sha256(ciphertextBytes);
  const computedHashHex = Array.from(computedHash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (computedHashHex !== metadata.ciphertext_sha256) {
    timings['verifying_hash'] = nowMs() - t;
    if (!allowUnsafe) {
      throw new Error('INTEGRITY_FAILED');
    }
    console.warn('[download] Hash mismatch — proceeding in unsafe mode');
  }

  timings['verifying_hash'] = nowMs() - t;
  onProgress({ stage: 'verifying_hash', progress: 1, stageMs: timings['verifying_hash'] });

  // ── Stage 2: Verify signature ─────────────────────────────────────────────
  onProgress({ stage: 'verifying_signature', progress: 0 });
  t = nowMs();

  const metadataBytes = canonicalJsonBytes(metadata as unknown as Record<string, unknown>);
  const metadataHash = await sha256(metadataBytes);
  const sigValid = await sigProvider.verify(sigPublicKey, metadataHash, serverSignature);

  if (!sigValid) {
    timings['verifying_signature'] = nowMs() - t;
    if (!allowUnsafe) {
      throw new Error('SIGNATURE_INVALID');
    }
    console.warn('[download] Signature invalid — proceeding in unsafe mode');
  }

  timings['verifying_signature'] = nowMs() - t;
  onProgress({ stage: 'verifying_signature', progress: 1, stageMs: timings['verifying_signature'] });

  // ── Stage 3: Decapsulate KEM → derive KEK → unwrap DEK ───────────────────
  onProgress({ stage: 'decapsulating', progress: 0 });
  t = nowMs();

  const fileIdBytes = uuidToBytes(metadata.file_id);
  const kemCiphertext = fromBase64Url(metadata.kem_ciphertext!);
  const wrappedDek = fromBase64Url(metadata.wrapped_dek!);
  const wrapNonce = fromBase64Url(metadata.wrap_nonce);

  const sharedSecret = await kemProvider.decapsulate(kemSecretKey, kemCiphertext);
  const kek = await hkdfSha256(sharedSecret, fileIdBytes, HKDF_INFO, 32);
  const dek = await unwrapDek(wrappedDek, kek, wrapNonce);

  zeroize(sharedSecret);
  zeroize(kek);

  timings['decapsulating'] = nowMs() - t;
  onProgress({ stage: 'decapsulating', progress: 1, stageMs: timings['decapsulating'] });

  // ── Stage 4: Decrypt chunks ────────────────────────────────────────────────
  onProgress({ stage: 'decrypting', progress: 0 });
  t = nowMs();

  const baseNonce = fromBase64Url(metadata.base_nonce);
  const chunkCount = metadata.chunk_count;
  const chunkSize = Math.ceil(ciphertextBytes.length / chunkCount);

  // Split ciphertext back into chunks
  const chunks = [];
  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, ciphertextBytes.length);
    chunks.push({
      ciphertext: ciphertextBytes.slice(start, end),
      nonce: new Uint8Array(12), // nonce is re-derived internally
    });
  }

  const plaintext = await decryptChunks(
    chunks,
    dek,
    fileIdBytes,
    baseNonce,
    (p) => onProgress({ stage: 'decrypting', progress: p })
  );

  zeroize(dek);

  timings['decrypting'] = nowMs() - t;
  onProgress({ stage: 'done', progress: 1, stageMs: timings['decrypting'] });

  return { plaintext, stageTimings: timings as Record<PipelineStage, number> };
}
