/**
 * files.ts — File management API calls.
 */

import api, { getToken } from './client';
import { toBase64Url } from '../crypto/encoding';
import { canonicalJson } from '../crypto/canonical';
import type { UploadMetadata } from '../crypto/protocol';

/** Matches backend FileSummary (list response items) */
export interface FileRecord {
  file_id: string;
  owner_id: string;
  ciphertext_size: number;
  created_at: string;
  metadata: {
    original_filename?: string;
    original_size?: number;
    mime_type?: string;
    kem_alg?: string;
    sig_alg?: string;
    ciphertext_sha256?: string;
    [key: string]: unknown;
  };
}

/** Matches backend FileDetail (single file GET) */
export interface FileDetail {
  file_id: string;
  metadata: Record<string, unknown>;
  kem_ciphertext: string;  // base64url
  wrapped_dek: string;     // base64url
  signature: string;       // base64url
}

export interface FileListResponse {
  files: FileRecord[];
  total: number;
}

export interface VerifyResponse {
  hash_ok: boolean;
  signature_ok: boolean;
  checked_at: string;
}

export async function listFiles(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}): Promise<FileListResponse> {
  // Backend returns a plain array
  const items = await api.get<FileRecord[]>('/files', { params });
  return { files: items, total: items.length };
}

export async function getFile(fileId: string): Promise<FileDetail> {
  return api.get<FileDetail>(`/files/${fileId}`);
}

export async function uploadFile(
  fileId: string,
  metadata: UploadMetadata,
  kemCiphertext: Uint8Array,
  wrappedDek: Uint8Array,
  signature: Uint8Array,
  ciphertextBlob: Blob,
  sigKeyId: string,
  onProgress?: (progress: number) => void
): Promise<{ file_id: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadataJson = canonicalJson(metadata as any);

  const formData = new FormData();
  formData.append('metadata', metadataJson);
  formData.append('kem_ciphertext', toBase64Url(kemCiphertext));
  formData.append('wrapped_dek', toBase64Url(wrappedDek));
  formData.append('signature', toBase64Url(signature));
  formData.append('sig_key_id', sigKeyId);
  formData.append('ciphertext', ciphertextBlob, `${fileId}.bin`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const authToken = getToken();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress?.(e.loaded / e.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ file_id: fileId });
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.message ?? err.detail ?? `Upload failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));

    const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
    xhr.open('POST', `${apiBase}/files`);
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.send(formData);
  });
}

export async function downloadFileCiphertext(fileId: string): Promise<ArrayBuffer> {
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
  const token = getToken();

  const res = await fetch(`${apiBase}/files/${fileId}/content`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.arrayBuffer();
}

export async function verifyFile(fileId: string): Promise<VerifyResponse> {
  return api.post<VerifyResponse>(`/files/${fileId}/verify`);
}

export async function deleteFile(fileId: string): Promise<void> {
  return api.delete(`/files/${fileId}`);
}
