/**
 * keyVault.ts — Key generation, locking/unlocking, and IndexedDB persistence.
 *
 * Secret keys NEVER leave the browser.
 * At rest: AES-256-GCM(Argon2id(passphrase), {kem_sk, sig_sk, metadata}).
 * Unlocked keys live only in Zustand memory; auto-lock on idle or tab close.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { argon2id } from 'hash-wasm';
import type { KemProvider, SigProvider } from './interfaces';
import { toBase64Url, fromBase64Url, randomBytes, zeroize, toHex } from './encoding';
import { sha256 } from './aes';

const DB_NAME = 'pqc-vault';
const DB_VERSION = 1;
const STORE_NAME = 'vaults';

interface VaultRecord {
  username: string;
  kemAlgorithm: string;
  sigAlgorithm: string;
  encryptedBundle: string;   // base64url
  salt: string;              // base64url (Argon2id salt)
  iv: string;                // base64url (AES-GCM nonce)
  kemPublicKey: string;      // base64url
  sigPublicKey: string;      // base64url
  createdAt: number;
}

export interface UnlockedVault {
  username: string;
  kemAlgorithm: string;
  sigAlgorithm: string;
  kemPublicKey: Uint8Array;
  kemSecretKey: Uint8Array;
  sigPublicKey: Uint8Array;
  sigSecretKey: Uint8Array;
  kemFingerprint: string;
  sigFingerprint: string;
}

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'username' });
      }
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asBufferSource = (u: Uint8Array): BufferSource => u as any;

async function deriveWrappingKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawKey = await argon2id({
    password: passphrase,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'binary',
  });
  return crypto.subtle.importKey('raw', asBufferSource(rawKey as Uint8Array), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function fingerprint(publicKey: Uint8Array): Promise<string> {
  const hash = await sha256(publicKey);
  return toHex(hash).slice(0, 32);
}

/** Generate and store a new key vault for a user */
export async function generateAndStoreVault(
  username: string,
  passphrase: string,
  kemProvider: KemProvider,
  sigProvider: SigProvider
): Promise<{ kemPublicKey: Uint8Array; sigPublicKey: Uint8Array }> {
  const kemKeys = await kemProvider.keygen();
  const sigKeys = await sigProvider.keygen();

  const bundle = JSON.stringify({
    kem_sk: toBase64Url(kemKeys.secretKey),
    sig_sk: toBase64Url(sigKeys.secretKey),
  });
  const bundleBytes = new TextEncoder().encode(bundle);

  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(passphrase, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 },
    wrappingKey,
    asBufferSource(bundleBytes)
  );

  const record: VaultRecord = {
    username,
    kemAlgorithm: kemProvider.name,
    sigAlgorithm: sigProvider.name,
    encryptedBundle: toBase64Url(new Uint8Array(encrypted)),
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    kemPublicKey: toBase64Url(kemKeys.publicKey),
    sigPublicKey: toBase64Url(sigKeys.publicKey),
    createdAt: Date.now(),
  };

  const db = await getDB();
  await db.put(STORE_NAME, record);

  // Zeroize secret keys from this scope
  zeroize(kemKeys.secretKey);
  zeroize(sigKeys.secretKey);
  zeroize(bundleBytes);

  return { kemPublicKey: kemKeys.publicKey, sigPublicKey: sigKeys.publicKey };
}

/** Unlock vault by decrypting with passphrase */
export async function unlockVault(
  username: string,
  passphrase: string
): Promise<UnlockedVault> {
  const db = await getDB();
  const record: VaultRecord | undefined = await db.get(STORE_NAME, username);
  if (!record) throw new Error('VAULT_NOT_FOUND');

  const salt = fromBase64Url(record.salt);
  const iv = fromBase64Url(record.iv);
  const encryptedBundle = fromBase64Url(record.encryptedBundle);

  const wrappingKey = await deriveWrappingKey(passphrase, salt);

  let bundleBytes: ArrayBuffer;
  try {
    bundleBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 },
      wrappingKey,
      asBufferSource(encryptedBundle)
    );
  } catch {
    throw new Error('DECRYPT_FAILED');
  }

  const bundle = JSON.parse(new TextDecoder().decode(bundleBytes));
  const kemSecretKey = fromBase64Url(bundle.kem_sk);
  const sigSecretKey = fromBase64Url(bundle.sig_sk);
  const kemPublicKey = fromBase64Url(record.kemPublicKey);
  const sigPublicKey = fromBase64Url(record.sigPublicKey);

  return {
    username,
    kemAlgorithm: record.kemAlgorithm,
    sigAlgorithm: record.sigAlgorithm,
    kemPublicKey,
    kemSecretKey,
    sigPublicKey,
    sigSecretKey,
    kemFingerprint: await fingerprint(kemPublicKey),
    sigFingerprint: await fingerprint(sigPublicKey),
  };
}

/** Check if a vault exists locally for the given username */
export async function hasLocalVault(username: string): Promise<boolean> {
  const db = await getDB();
  const record = await db.get(STORE_NAME, username);
  return record !== undefined;
}

/** Get vault public keys (no passphrase needed) */
export async function getVaultPublicKeys(
  username: string
): Promise<{ kemPublicKey: Uint8Array; sigPublicKey: Uint8Array; kemAlgorithm: string; sigAlgorithm: string } | null> {
  const db = await getDB();
  const record: VaultRecord | undefined = await db.get(STORE_NAME, username);
  if (!record) return null;
  return {
    kemPublicKey: fromBase64Url(record.kemPublicKey),
    sigPublicKey: fromBase64Url(record.sigPublicKey),
    kemAlgorithm: record.kemAlgorithm,
    sigAlgorithm: record.sigAlgorithm,
  };
}

/** Export encrypted vault as a .pqckey file */
export async function exportVault(username: string): Promise<Blob> {
  const db = await getDB();
  const record: VaultRecord | undefined = await db.get(STORE_NAME, username);
  if (!record) throw new Error('VAULT_NOT_FOUND');
  return new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
}

/** Import a vault from a .pqckey file */
export async function importVault(fileContent: string): Promise<string> {
  const record: VaultRecord = JSON.parse(fileContent);
  if (!record.username || !record.encryptedBundle) throw new Error('Invalid vault file');
  const db = await getDB();
  await db.put(STORE_NAME, record);
  return record.username;
}

/** Delete vault from IndexedDB */
export async function deleteVault(username: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, username);
}
