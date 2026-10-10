/**
 * Dashboard.tsx — Overview dashboard.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listFiles } from '../api/files';
import { useAuthStore } from '../store/authStore';
import { useVaultStore } from '../store/vaultStore';
import { formatBytes, formatDate } from '../utils/format';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { username } = useAuthStore();
  const { sigAlgorithm, kemAlgorithm, isUnlocked, sigFingerprint } = useVaultStore();

  const { data, isLoading } = useQuery({
    queryKey: ['files', { page: 1, page_size: 5 }],
    queryFn: () => listFiles({ page: 1, page_size: 5, sort: 'created_at', order: 'desc' }),
  });

  const totalStorage = data?.files.reduce((s, f) => s + f.ciphertext_size, 0) ?? 0;
  const verified = 0;
  const failed = 0;

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {username}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Vault: {isUnlocked ? '🔓 Unlocked' : '🔒 Locked'} ·{' '}
          {sigAlgorithm && `Sig: ${sigAlgorithm}`} · {kemAlgorithm && `KEM: ${kemAlgorithm}`}
        </p>
        {sigFingerprint && (
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Fingerprint: {sigFingerprint.match(/.{1,4}/g)?.join(' ')}
          </p>
        )}
      </div>

      {/* Vault locked warning */}
      {!isUnlocked && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 text-sm text-yellow-800 dark:text-yellow-200">
          ⚠️ Your vault is locked. <Link to="/login" className="underline">Unlock it</Link> to upload or download files.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Files" value={data?.total ?? '—'} />
        <StatCard label="Encrypted Storage" value={formatBytes(totalStorage)} />
        <StatCard label="Verified" value={`${verified} / ${data?.files.length ?? 0}`} sub="integrity checks passed" />
        <StatCard
          label="Integrity Alerts"
          value={failed}
          sub={failed > 0 ? 'tamper detected!' : 'all clear'}
        />
      </div>

      {/* Quick actions */}
      <div className="flex gap-4 flex-wrap">
        <Link
          to="/upload"
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          ⬆ Upload File
        </Link>
        <Link
          to="/benchmarks/run"
          className="px-6 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
        >
          📊 Run Benchmark
        </Link>
        <Link
          to="/files"
          className="px-6 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
        >
          📁 All Files
        </Link>
      </div>

      {/* Recent files */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Files</h2>
          <Link to="/files" className="text-sm text-primary hover:underline">View all →</Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-secondary rounded-lg animate-pulse" />
            ))}
          </div>
        ) : data?.files.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-xl">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-muted-foreground">No files yet.</p>
            <Link to="/upload" className="text-sm text-primary hover:underline mt-2 inline-block">Upload your first file →</Link>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Size</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Uploaded</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Integrity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.files.map((file) => (
                  <tr key={file.file_id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/files/${file.file_id}`} className="font-medium hover:text-primary transition-colors">
                        {(file.metadata?.original_filename as string) || <span className="italic text-muted-foreground">[hidden]</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatBytes((file.metadata?.original_size as number) ?? 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(file.created_at)}</td>
                    <td className="px-4 py-3">
                      <IntegrityBadge status="unverified" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function IntegrityBadge({ status }: { status: 'verified' | 'unverified' | 'failed' }) {
  const styles = {
    verified: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300',
    unverified: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  };
  const labels = { verified: '✓ Verified', unverified: '? Unverified', failed: '✗ FAILED' };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${styles[status]}`} aria-label={`Integrity: ${status}`}>
      {labels[status]}
    </span>
  );
}
