/**
 * Topbar.tsx — Top navigation bar with theme toggle and vault lock button.
 */

import { useState, useEffect } from 'react';
import { useVaultStore } from '../../store/vaultStore';

export function Topbar({ title }: { title?: string }) {
  const { isUnlocked, lock } = useVaultStore();
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <button
          onClick={() => setIsDark((d) => !d)}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-sm"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? '☀' : '🌙'}
        </button>

        {/* Lock vault */}
        {isUnlocked && (
          <button
            onClick={lock}
            className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary text-muted-foreground transition-colors"
            aria-label="Lock vault"
          >
            🔒 Lock
          </button>
        )}
      </div>
    </header>
  );
}
