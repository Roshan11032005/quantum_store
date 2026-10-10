/**
 * vaultStore.ts — In-memory key vault (unlocked keys live ONLY here, never persisted).
 *
 * Auto-locks after configurable idle time (default 10 min) and on tab close.
 */

import { create } from 'zustand';
import { zeroize } from '../crypto/encoding';

const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface VaultState {
  isUnlocked: boolean;
  username: string | null;
  kemAlgorithm: string | null;
  sigAlgorithm: string | null;
  kemPublicKey: Uint8Array | null;
  kemSecretKey: Uint8Array | null;
  sigPublicKey: Uint8Array | null;
  sigSecretKey: Uint8Array | null;
  kemFingerprint: string | null;
  sigFingerprint: string | null;
  idleTimeoutMs: number;

  unlock: (vault: {
    username: string;
    kemAlgorithm: string;
    sigAlgorithm: string;
    kemPublicKey: Uint8Array;
    kemSecretKey: Uint8Array;
    sigPublicKey: Uint8Array;
    sigSecretKey: Uint8Array;
    kemFingerprint: string;
    sigFingerprint: string;
  }) => void;

  lock: () => void;
  setIdleTimeout: (ms: number) => void;
  resetIdleTimer: () => void;
}

let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer() {
  if (_idleTimer !== null) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
}

export const useVaultStore = create<VaultState>((set, get) => ({
  isUnlocked: false,
  username: null,
  kemAlgorithm: null,
  sigAlgorithm: null,
  kemPublicKey: null,
  kemSecretKey: null,
  sigPublicKey: null,
  sigSecretKey: null,
  kemFingerprint: null,
  sigFingerprint: null,
  idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,

  unlock(vault) {
    set({
      isUnlocked: true,
      ...vault,
    });
    get().resetIdleTimer();
  },

  lock() {
    clearIdleTimer();
    const state = get();
    // Zeroize secret keys from memory (best-effort in JS)
    if (state.kemSecretKey) zeroize(state.kemSecretKey);
    if (state.sigSecretKey) zeroize(state.sigSecretKey);
    set({
      isUnlocked: false,
      kemSecretKey: null,
      sigSecretKey: null,
    });
  },

  setIdleTimeout(ms: number) {
    set({ idleTimeoutMs: ms });
    get().resetIdleTimer();
  },

  resetIdleTimer() {
    clearIdleTimer();
    const { idleTimeoutMs, lock } = get();
    _idleTimer = setTimeout(() => {
      lock();
    }, idleTimeoutMs);
  },
}));

// Auto-lock on tab close / page hide
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      useVaultStore.getState().lock();
    }
  });
}
