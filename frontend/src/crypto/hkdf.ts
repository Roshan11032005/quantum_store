/**
 * hkdf.ts — HKDF-SHA-256 using the Web Crypto API.
 * Used to derive KEK from KEM shared secret.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asBufferSource = (u: Uint8Array): BufferSource => u as any;

/**
 * HKDF-SHA256 with the given IKM, salt, info, and output length.
 * @param ikm   - Input key material
 * @param salt  - Salt (may be empty)
 * @param info  - Context info string or bytes
 * @param length - Output length in bytes (default 32)
 */
export async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string | Uint8Array,
  length = 32
): Promise<Uint8Array> {
  const ikmKey = await crypto.subtle.importKey('raw', asBufferSource(ikm), 'HKDF', false, ['deriveBits']);

  const infoBytes =
    typeof info === 'string' ? new TextEncoder().encode(info) : info;

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: asBufferSource(salt),
      info: asBufferSource(infoBytes),
    },
    ikmKey,
    length * 8
  );

  return new Uint8Array(derived);
}
