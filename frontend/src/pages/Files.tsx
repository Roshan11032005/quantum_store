/**
 * Files.tsx — File list with search, sort, pagination.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listFiles, deleteFile, verifyFile } from '../api/files';
import { formatDate } from '../utils/format';
import { useToast } from '../components/common/Toast';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { ByteSize } from '../components/common/ByteSize';

type IntegrityStatus = 'verified' | 'unverified' | 'failed';

function IntegrityBadge({ status }: { status: IntegrityStatus }) {
  const styles: Record<IntegrityStatus, string> = {
    verified: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300',
    unverified: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
  };
  const labels: Record<IntegrityStatus, string> = {
    verified: '✓ Verified', unverified: '? Unverified', failed: '✗ TAMPERED'
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${styles[status]}`} role="status" aria-label={`Integrity ${status}`}>
      {labels[status]}
    </span>
  );
}

export default function Files() {
  const { success, error: showError } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['files', { page, search, sort, order }],
    queryFn: () => listFiles({ page, page_size: 20, search, sort, order }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteFile,
    onSuccess: () => {
      success('File deleted');
      qc.invalidateQueries({ queryKey: ['files'] });
      setDeleteTarget(null);
    },
    onError: (err) => showError('Delete failed', err instanceof Error ? err.message : undefined),
  });

  const verifyMut = useMutation({
    mutationFn: verifyFile,
    onSuccess: (result) => {
      if (result.hash_ok && result.signature_ok) {
        success('Integrity verified', 'File is intact and signature is valid.');
      } else {
        showError('Integrity FAILED', 'This file may have been tampered with!');
      }
      qc.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (err) => showError('Verify failed', err instanceof Error ? err.message : undefined),
  });

  function toggleOrder(col: string) {
    if (sort === col) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      setOrder('asc');
    }
  }

  function SortHeader({ col, label }: { col: string; label: string }) {
    return (
      <button
        onClick={() => toggleOrder(col)}
        className="flex items-center gap-1 text-xs text-muted-foreground font-medium hover:text-foreground"
        aria-sort={sort === col ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        {sort === col && <span aria-hidden="true">{order === 'asc' ? ' ↑' : ' ↓'}</span>}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">My Files</h1>
        <Link
          to="/upload"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          ⬆ Upload File
        </Link>
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Search files…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full max-w-sm px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Search files"
      />

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-secondary/50">
            <tr>
              <th className="text-left px-4 py-3"><SortHeader col="filename" label="Name" /></th>
              <th className="text-left px-4 py-3"><SortHeader col="file_size" label="Size" /></th>
              <th className="text-left px-4 py-3"><SortHeader col="stored_size" label="Stored" /></th>
              <th className="text-left px-4 py-3"><SortHeader col="created_at" label="Uploaded" /></th>
              <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Sig Alg</th>
              <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Integrity</th>
              <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : data?.files.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-muted-foreground">
                  No files found.{' '}
                  <Link to="/upload" className="text-primary hover:underline">Upload one →</Link>
                </td>
              </tr>
            ) : (
              data?.files.map((file) => (
                <tr key={file.file_id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/files/${file.file_id}`} className="font-medium hover:text-primary transition-colors">
                      {file.metadata?.original_filename || <span className="italic text-muted-foreground">[filename hidden]</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground"><ByteSize bytes={file.metadata?.original_size ?? 0} /></td>
                  <td className="px-4 py-3 text-muted-foreground"><ByteSize bytes={file.ciphertext_size} /></td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(file.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded">{file.metadata?.sig_alg ?? '?'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <IntegrityBadge status="unverified" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      <Link to={`/files/${file.file_id}`} className="text-xs text-primary hover:underline">Details</Link>
                      <button
                        onClick={() => verifyMut.mutate(file.file_id)}
                        className="text-xs hover:underline text-muted-foreground"
                      >
                        Verify
                      </button>
                      <button
                        onClick={() => setDeleteTarget(file.file_id)}
                        className="text-xs hover:underline text-destructive"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {data.total} total files · Page {page}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded border border-border hover:bg-secondary disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= data.total}
              className="px-3 py-1.5 text-sm rounded border border-border hover:bg-secondary disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete File"
        description="This will permanently delete the encrypted file from the server. You cannot undo this."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
