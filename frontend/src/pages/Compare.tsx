/**
 * Compare.tsx — Compare two benchmark runs side by side.
 */

import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getBenchmarkRun } from '../api/benchmarks';
import { formatMs } from '../utils/format';

export default function Compare() {
  const [searchParams] = useSearchParams();
  const runIdA = searchParams.get('a');
  const runIdB = searchParams.get('b');

  const { data: runA } = useQuery({
    queryKey: ['benchmark', runIdA],
    queryFn: () => getBenchmarkRun(runIdA!),
    enabled: !!runIdA,
  });

  const { data: runB } = useQuery({
    queryKey: ['benchmark', runIdB],
    queryFn: () => getBenchmarkRun(runIdB!),
    enabled: !!runIdB,
  });

  if (!runIdA && !runIdB) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Compare Benchmark Runs</h1>
        <p className="text-muted-foreground">Select two runs to compare by navigating from the Benchmarks page.</p>
      </div>
    );
  }

  const allOps = Array.from(new Set([
    ...(runA?.results.map((r) => `${r.algorithm}::${r.operation}`) ?? []),
    ...(runB?.results.map((r) => `${r.algorithm}::${r.operation}`) ?? []),
  ]));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Compare Runs</h1>

      <div className="grid grid-cols-2 gap-4">
        {[runA, runB].map((run, i) => (
          <div key={i} className={`bg-card border border-border rounded-xl p-4 ${!run ? 'opacity-50' : ''}`}>
            <p className="text-xs text-muted-foreground mb-1">Run {i === 0 ? 'A' : 'B'}</p>
            <p className="font-mono text-sm">{run?.run_id?.slice(0, 8) ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-1 capitalize">{run?.environment ?? 'Not selected'}</p>
          </div>
        ))}
      </div>

      {runA && runB && (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Algorithm</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Operation</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Run A (mean)</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Run B (mean)</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Δ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allOps.map((key) => {
                const [alg, op] = key.split('::');
                const a = runA.results.find((r) => r.algorithm === alg && r.operation === op);
                const b = runB.results.find((r) => r.algorithm === alg && r.operation === op);
                const delta = a && b ? ((b.mean - a.mean) / a.mean) * 100 : null;
                return (
                  <tr key={key} className="hover:bg-secondary/20">
                    <td className="px-4 py-2 font-mono">{alg}</td>
                    <td className="px-4 py-2 text-muted-foreground">{op}</td>
                    <td className="px-4 py-2 text-right">{a ? formatMs(a.mean) : '—'}</td>
                    <td className="px-4 py-2 text-right">{b ? formatMs(b.mean) : '—'}</td>
                    <td className={`px-4 py-2 text-right font-medium ${delta === null ? '' : delta > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
