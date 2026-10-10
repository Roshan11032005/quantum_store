/**
 * Compare.tsx — Side-by-side benchmark run comparison.
 *
 * Features:
 *  - Pick Run A and Run B from dropdowns (no manual URL editing)
 *  - URL params ?a=&b= pre-populate the pickers
 *  - Grouped bar charts: one group per algorithm, bars for A vs B
 *  - Delta waterfall chart
 *  - Full table with winner badges
 *  - Summary win-count cards per operation category
 */

import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { getBenchmarkRun, listBenchmarkRuns, type BenchmarkRun } from '../api/benchmarks';
import { formatMs, formatDate } from '../utils/format';

const COLOR_A = '#6366f1';
const COLOR_B = '#22c55e';

function pctDelta(a: number, b: number) {
  if (a === 0) return 0;
  return ((b - a) / a) * 100;
}

function DeltaBadge({ pct }: { pct: number }) {
  const abs = Math.abs(pct).toFixed(1);
  if (Math.abs(pct) < 1) return <span className="text-muted-foreground text-xs">≈ same</span>;
  if (pct < 0) return <span className="text-xs font-semibold text-green-500">▼ {abs}% faster (B)</span>;
  return <span className="text-xs font-semibold text-red-400">▲ {abs}% slower (B)</span>;
}

function RunPicker({ label, value, onChange, runs, loading, color }: {
  label: string; value: string; onChange: (id: string) => void;
  runs: BenchmarkRun[]; loading: boolean; color: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-xs font-semibold mb-1.5" style={{ color }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="">— select a run —</option>
        {runs.map((r) => (
          <option key={r.run_id} value={r.run_id}>
            {r.run_id.slice(0, 8)} · {r.environment} · {r.created_at ? formatDate(r.created_at) : '?'}
          </option>
        ))}
      </select>
    </div>
  );
}

