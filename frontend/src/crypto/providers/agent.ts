/**
 * agent.ts — Fallback provider that proxies crypto operations to a local Python agent.
 *
 * Used when liboqs-wasm is not available (e.g., for Falcon).
 * The Python agent is expected to be running at http://localhost:8765
 * (see 03_INTEGRATIONS.md §4).
 */

import type { SigProvider } from '../interfaces';
import { toBase64Url, fromBase64Url } from '../encoding';

const AGENT_BASE = import.meta.env.VITE_AGENT_URL ?? 'http://localhost:8765';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function agentPost(path: string, body: unknown): Promise<Record<string, any>> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `Cannot reach local agent at ${AGENT_BASE}. Start the agent or choose a non-Falcon signature algorithm.`
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent error ${res.status}: ${text}`);
  }
  return res.json();
}

function makeAgentSigProvider(algorithm: string): SigProvider {
  return {
    name: algorithm,

    async keygen() {
      const data = await agentPost('/keygen', { algorithm });
      return {
        publicKey: fromBase64Url(data.public_key),
        secretKey: fromBase64Url(data.secret_key),
      };
    },

    async sign(secretKey, message) {
      const data = await agentPost('/sign', {
        algorithm,
        secret_key: toBase64Url(secretKey),
        message: toBase64Url(message),
      });
      return fromBase64Url(data.signature);
    },

    async verify(publicKey, message, signature) {
      const data = await agentPost('/verify', {
        algorithm,
        public_key: toBase64Url(publicKey),
        message: toBase64Url(message),
        signature: toBase64Url(signature),
      });
      // Server may return boolean or string "true"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any).valid === true || (data as any).valid === 'true';
    },
  };
}

export const agentFalcon512Provider: SigProvider = makeAgentSigProvider('Falcon-512');
export const agentFalcon1024Provider: SigProvider = makeAgentSigProvider('Falcon-1024');
