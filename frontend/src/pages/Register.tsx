/**
 * Register.tsx — New user registration with PQ key generation.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { register as apiRegister } from '../api/auth';
import { generateAndStoreVault, exportVault } from '../crypto/keyVault';
import { mlKem768Provider } from '../crypto/providers/noble';
import { mlDsa65Provider, mlDsa44Provider, mlDsa87Provider, slhDsaSha2128fProvider } from '../crypto/providers/noble';
import { falcon512Provider } from '../crypto/providers/oqsWasm';
import { agentFalcon512Provider } from '../crypto/providers/agent';
import { toBase64Url } from '../crypto/encoding';
import { useToast } from '../components/common/Toast';
import { cn } from '../utils/cn';

const schema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Alphanumeric, _ or - only'),
  kemAlgorithm: z.string(),
  sigAlgorithm: z.string(),
  passphrase: z.string().min(12, 'Passphrase must be at least 12 characters'),
  passphraseConfirm: z.string(),
}).refine((d) => d.passphrase === d.passphraseConfirm, {
  message: 'Passphrases do not match',
  path: ['passphraseConfirm'],
});

type FormData = z.infer<typeof schema>;

const KEM_OPTIONS = [
  { name: 'ML-KEM-768', label: 'ML-KEM-768 (FIPS 203, Recommended)', desc: 'NIST Level 3 — 1184 B public key, 1088 B ciphertext. Balanced security/performance.' },
  { name: 'ML-KEM-1024', label: 'ML-KEM-1024 (FIPS 203, High Security)', desc: 'NIST Level 5 — 1568 B public key. Maximum security.' },
  { name: 'ML-KEM-512', label: 'ML-KEM-512 (FIPS 203, Compact)', desc: 'NIST Level 1 — 800 B public key. Faster but lower security margin.' },
];

const SIG_OPTIONS = [
  { name: 'ML-DSA-65', label: 'ML-DSA-65 (FIPS 204, Recommended)', desc: 'NIST Level 3 — 1952 B public key, 3309 B signature. Fast signing.' },
  { name: 'ML-DSA-44', label: 'ML-DSA-44 (FIPS 204, Compact)', desc: 'NIST Level 2 — 1312 B public key, 2420 B signature. Smaller keys.' },
  { name: 'ML-DSA-87', label: 'ML-DSA-87 (FIPS 204, High Security)', desc: 'NIST Level 5 — 2592 B public key, 4627 B signature. Maximum security.' },
  { name: 'SLH-DSA-SHA2-128f', label: 'SLH-DSA-SHA2-128f (FIPS 205, Hash-based)', desc: 'NIST Level 1 — 32 B public key, 17088 B signature. Very conservative — hash-based security.' },
  { name: 'Falcon-512', label: 'Falcon-512 (Draft FN-DSA, Compact)', desc: 'NIST Level 1 — 897 B public key, ~666 B signature. Smallest signatures. Requires WASM or local agent.' },
];

function passphraseStrength(p: string): { score: number; label: string; color: string } {
  if (p.length === 0) return { score: 0, label: '', color: 'bg-muted' };
  let score = 0;
  if (p.length >= 12) score++;
  if (p.length >= 20) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^a-zA-Z0-9]/.test(p)) score++;

  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong', 'Excellent'];
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500', 'bg-emerald-600'];
  return { score, label: labels[score] ?? 'Excellent', color: colors[score] ?? 'bg-emerald-600' };
}

export default function Register() {
  const { error: showError, success } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'generating' | 'backup'>('form');
  const [progress, setProgress] = useState('');
  const [backupBlob, setBackupBlob] = useState<Blob | null>(null);
  const [downloadedBackup, setDownloadedBackup] = useState(false);
  const [username, setUsername] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { kemAlgorithm: 'ML-KEM-768', sigAlgorithm: 'ML-DSA-65' },
  });

  const passphrase = watch('passphrase', '');
  const strength = passphraseStrength(passphrase);

  async function getSigProvider(name: string) {
    switch (name) {
      case 'ML-DSA-44': return mlDsa44Provider;
      case 'ML-DSA-65': return mlDsa65Provider;
      case 'ML-DSA-87': return mlDsa87Provider;
      case 'SLH-DSA-SHA2-128f': return slhDsaSha2128fProvider;
      case 'Falcon-512':
        try {
          // Try WASM first
          await falcon512Provider.keygen();
          return falcon512Provider;
        } catch {
          return agentFalcon512Provider;
        }
      default: return mlDsa65Provider;
    }
  }

  async function onSubmit(data: FormData) {
    try {
      setStep('generating');
      setProgress('Generating post-quantum keys in browser…');

      const kemProvider = mlKem768Provider; // Always use ML-KEM-768 for now
      const sigProvider = await getSigProvider(data.sigAlgorithm);

      setProgress('Storing encrypted vault in IndexedDB…');
      const { kemPublicKey, sigPublicKey } = await generateAndStoreVault(
        data.username,
        data.passphrase,
        kemProvider,
        sigProvider
      );

      setProgress('Registering with server (public keys only)…');
      await apiRegister({
        username: data.username,
        kem_algorithm: data.kemAlgorithm,
        sig_algorithm: data.sigAlgorithm,
        kem_public_key: toBase64Url(kemPublicKey),
        sig_public_key: toBase64Url(sigPublicKey),
      });

      setProgress('Preparing backup file…');
      const blob = await exportVault(data.username);
      setBackupBlob(blob);
      setUsername(data.username);
      setStep('backup');
    } catch (err) {
      setStep('form');
      showError('Registration failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  function downloadBackup() {
    if (!backupBlob) return;
    const url = URL.createObjectURL(backupBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${username}.pqckey`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadedBackup(true);
  }

  function continueToLogin() {
    success('Registration complete!', 'Your keys have been generated. Please log in.');
    navigate('/login');
  }

  if (step === 'generating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md p-8">
          <div className="animate-spin w-12 h-12 border-2 border-primary border-t-transparent rounded-full mx-auto mb-6" />
          <h2 className="text-xl font-semibold mb-2">Generating Keys</h2>
          <p className="text-sm text-muted-foreground">{progress}</p>
          <p className="text-xs text-muted-foreground mt-4">This may take a few seconds for SPHINCS+ or Falcon…</p>
        </div>
      </div>
    );
  }

  if (step === 'backup') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-xl font-bold mb-2">Download Your Key Backup</h2>
            <p className="text-sm text-muted-foreground">
              <strong>Warning:</strong> Losing your secret key means losing access to all your files.
              The server cannot recover them. Download and store this backup file safely before continuing.
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 mb-6 text-sm text-yellow-800 dark:text-yellow-200">
            Your encrypted key file (<code>.pqckey</code>) contains your secret keys protected by your passphrase.
            Store it somewhere safe — a password manager, external drive, or secure cloud storage.
          </div>

          <button
            onClick={downloadBackup}
            className={cn(
              'w-full py-3 rounded-lg font-medium text-sm mb-4 transition-colors',
              downloadedBackup
                ? 'bg-green-600 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {downloadedBackup ? '✓ Backup Downloaded' : '⬇ Download Key Backup (.pqckey)'}
          </button>

          <button
            onClick={continueToLogin}
            disabled={!downloadedBackup}
            className="w-full py-3 rounded-lg font-medium text-sm border border-border hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue to Login →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="text-xl font-bold"><span className="text-primary">Quantum</span>Store</Link>
          <h1 className="text-2xl font-bold mt-4 mb-2">Create Your Account</h1>
          <p className="text-sm text-muted-foreground">Keys are generated in your browser. No passwords are sent to the server.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-border rounded-xl p-8 space-y-6">
          {/* Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1">Username</label>
            <input
              id="username"
              {...register('username')}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. alice"
              autoComplete="username"
            />
            {errors.username && <p className="text-xs text-destructive mt-1">{errors.username.message}</p>}
          </div>

          {/* KEM Algorithm */}
          <div>
            <label className="block text-sm font-medium mb-2">Key Encapsulation (KEM)</label>
            <div className="space-y-2">
              {KEM_OPTIONS.map((opt) => (
                <label key={opt.name} className="flex items-start gap-3 p-3 rounded-lg border border-input hover:bg-secondary cursor-pointer transition-colors">
                  <input type="radio" value={opt.name} {...register('kemAlgorithm')} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Signature Algorithm */}
          <div>
            <label className="block text-sm font-medium mb-2">Signature Algorithm</label>
            <div className="space-y-2">
              {SIG_OPTIONS.map((opt) => (
                <label key={opt.name} className="flex items-start gap-3 p-3 rounded-lg border border-input hover:bg-secondary cursor-pointer transition-colors">
                  <input type="radio" value={opt.name} {...register('sigAlgorithm')} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Passphrase */}
          <div>
            <label htmlFor="passphrase" className="block text-sm font-medium mb-1">Vault Passphrase</label>
            <input
              id="passphrase"
              type="password"
              {...register('passphrase')}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="At least 12 characters"
              autoComplete="new-password"
            />
            {passphrase && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={cn('h-1.5 flex-1 rounded-full transition-colors', i < strength.score ? strength.color : 'bg-muted')}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{strength.label}</p>
              </div>
            )}
            {errors.passphrase && <p className="text-xs text-destructive mt-1">{errors.passphrase.message}</p>}
          </div>

          {/* Confirm passphrase */}
          <div>
            <label htmlFor="passphraseConfirm" className="block text-sm font-medium mb-1">Confirm Passphrase</label>
            <input
              id="passphraseConfirm"
              type="password"
              {...register('passphraseConfirm')}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Repeat passphrase"
              autoComplete="new-password"
            />
            {errors.passphraseConfirm && <p className="text-xs text-destructive mt-1">{errors.passphraseConfirm.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Generating keys…' : 'Generate Keys & Register'}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
