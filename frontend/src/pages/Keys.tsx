/**
 * Keys.tsx — Key management: view, fingerprint, export/import, lock.
 */

import { useState } from 'react';
import { useVaultStore } from '../store/vaultStore';
import { useAuthStore } from '../store/authStore';
import { exportVault, importVault } from '../crypto/keyVault';
import { useToast } from '../components/common/Toast';
import { CopyButton } from '../components/common/CopyButton';
import { formatFingerprint } from '../utils/format';

export default function Keys() {
  const vault = useVaultStore();
  const { username } = useAuthStore();
  const { success, error: showError } = useToast();
  const [exportLoading, setExportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  async function handleExport() {
    if (!username) return;
    setExportLoading(true);
    try {
      const blob = await exportVault(username);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${username}.pqckey`;
      a.click();
      URL.revokeObjectURL(url);
      success('Key backup downloaded', 'Store it safely — it is encrypted with your passphrase.');
    } catch (err) {
      showError('Export failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExportLoading(false);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    try {
      const text = await importFile.text();
      const importedUsername = await importVault(text);
      success('Vault imported', `Keys for "${importedUsername}" imported. Log in to unlock.`);
      setImportFile(null);
    } catch (err) {
      showError('Import failed', err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Key Management</h1>

      {/* Vault status */}
      <div className={`rounded-xl border p-5 ${vault.isUnlocked ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'}`}>
        <p className={`font-semibold ${vault.isUnlocked ? 'text-green-800 dark:text-green-300' : 'text-yellow-800 dark:text-yellow-300'}`}>
          {vault.isUnlocked ? '🔓 Vault Unlocked' : '🔒 Vault Locked'}
        </p>
        {vault.isUnlocked ? (
          <button onClick={() => vault.lock()} className="mt-2 text-sm underline">Lock vault now</button>
        ) : (
          <p className="text-sm mt-1 opacity-80">Log in to unlock your vault and view secret key details.</p>
        )}
      </div>

      {/* Key info */}
      {vault.isUnlocked && (
        <div className="space-y-4">
          <KeyCard
            type="KEM"
            algorithm={vault.kemAlgorithm ?? '—'}
            fingerprint={vault.kemFingerprint}
            publicKey={vault.kemPublicKey}
          />
          <KeyCard
            type="Signature"
            algorithm={vault.sigAlgorithm ?? '—'}
            fingerprint={vault.sigFingerprint}
            publicKey={vault.sigPublicKey}
          />
        </div>
      )}

      {/* Auto-lock setting */}
      {vault.isUnlocked && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-3">Auto-Lock</h2>
          <div className="flex items-center gap-3">
            <label htmlFor="idleTimeout" className="text-sm text-muted-foreground">Lock after idle</label>
            <select
              id="idleTimeout"
              value={vault.idleTimeoutMs}
              onChange={(e) => vault.setIdleTimeout(Number(e.target.value))}
              className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value={5 * 60 * 1000}>5 minutes</option>
              <option value={10 * 60 * 1000}>10 minutes</option>
              <option value={30 * 60 * 1000}>30 minutes</option>
              <option value={60 * 60 * 1000}>1 hour</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Vault also auto-locks when you switch browser tabs.</p>
        </div>
      )}

      {/* Export */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold mb-2">Export Key Backup</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Download your encrypted key file (<code>.pqckey</code>). It is protected by your vault passphrase.
          Store it in a password manager or external drive.
        </p>
        <button
          onClick={handleExport}
          disabled={exportLoading || !username}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {exportLoading ? 'Exporting…' : '⬇ Download .pqckey'}
        </button>
      </div>

      {/* Import */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold mb-2">Import Key File</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Restore keys from a <code>.pqckey</code> backup file on this device.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="file"
            accept=".pqckey,.json"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted-foreground"
          />
          <button
            onClick={handleImport}
            disabled={!importFile}
            className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-40"
          >
            Import
          </button>
        </div>
        {importFile && <p className="text-xs text-green-600 dark:text-green-400 mt-2">✓ {importFile.name}</p>}
      </div>

      {/* Warning */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-xl p-4 text-sm text-yellow-800 dark:text-yellow-200">
        ⚠️ <strong>Losing your secret key means losing access to all files.</strong> The server cannot recover them.
        Always keep at least one encrypted backup.
      </div>
    </div>
  );
}

function KeyCard({ type, algorithm, fingerprint, publicKey }: {
  type: string;
  algorithm: string;
  fingerprint: string | null;
  publicKey: Uint8Array | null;
}) {
  const [showPk, setShowPk] = useState(false);
  const pkHex = publicKey ? Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join('') : null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{type} Key</p>
          <p className="font-semibold mt-0.5">{algorithm}</p>
        </div>
        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">Active</span>
      </div>

      {fingerprint && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1">Fingerprint (SHA-256)</p>
          <div className="flex items-center gap-2">
            <code className="font-mono text-xs bg-secondary px-3 py-1.5 rounded-md">{formatFingerprint(fingerprint)}</code>
            <CopyButton text={fingerprint} label="Copy" />
          </div>
        </div>
      )}

      {pkHex && (
        <div className="mt-3">
          <button
            onClick={() => setShowPk((s) => !s)}
            className="text-xs text-primary hover:underline"
          >
            {showPk ? 'Hide public key' : 'Show public key (hex)'}
          </button>
          {showPk && (
            <div className="mt-2 relative">
              <code className="font-mono text-xs bg-secondary rounded-lg p-3 block break-all max-h-32 overflow-y-auto">{pkHex}</code>
              <CopyButton text={pkHex} className="absolute top-2 right-2" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