function CompareChart({ title, data }: { title: string; data: { algorithm: string; A?: number; B?: number }[] }) {
  if (data.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="algorithm" tick={{ fontSize: 11 }} />
          <YAxis unit=" ms" tick={{ fontSize: 11 }} width={68} />
          <Tooltip formatter={(v: number) => formatMs(v)} />
          <Legend />
          <Bar dataKey="A" fill={COLOR_A} name="Run A" radius={[3, 3, 0, 0]} />
          <Bar dataKey="B" fill={COLOR_B} name="Run B" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DeltaWaterfall({ pairs }: { pairs: { alg: string; op: string; a: number; b: number }[] }) {
  if (pairs.length === 0) return null;
  const data = pairs.map((p) => ({
    label: `${p.alg} / ${p.op}`,
    delta: parseFloat(pctDelta(p.a, p.b).toFixed(2)),
  }));
  const max = Math.max(...data.map((d) => Math.abs(d.delta)), 10);
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-1">Speed delta (B vs A)</h3>
      <p className="text-xs text-muted-foreground mb-4">
        <span className="text-green-500 font-medium">Green (negative)</span> = B is faster.&nbsp;
        <span className="text-red-400 font-medium">Red (positive)</span> = B is slower.
      </p>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 28)}>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 32, bottom: 0, left: 188 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
          <XAxis type="number" domain={[-max, max]} unit="%" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={184} />
          <ReferenceLine x={0} stroke="#6b7280" strokeWidth={1.5} />
          <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`} />
          <Bar dataKey="delta" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.delta <= 0 ? COLOR_B : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SummaryCards({ runA, runB }: { runA: BenchmarkRun; runB: BenchmarkRun }) {
  const ops = ['keygen', 'sign_32b', 'verify_32b', 'encapsulate', 'decapsulate'];
  const cards = ops.flatMap((op) => {
    const pairs = runA.results
      .filter((r) => r.operation === op)
      .flatMap((a) => {
        const b = runB.results.find((r) => r.algorithm === a.algorithm && r.operation === op);
        return b ? [{ a: a.mean, b: b.mean }] : [];
      });
    if (pairs.length === 0) return [];
    const aW = pairs.filter((p) => pctDelta(p.a, p.b) > 1).length;
    const bW = pairs.filter((p) => pctDelta(p.a, p.b) < -1).length;
    const winner = aW > bW ? 'A' : bW > aW ? 'B' : 'Tie';
    return [{ op, aW, bW, total: pairs.length, winner }];
  });
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.op} className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-2 font-mono">{c.op}</p>
          <p className="text-2xl font-bold" style={{ color: c.winner === 'A' ? COLOR_A : c.winner === 'B' ? COLOR_B : undefined }}>
            {c.winner}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {c.winner === 'Tie' ? 'No clear winner' : `wins ${c.winner === 'A' ? c.aW : c.bW}/${c.total}`}
          </p>
        </div>
      ))}
    </div>
  );
}

function CompareTable({ runA, runB }: { runA: BenchmarkRun; runB: BenchmarkRun }) {
  const keys = Array.from(new Set([
    ...runA.results.map((r) => `${r.algorithm}::${r.operation}`),
    ...runB.results.map((r) => `${r.algorithm}::${r.operation}`),
  ])).sort();
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-xs min-w-[720px]">
        <thead className="bg-secondary/50 sticky top-0">
          <tr>
            <th className="text-left px-4 py-3 text-muted-foreground font-medium">Algorithm</th>
            <th className="text-left px-4 py-3 text-muted-foreground font-medium">Operation</th>
            <th className="text-right px-4 py-3 font-semibold" style={{ color: COLOR_A }}>Run A</th>
            <th className="text-right px-4 py-3 font-semibold" style={{ color: COLOR_B }}>Run B</th>
            <th className="text-right px-4 py-3 text-muted-foreground font-medium">Δ</th>
            <th className="text-right px-4 py-3 text-muted-foreground font-medium">Winner</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {keys.map((key) => {
            const [alg, op] = key.split('::');
            const a = runA.results.find((r) => r.algorithm === alg && r.operation === op);
            const b = runB.results.find((r) => r.algorithm === alg && r.operation === op);
            const d = a && b ? pctDelta(a.mean, b.mean) : null;
            const winner = d === null ? null : Math.abs(d) < 1 ? 'tie' : d < 0 ? 'B' : 'A';
            return (
              <tr key={key} className="hover:bg-secondary/20">
                <td className="px-4 py-2 font-mono font-medium">{alg}</td>
                <td className="px-4 py-2 text-muted-foreground">{op}</td>
                <td className="px-4 py-2 text-right tabular-nums">{a ? formatMs(a.mean) : <span className="opacity-30">—</span>}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b ? formatMs(b.mean) : <span className="opacity-30">—</span>}</td>
                <td className="px-4 py-2 text-right">{d !== null ? <DeltaBadge pct={d} /> : <span className="opacity-30">—</span>}</td>
                <td className="px-4 py-2 text-right">
                  {winner === 'tie' && <span className="text-xs text-muted-foreground">Tie</span>}
                  {winner === 'A' && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: COLOR_A + '22', color: COLOR_A }}>A</span>}
                  {winner === 'B' && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: COLOR_B + '22', color: COLOR_B }}>B</span>}
                  {winner === null && <span className="opacity-30 text-xs">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [runIdA, setRunIdA] = useState(searchParams.get('a') ?? '');
  const [runIdB, setRunIdB] = useState(searchParams.get('b') ?? '');

  useEffect(() => {
    const p: Record<string, string> = {};
    if (runIdA) p.a = runIdA;
    if (runIdB) p.b = runIdB;
    setSearchParams(p, { replace: true });
  }, [runIdA, runIdB, setSearchParams]);

  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ['benchmarks'],
    queryFn: listBenchmarkRuns,
  });
  const runs = list?.runs ?? [];

  const { data: runA, isLoading: loadingA } = useQuery({
    queryKey: ['benchmark', runIdA],
    queryFn: () => getBenchmarkRun(runIdA),
    enabled: !!runIdA,
  });
  const { data: runB, isLoading: loadingB } = useQuery({
    queryKey: ['benchmark', runIdB],
    queryFn: () => getBenchmarkRun(runIdB),
    enabled: !!runIdB,
  });

  const both = runA && runB;

  function chartData(op: string) {
    const algs = Array.from(new Set([
      ...(runA?.results.filter((r) => r.operation === op).map((r) => r.algorithm) ?? []),
      ...(runB?.results.filter((r) => r.operation === op).map((r) => r.algorithm) ?? []),
    ]));
    return algs.map((alg) => ({
      algorithm: alg,
      A: runA?.results.find((r) => r.algorithm === alg && r.operation === op)?.mean,
      B: runB?.results.find((r) => r.algorithm === alg && r.operation === op)?.mean,
    })).filter((d) => d.A !== undefined || d.B !== undefined);
  }

  const deltaPairs = both
    ? runA.results.flatMap((a) => {
        const b = runB.results.find((r) => r.algorithm === a.algorithm && r.operation === a.operation);
        return b ? [{ alg: a.algorithm, op: a.operation, a: a.mean, b: b.mean }] : [];
      })
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Compare Benchmark Runs</h1>
        <p className="text-sm text-muted-foreground mt-1">Pick two runs to compare performance side-by-side.</p>
      </div>

      {!listLoading && runs.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-muted-foreground mb-4">No benchmark runs yet.</p>
          <Link to="/benchmarks/run" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
            Run First Benchmark
          </Link>
        </div>
      )}

      {runs.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Select Runs to Compare</h2>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <RunPicker label="Run A" value={runIdA} onChange={setRunIdA} runs={runs} loading={listLoading} color={COLOR_A} />
            <div className="text-muted-foreground font-bold text-xl pb-2 hidden sm:block">vs</div>
            <RunPicker label="Run B" value={runIdB} onChange={setRunIdB} runs={runs} loading={listLoading} color={COLOR_B} />
          </div>
          {(runA || runB) && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {([runA, runB] as (BenchmarkRun | undefined)[]).map((run, i) => (
                <div key={i} className={`rounded-lg border px-4 py-3 text-xs space-y-0.5 ${run ? 'border-border bg-secondary/30' : 'border-dashed border-border opacity-40'}`}>
                  <p className="font-semibold" style={{ color: i === 0 ? COLOR_A : COLOR_B }}>Run {i === 0 ? 'A' : 'B'}</p>
                  {run ? (
                    <>
                      <p className="font-mono text-muted-foreground">{run.run_id}</p>
                      <p className="capitalize text-muted-foreground">{run.environment} · {run.results.length} results</p>
                      {run.created_at && <p className="text-muted-foreground">{formatDate(run.created_at)}</p>}
                    </>
                  ) : <p className="text-muted-foreground">Not selected</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(loadingA || loadingB) && (
        <div className="flex items-center gap-3">
          <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
          <p className="text-sm text-muted-foreground">Loading run data…</p>
        </div>
      )}

      {!loadingA && !loadingB && (runIdA || runIdB) && !both && (
        <div className="border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          Select both Run A and Run B above to see the comparison.
        </div>
      )}

      {both && (
        <div className="space-y-8">
          <SummaryCards runA={runA} runB={runB} />

          {/* KEM charts */}
          {['keygen', 'encapsulate', 'decapsulate'].some((op) => chartData(op).some((d) => d.algorithm.startsWith('ML-KEM'))) && (
            <div className="space-y-4">
              <h2 className="font-semibold">KEM Operations</h2>
              {['keygen', 'encapsulate', 'decapsulate'].map((op) => {
                const d = chartData(op).filter((r) => r.algorithm.startsWith('ML-KEM'));
                return d.length > 0 ? <CompareChart key={op} title={`${op} — mean time`} data={d} /> : null;
              })}
            </div>
          )}

          {/* Sig charts */}
          {['keygen', 'sign_32b', 'verify_32b'].some((op) => chartData(op).some((d) => !d.algorithm.startsWith('ML-KEM'))) && (
            <div className="space-y-4">
              <h2 className="font-semibold">Signature Operations</h2>
              {['keygen', 'sign_32b', 'verify_32b'].map((op) => {
                const d = chartData(op).filter((r) => !r.algorithm.startsWith('ML-KEM'));
                return d.length > 0 ? <CompareChart key={op} title={`${op} — mean time`} data={d} /> : null;
              })}
            </div>
          )}

          {deltaPairs.length > 0 && <DeltaWaterfall pairs={deltaPairs} />}

          <div className="space-y-3">
            <h2 className="font-semibold">Full Results</h2>
            <CompareTable runA={runA} runB={runB} />
          </div>
        </div>
      )}
    </div>
  );
}
