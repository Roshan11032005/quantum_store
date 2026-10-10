/**
 * Algorithms.tsx — Reference page for supported algorithms.
 */

import { useQuery } from '@tanstack/react-query';
import { getAlgorithms } from '../api/algorithms';
import type { AlgorithmInfo } from '../api/algorithms';

function StatusBadge({ status }: { status: string }) {
  const isStd = status.toLowerCase().includes('standardized') || status.toLowerCase().includes('fips');
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${isStd ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'}`}>
      {status}
    </span>
  );
}

const FALLBACK_KEMS: AlgorithmInfo[] = [
  { name: 'ML-KEM-512', liboqs_name: 'ML-KEM-512', type: 'kem', nist_level: 1, public_key_size: 800, secret_key_size: 1632, ciphertext_size: 768, standard: 'FIPS 203', status: 'Standardized' },
  { name: 'ML-KEM-768', liboqs_name: 'ML-KEM-768', type: 'kem', nist_level: 3, public_key_size: 1184, secret_key_size: 2400, ciphertext_size: 1088, standard: 'FIPS 203', status: 'Standardized' },
  { name: 'ML-KEM-1024', liboqs_name: 'ML-KEM-1024', type: 'kem', nist_level: 5, public_key_size: 1568, secret_key_size: 3168, ciphertext_size: 1568, standard: 'FIPS 203', status: 'Standardized' },
];

const FALLBACK_SIGS: AlgorithmInfo[] = [
  { name: 'ML-DSA-44', liboqs_name: 'ML-DSA-44', type: 'sig', nist_level: 2, public_key_size: 1312, secret_key_size: 2528, signature_size: 2420, standard: 'FIPS 204', status: 'Standardized' },
  { name: 'ML-DSA-65', liboqs_name: 'ML-DSA-65', type: 'sig', nist_level: 3, public_key_size: 1952, secret_key_size: 4000, signature_size: 3309, standard: 'FIPS 204', status: 'Standardized' },
  { name: 'ML-DSA-87', liboqs_name: 'ML-DSA-87', type: 'sig', nist_level: 5, public_key_size: 2592, secret_key_size: 4864, signature_size: 4627, standard: 'FIPS 204', status: 'Standardized' },
  { name: 'SLH-DSA-SHA2-128f', liboqs_name: 'SLH-DSA-SHA2-128f', type: 'sig', nist_level: 1, public_key_size: 32, secret_key_size: 64, signature_size: 17088, standard: 'FIPS 205', status: 'Standardized' },
  { name: 'Falcon-512', liboqs_name: 'Falcon-512', type: 'sig', nist_level: 1, public_key_size: 897, secret_key_size: 1281, signature_size: 666, standard: 'Draft FN-DSA', status: 'Selected (Draft)' },
  { name: 'Falcon-1024', liboqs_name: 'Falcon-1024', type: 'sig', nist_level: 5, public_key_size: 1793, secret_key_size: 2305, signature_size: 1330, standard: 'Draft FN-DSA', status: 'Selected (Draft)' },
];

function AlgDescription({ alg }: { alg: AlgorithmInfo }) {
  const desc = (alg as unknown as Record<string, unknown>)['description'] as string | undefined;
  return <>{desc ?? alg.liboqs_name}</>;
}

export default function Algorithms() {
  const { data, isLoading } = useQuery({
    queryKey: ['algorithms'],
    queryFn: getAlgorithms,
  });

  const kems = data?.kems ?? FALLBACK_KEMS;
  const sigs = data?.sigs ?? FALLBACK_SIGS;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Post-Quantum Algorithms</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Supported algorithms — status and sizes sourced from the server where available.
        </p>
      </div>

      {/* KEMs */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Key Encapsulation Mechanisms (KEM)</h2>
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-secondary/50">
              <tr>
                {['Algorithm', 'NIST Level', 'Public Key', 'Secret Key', 'Ciphertext', 'Standard', 'Status', 'Description'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : kems.map((alg) => (
                <tr key={alg.name} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 font-mono font-semibold text-xs">{alg.name}</td>
                  <td className="px-4 py-3 text-center">{alg.nist_level}</td>
                  <td className="px-4 py-3 text-right">{(alg.public_key_size ?? 0).toLocaleString()} B</td>
                  <td className="px-4 py-3 text-right">{(alg.secret_key_size ?? 0).toLocaleString()} B</td>
                  <td className="px-4 py-3 text-right">{alg.ciphertext_size != null ? alg.ciphertext_size.toLocaleString() : '—'} B</td>
                  <td className="px-4 py-3 font-mono text-xs">{alg.standard}</td>
                  <td className="px-4 py-3"><StatusBadge status={alg.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs"><AlgDescription alg={alg} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Signatures */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Digital Signature Algorithms</h2>
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[750px]">
            <thead className="bg-secondary/50">
              <tr>
                {['Algorithm', 'NIST Level', 'Public Key', 'Secret Key', 'Signature', 'Standard', 'Status', 'Description'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : sigs.map((alg) => (
                <tr key={alg.name} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 font-mono font-semibold text-xs">{alg.name}</td>
                  <td className="px-4 py-3 text-center">{alg.nist_level}</td>
                  <td className="px-4 py-3 text-right">{(alg.public_key_size ?? 0).toLocaleString()} B</td>
                  <td className="px-4 py-3 text-right">{(alg.secret_key_size ?? 0).toLocaleString()} B</td>
                  <td className="px-4 py-3 text-right">{alg.signature_size != null ? alg.signature_size.toLocaleString() : '—'} B</td>
                  <td className="px-4 py-3 font-mono text-xs">{alg.standard}</td>
                  <td className="px-4 py-3"><StatusBadge status={alg.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs"><AlgDescription alg={alg} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
