/**
 * Login.tsx — Login page: sign nonce with local sig key.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getChallenge, verifyChallenge } from '../api/auth';
import { unlockVault, hasLocalVault, importVault } from '../crypto/keyVault';
import { useAuthStore } from '../store/authStore';
import { useVaultStore } from '../store/vaultStore';
import { useToast } from '../components/common/Toast';
import { fromBase64Url } from '../crypto/encoding';
import { getSigProviderByName } from '../crypto/providerRegistry';
import api from '../api/client';

const schema = z.object({
  username: z.string().min(1, 'Required'),
  passphrase: z.string().min(1, 'Required'),
});

type FormData = z.infer<typeof schema>;

export default function Login() {
  const { login } = useAuthStore();
  const { unlock } = useVaultStore();
  const { error: showError, success } = useToast();
  const navigate = useNavigate();
  const [importMode, setImportMode] = useState(false);
  const [importedFile, setImportedFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function handleImportKey(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportedFile(file);
  }

  async function onSubmit(data: FormData) {
    try {
      // If in import mode and a file was selected, import the vault first
      if (importMode && importedFile) {
        const text = await importedFile.text();
        await importVault(text);
      }

      // Check that local vault exists
      const hasVault = await hasLocalVault(data.username);
      if (!hasVault) {
        showError('No local keys found', 'Import your .pqckey backup file first.');
        setImportMode(true);
        return;
      }

      // Unlock vault
      const vault = await unlockVault(data.username, data.passphrase);

      // Get challenge from server
      const challenge = await getChallenge(data.username);

      // Build signing message: LOGIN_CONTEXT ‖ nonce ‖ username
      const loginContext = new TextEncoder().encode('pqc-storage-login-v1');
      const nonceBytes = fromBase64Url(challenge.nonce);
      const usernameBytes = new TextEncoder().encode(data.username);
      const message = new Uint8Array(loginContext.length + nonceBytes.length + usernameBytes.length);
      message.set(loginContext, 0);
      message.set(nonceBytes, loginContext.length);
      message.set(usernameBytes, loginContext.length + nonceBytes.length);

      const sigProvider = getSigProviderByName(vault.sigAlgorithm);
      const signature = await sigProvider.sign(vault.sigSecretKey, message);

      // Verify with server using challenge_id
      await verifyChallenge(challenge.challenge_id, signature);

      // Fetch user ID and default sig key ID from server
      const userInfo = await api.get<{ id: string; username: string }>('/users/me');
      const keys = await api.get<Array<{ id: string; key_type: string; is_default: boolean }>>('/users/me/keys');
      const sigKey = keys.find((k) => k.key_type === 'sig' && k.is_default);

      // Unlock vault in memory
      unlock(vault);
      login(data.username, userInfo.id, sigKey?.id ?? '');

      success('Signed in', `Welcome back, ${data.username}`);
      navigate('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (msg === 'DECRYPT_FAILED') {
        showError('Wrong passphrase', 'Could not decrypt your key vault.');
      } else if (msg === 'VAULT_NOT_FOUND') {
        showError('No local keys', 'Use "Import key file" to load your .pqckey backup.');
        setImportMode(true);
      } else {
        showError('Login failed', msg);
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link to="/" className="text-xl font-bold"><span className="text-primary">Quantum</span>Store</Link>
          <h1 className="text-2xl font-bold mt-4 mb-2">Sign In</h1>
          <p className="text-sm text-muted-foreground">Your passphrase unlocks your local key vault.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-border rounded-xl p-8 space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1">Username</label>
            <input
              id="username"
              {...register('username')}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoComplete="username"
            />
            {errors.username && <p className="text-xs text-destructive mt-1">{errors.username.message}</p>}
          </div>

          <div>
            <label htmlFor="passphrase" className="block text-sm font-medium mb-1">Vault Passphrase</label>
            <input
              id="passphrase"
              type="password"
              {...register('passphrase')}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoComplete="current-password"
            />
            {errors.passphrase && <p className="text-xs text-destructive mt-1">{errors.passphrase.message}</p>}
          </div>

          {/* Import key file toggle */}
          <div>
            <button
              type="button"
              onClick={() => setImportMode((m) => !m)}
              className="text-xs text-primary hover:underline"
            >
              {importMode ? '↑ Hide import' : '↓ No keys on this device? Import key file'}
            </button>
            {importMode && (
              <div className="mt-3 p-3 bg-secondary rounded-lg">
                <label className="block text-xs font-medium mb-2">Import .pqckey backup</label>
                <input
                  type="file"
                  accept=".pqckey,.json"
                  onChange={handleImportKey}
                  className="text-xs text-muted-foreground"
                />
                {importedFile && <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ {importedFile.name} selected</p>}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Unlocking vault & signing…' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            New user?{' '}
            <Link to="/register" className="text-primary hover:underline">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
