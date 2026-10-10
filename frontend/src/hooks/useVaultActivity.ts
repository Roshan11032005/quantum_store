/**
 * useVaultActivity.ts — Reset vault idle timer on user activity.
 */

import { useEffect } from 'react';
import { useVaultStore } from '../store/vaultStore';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];

export function useVaultActivity() {
  const { resetIdleTimer, isUnlocked } = useVaultStore();

  useEffect(() => {
    if (!isUnlocked) return;

    const handler = () => resetIdleTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handler, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handler));
    };
  }, [isUnlocked, resetIdleTimer]);
}
