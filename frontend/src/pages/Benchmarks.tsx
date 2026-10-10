/**
 * Benchmarks.tsx — Benchmark results overview.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listBenchmarkRuns } from '../api/benchmarks';
import { formatDate } from '../utils/format';

export default function Benchmarks() {
  const { data, isLoading } = useQuery({
    queryKey: ['benchmarks'],
    queryFn: listBenchmarkRuns,
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Performance Benchmarks</h1>
          <p className="text-sm text-muted-foreground mt-1">Compare ML-KEM, ML-DSA, Falcon, and SLH-DSA.</p>
        </div>
        <Link
          to="/benchmarks/run"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          + Run New Benchmark
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />)}
        </div>
      ) : data?.runs.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-muted-foreground mb-4">No benchmark runs yet.</p>
          <Link to="/benchmarks/run" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            Run First Benchmark
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.runs.map((run) => (
            <div key={run.run_id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded-full font-mono">{(run.run_id ?? '').slice(0, 8)}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize">{run.environment ?? 'server'}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{run.created_at ? formatDate(run.created_at) : '—'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{run.results?.length ?? 0} benchmark results</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/benchmarks/run?runId=${run.run_id}`}
                    className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors"
                  >
                    View Results
                  </Link>
                  <Link
                    to={`/compare?a=${run.run_id}`}
                    className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors"
                  >
                    Compare
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
