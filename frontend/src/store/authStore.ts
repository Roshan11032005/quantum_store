/**
 * authStore.ts — Authentication state (JWT in memory, NOT persisted).
 */

import { create } from 'zustand';
import { clearToken } from '../api/client';

interface AuthState {
  username: string | null;
  userId: string | null;
  sigKeyId: string | null;
  isAuthenticated: boolean;
  login: (username: string, userId: string, sigKeyId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  username: null,
  userId: null,
  sigKeyId: null,
  isAuthenticated: false,

  login(username: string, userId: string, sigKeyId: string) {
    set({ username, userId, sigKeyId, isAuthenticated: true });
  },

  logout() {
    clearToken();
    set({ username: null, userId: null, sigKeyId: null, isAuthenticated: false });
  },
}));
