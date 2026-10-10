/**
 * encoding.ts — base64url, hex, and byte array helpers.
 * Never use atob/btoa for binary data; use these helpers.
 */

/** Encode Uint8Array to base64url (no padding) */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Decode base64url (with or without padding) to Uint8Array */
export function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const padded2 = pad ? padded + '='.repeat(4 - pad) : padded;
  const binary = atob(padded2);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode Uint8Array to lowercase hex string */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Decode hex string to Uint8Array */
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Concatenate multiple Uint8Arrays into one */
export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Write a 32-bit big-endian uint into a 4-byte array */
export function uint32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, value, false);
  return buf;
}

/** Convert a UUID string (with dashes) to 16 bytes */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  return fromHex(hex);
}

/** Securely zeroize a buffer (best-effort in JS) */
export function zeroize(buf: Uint8Array): void {
  buf.fill(0);
}

/** Generate n cryptographically random bytes */
export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(n) as Uint8Array<ArrayBuffer>;
  // crypto.getRandomValues is limited to 65536 bytes per call
  const MAX = 65536;
  for (let offset = 0; offset < n; offset += MAX) {
    crypto.getRandomValues(buf.subarray(offset, offset + MAX));
  }
  return buf;
}

/** Compare two byte arrays in constant time */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
