/**
 * FileDetail.tsx — Detailed file view with download and tamper demo.
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFile, verifyFile, downloadFileCiphertext } from '../api/files';
import type { FileDetail } from '../api/files';
import { useVaultStore } from '../store/vaultStore';
import { useToast } from '../components/common/Toast';
import { downloadPipeline, type PipelineProgress, type UploadMetadata } from '../crypto/protocol';
import { getKemProviderByName, getSigProviderByName } from '../crypto/providerRegistry';
import { fromBase64Url } from '../crypto/encoding';
import { formatBytes, formatDate } from '../utils/format';
import { CopyButton } from '../components/common/CopyButton';

const STAGE_LABELS: Record<string, string> = {
  fetching: 'Fetching ciphertext',
  verifying_hash: 'Verifying integrity hash',
  verifying_signature: 'Verifying signature',
  decapsulating: 'Decapsulating key',
  decrypting: 'Decrypting',
  done: 'Done',
};

export default function FileDetail() {
  const { fileId } = useParams<{ fileId: string }>();
  const vault = useVaultStore();
  const { error: showError, success } = useToast();
  const qc = useQueryClient();
  const [dlProgress, setDlProgress] = useState<PipelineProgress | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [allowUnsafe, setAllowUnsafe] = useState(false);

  const { data: file, isLoading } = useQuery({
    queryKey: ['file', fileId],
    queryFn: () => getFile(fileId!),
    enabled: !!fileId,
  });

  const verifyMut = useMutation({
    mutationFn: () => verifyFile(fileId!),
    onSuccess: (r) => {
      if (r.hash_ok && r.signature_ok) success('Integrity OK', 'File hash and signature verified by server.');
      else showError('Integrity FAILED', 'Server detected tampering!');
      qc.invalidateQueries({ queryKey: ['file', fileId] });
    },
    onError: (err) => showError('Verify error', err instanceof Error ? err.message : undefined),
  });

  async function handleDownload() {
    if (!vault.isUnlocked || !vault.kemSecretKey || !vault.sigPublicKey) {
      showError('Vault locked', 'Unlock your vault to download files.');
      return;
    }
    if (!file) return;
    setDownloading(true);
    try {
      setDlProgress({ stage: 'fetching', progress: 0 });
      const ciphertextBuf = await downloadFileCiphertext(file.file_id);
      setDlProgress({ stage: 'fetching', progress: 1 });

      const ciphertextBytes = new Uint8Array(ciphertextBuf);
      const signature = fromBase64Url(file.signature);

      // Merge top-level kem_ciphertext/wrapped_dek into the nested metadata
      const meta = file.metadata as Record<string, unknown>;
      const metadata: UploadMetadata = {
        ...meta,
        kem_ciphertext: file.kem_ciphertext,
        wrapped_dek: file.wrapped_dek,
      } as UploadMetadata;

      const kemAlg = (meta.kem_alg as string) ?? vault.kemAlgorithm ?? 'ML-KEM-768';
      const sigAlg = (meta.sig_alg as string) ?? vault.sigAlgorithm ?? 'ML-DSA-65';
      const kemProvider = getKemProviderByName(kemAlg);
      const sigProvider = getSigProviderByName(sigAlg);

      const { plaintext } = await downloadPipeline(
        metadata,
        ciphertextBytes,
        signature,
        sigProvider,
        vault.sigPublicKey,
        kemProvider,
        vault.kemSecretKey,
        (p) => setDlProgress(p),
        allowUnsafe
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = new Blob([plaintext as any], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (meta.original_filename as string) || file.file_id;
      a.click();
      URL.revokeObjectURL(url);
      success('Download complete', 'File decrypted and verified successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'INTEGRITY_FAILED') {
        showError('TAMPER DETECTED', 'The stored file was modified. Do not trust it.');
      } else if (msg === 'SIGNATURE_INVALID') {
        showError('SIGNATURE INVALID', 'This file was not signed by its claimed owner.');
      } else {
        showError('Download failed', msg);
      }
    } finally {
      setDownloading(false);
      setDlProgress(null);
    }
  }

  if (isLoading) {
    return <div className="animate-pulse space-y-4"><div className="h-8 bg-secondary rounded w-64" /><div className="h-48 bg-secondary rounded" /></div>;
  }

  if (!file) {
    return <div className="text-center py-16"><p className="text-muted-foreground">File not found.</p><Link to="/files" className="text-primary hover:underline">← Back to files</Link></div>;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link to="/files" className="text-sm text-muted-foreground hover:text-foreground">← Files</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold truncate">{(file.metadata?.original_filename as string) || <span className="italic text-muted-foreground">[filename hidden]</span>}</h1>
      </div>

      {/* Metadata */}
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {[
          ['File ID', <span key="fid" className="font-mono text-xs">{file.file_id} <CopyButton text={file.file_id} /></span>],
          ['Original Size', formatBytes((file.metadata?.original_size as number) ?? 0)],
          ['Stored (encrypted) Size', '—'],
          ['Uploaded', formatDate((file.metadata?.created_at as string) ?? '')],
          ['KEM Algorithm', (file.metadata?.kem_alg as string) ?? '—'],
          ['Signature Algorithm', (file.metadata?.sig_alg as string) ?? '—'],
          ['Ciphertext Hash (SHA-256)', <span key="hash" className="font-mono text-xs break-all">{file.metadata?.ciphertext_sha256 as string} <CopyButton text={(file.metadata?.ciphertext_sha256 as string) ?? ''} /></span>],
          ['Integrity', <IntegrityBadge key="ib" status="unverified" />],
          ['Last Verified', 'Never'],
        ].map(([label, value]) => (
          <div key={label as string} className="flex justify-between items-start px-5 py-3 gap-4">
            <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
            <span className="text-sm text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleDownload}
          disabled={downloading || !vault.isUnlocked}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {downloading ? 'Downloading…' : '⬇ Download & Decrypt'}
        </button>
        <button
          onClick={() => verifyMut.mutate()}
          disabled={verifyMut.isPending}
          className="px-6 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
        >
          {verifyMut.isPending ? 'Verifying…' : '✓ Verify Integrity'}
        </button>
      </div>

      {/* Advanced / unsafe download toggle */}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">Advanced options</summary>
        <div className="mt-3 p-4 bg-secondary rounded-lg space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowUnsafe}
              onChange={(e) => setAllowUnsafe(e.target.checked)}
            />
            <span>Allow "Download anyway (unsafe)" if verification fails</span>
          </label>
          {allowUnsafe && (
            <p className="text-yellow-600 dark:text-yellow-400 text-xs">
              ⚠️ Warning: Downloading without verification may expose you to tampered or malicious content.
            </p>
          )}
        </div>
      </details>

      {/* Download progress */}
      {downloading && dlProgress && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm">Download Progress</h2>
          <div className="space-y-2">
            {Object.keys(STAGE_LABELS).map((stage) => {
              const isDone = dlProgress && stage !== dlProgress.stage && Object.keys(STAGE_LABELS).indexOf(stage) < Object.keys(STAGE_LABELS).indexOf(dlProgress.stage);
              const isActive = dlProgress?.stage === stage;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isDone ? 'bg-green-500 text-white' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {isDone ? '✓' : '○'}
                  </div>
                  <p className={`text-sm ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>{STAGE_LABELS[stage]}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrityBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    verified: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300',
    unverified: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
  };
  const labels: Record<string, string> = { verified: '✓ Verified', unverified: '? Unverified', failed: '✗ TAMPERED' };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${styles[status] ?? ''}`}>
      {labels[status] ?? status}
    </span>
  );
}
