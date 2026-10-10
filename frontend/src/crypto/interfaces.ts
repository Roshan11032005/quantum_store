/**
 * Core cryptographic provider interfaces.
 * All providers MUST implement these interfaces.
 * No custom crypto primitives — orchestration only.
 */

export interface KemProvider {
  readonly name: string;
  keygen(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }>;
  encapsulate(publicKey: Uint8Array): Promise<{ ciphertext: Uint8Array; sharedSecret: Uint8Array }>;
  decapsulate(secretKey: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>;
}

export interface SigProvider {
  readonly name: string;
  keygen(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }>;
  sign(secretKey: Uint8Array, message: Uint8Array): Promise<Uint8Array>;
  verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean>;
}

/** Registry maps algorithm name → provider */
export type KemRegistry = Map<string, KemProvider>;
export type SigRegistry = Map<string, SigProvider>;

export interface AlgorithmRegistry {
  kems: KemRegistry;
  sigs: SigRegistry;
  supportedKem(name: string): boolean;
  supportedSig(name: string): boolean;
  getKem(name: string): KemProvider;
  getSig(name: string): SigProvider;
}
