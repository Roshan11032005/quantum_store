/**
 * auth.ts — Authentication API calls.
 */

import api, { setToken } from './client';
import { toBase64Url } from '../crypto/encoding';

export interface RegisterPayload {
  username: string;
  kem_algorithm: string;
  sig_algorithm: string;
  kem_public_key: string;  // base64url
  sig_public_key: string;  // base64url
}

export interface RegisterResponse {
  user_id: string;
  username: string;
  kem_fingerprint: string;
  sig_fingerprint: string;
}

export interface ChallengeResponse {
  challenge_id: string;
  nonce: string;    // base64url
  expires_in: number;
}

export interface VerifyResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  // Transform flat payload into nested backend format
  return api.post<RegisterResponse>('/auth/register', {
    json: {
      username: payload.username,
      kem: { algorithm: payload.kem_algorithm, public_key: payload.kem_public_key },
      sig: { algorithm: payload.sig_algorithm, public_key: payload.sig_public_key },
    },
  });
}

export async function getChallenge(username: string): Promise<ChallengeResponse> {
  return api.post<ChallengeResponse>('/auth/challenge', { json: { username } });
}

/**
 * Verify a login challenge.
 * @param challengeId - challenge_id returned by getChallenge
 * @param signature   - signature over LOGIN_CONTEXT ‖ nonce ‖ username
 */
export async function verifyChallenge(
  challengeId: string,
  signature: Uint8Array
): Promise<VerifyResponse> {
  const response = await api.post<VerifyResponse>('/auth/verify', {
    json: {
      challenge_id: challengeId,
      signature: toBase64Url(signature),
    },
  });
  setToken(response.access_token);
  return response;
}

export async function logout(): Promise<void> {
  setToken(null);
}
