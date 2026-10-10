/**
 * algorithms.ts — Algorithm info from the server.
 */

import api from './client';

export interface AlgorithmInfo {
  name: string;
  liboqs_name: string;
  type: string;
  nist_level: number;
  public_key_size: number;
  secret_key_size: number;
  ciphertext_size?: number | null;  // KEM
  signature_size?: number | null;   // SIG
  standard: string;
  status: string;
  details?: Record<string, unknown>;
}

export interface AlgorithmListResponse {
  kems: AlgorithmInfo[];
  sigs: AlgorithmInfo[];  // backend returns "sigs" not "signatures"
}

export async function getAlgorithms(): Promise<AlgorithmListResponse> {
  return api.get<AlgorithmListResponse>('/algorithms');
}
