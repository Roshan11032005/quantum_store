/**
 * Upload.tsx — File upload page with drag-and-drop and pipeline stepper.
 */

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useVaultStore } from '../store/vaultStore';
import { useAuthStore } from '../store/authStore';
import { uploadPipeline, type PipelineStage, type PipelineProgress, type UploadResult } from '../crypto/protocol';
import { getKemProviderByName, getResolvableSigProvider } from '../crypto/providerRegistry';
import { uploadFile } from '../api/files';
import { useToast } from '../components/common/Toast';
import { formatBytes, formatMs } from '../utils/format';
import { cn } from '../utils/cn';

const STAGES: PipelineStage[] = ['encrypting', 'encapsulating', 'signing', 'uploading'];
const STAGE_LABELS: Record<PipelineStage, string> = {
  encrypting: 'Encrypting',
  encapsulating: 'Encapsulating key',
  signing: 'Signing metadata',
  uploading: 'Uploading',
  fetching: 'Fetching',
  verifying_hash: 'Verifying hash',
  verifying_signature: 'Verifying signature',
  decapsulating: 'Decapsulating',
  decrypting: 'Decrypting',
  done: 'Done',
  error: 'Error',
};

export default function Upload() {
  const vault = useVaultStore();
  const { username, userId, sigKeyId } = useAuthStore();
  const { error: showError } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [hideFilename, setHideFilename] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) => [...prev, ...accepted]);
    setResult(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleUpload() {
    if (!vault.isUnlocked || !vault.kemPublicKey || !vault.sigSecretKey || !vault.kemAlgorithm || !vault.sigAlgorithm) {
      showError('Vault locked', 'Unlock your vault to upload files.');
      return;
    }
    if (!userId || !sigKeyId) {
      showError('Not authenticated', 'Please log in again.');
      return;
    }
    if (files.length === 0) return;

    setUploading(true);
    setResult(null);

    const file = files[0]; // Handle one file at a time for now
    try {
      const kemProvider = getKemProviderByName(vault.kemAlgorithm);
      const sigProvider = await getResolvableSigProvider(vault.sigAlgorithm);

      const uploadResult = await uploadPipeline(
        file,
        userId,
        sigKeyId,
        kemProvider,
        sigProvider,
        vault.kemPublicKey,
        vault.sigSecretKey,
        hideFilename,
        async (fileId, metadata, kemCiphertext, wrappedDek, metadataSignature, ciphertextBlob, sigKeyIdParam, onProg) => {
          await uploadFile(fileId, metadata, kemCiphertext, wrappedDek, metadataSignature, ciphertextBlob, sigKeyIdParam, onProg);
        },
        (p) => setProgress(p)
      );

      setResult(uploadResult);
      setFiles((prev) => prev.slice(1));
    } catch (err) {
      showError('Upload failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  }

  const currentStageIdx = progress ? STAGES.indexOf(progress.stage) : -1;

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Upload File</h1>

      {!vault.isUnlocked && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 text-sm text-yellow-800 dark:text-yellow-200">
          ⚠️ Your vault is locked. Unlock it to upload files.
        </div>
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        )}
        aria-label="File drop zone"
      >
        <input {...getInputProps()} aria-label="File input" />
        <p className="text-4xl mb-3">📂</p>
        <p className="font-medium">{isDragActive ? 'Drop files here…' : 'Drag & drop files here'}</p>
        <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
      </div>

      {/* File queue */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between bg-secondary rounded-lg px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
              </div>
              <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive text-sm">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Options */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm">Upload Options</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Hide filename from server</p>
            <p className="text-xs text-muted-foreground">Server will only see the file ID, not the name.</p>
          </div>
          <button
            role="switch"
            aria-checked={hideFilename}
            onClick={() => setHideFilename((h) => !h)}
            className={cn(
              'w-11 h-6 rounded-full transition-colors',
              hideFilename ? 'bg-primary' : 'bg-muted'
            )}
          >
            <span className={cn('block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5', hideFilename ? 'translate-x-5' : '')} />
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>KEM: <span className="font-mono font-medium text-foreground">{vault.kemAlgorithm ?? '—'}</span></span>
          <span>·</span>
          <span>Sig: <span className="font-mono font-medium text-foreground">{vault.sigAlgorithm ?? '—'}</span></span>
        </div>
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={uploading || files.length === 0 || !vault.isUnlocked}
        className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : `Encrypt & Upload${files.length > 1 ? ` (${files.length} files)` : ''}`}
      </button>

      {/* Pipeline stepper */}
      {uploading && progress && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Upload Progress</h2>
          <div className="space-y-3">
            {STAGES.map((stage, i) => {
              const isDone = i < currentStageIdx;
              const isActive = i === currentStageIdx;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    isDone ? 'bg-green-500 text-white' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    {isDone ? '✓' : i + 1}
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-sm', isActive ? 'font-medium' : 'text-muted-foreground')}>{STAGE_LABELS[stage]}</p>
                    {isActive && (
                      <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(progress.progress * 100).toFixed(0)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {isDone && progress.stageMs && i === currentStageIdx - 1 && (
                    <span className="text-xs text-muted-foreground">{formatMs(progress.stageMs)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-xl p-6">
          <h2 className="font-semibold text-green-800 dark:text-green-300 mb-3">✓ Upload Complete</h2>
          <div className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">File ID:</span> <code className="font-mono text-xs">{result.fileId}</code></p>
            <p><span className="text-muted-foreground">Original:</span> {formatBytes(result.originalSize)}</p>
            <p><span className="text-muted-foreground">Ciphertext:</span> {formatBytes(result.totalCiphertextSize)}</p>
            <p><span className="text-muted-foreground">Overhead:</span> +{(((result.totalCiphertextSize - result.originalSize) / result.originalSize) * 100).toFixed(1)}%</p>
            <p><span className="text-muted-foreground">Signature:</span> {formatBytes(result.signatureSize)}</p>
          </div>
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">Stage timings</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(result.stageTimings).map(([stage, ms]) => (
                <div key={stage} className="text-xs">
                  <span className="text-muted-foreground capitalize">{stage}:</span>{' '}
                  <span className="font-medium">{formatMs(ms)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
