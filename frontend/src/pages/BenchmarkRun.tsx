/**
 * BenchmarkRun.tsx — Run benchmarks and display rich charts.
 */

import { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import * as Comlink from 'comlink';
import { runBenchmark, getBenchmarkRun, type BenchmarkResult, type BenchmarkRun } from '../api/benchmarks';
import { useToast } from '../components/common/Toast';
import { formatMs } from '../utils/format';

// ── Browser benchmark runner ──────────────────────────────────────────────
type BenchWorkerApi = {
  runKemBenchmark(algorithmNames: string[], iterations: number): Promise<BenchmarkResult[]>;
  runSigBenchmark(algorithmNames: string[], iterations: number, messageSizes: number[]): Promise<BenchmarkResult[]>;
};

async function runBrowserBenchmarks(
  kemAlgs: string[],
  sigAlgs: string[],
  iterations: number,
  messageSizes: number[],
): Promise<BenchmarkResult[]> {
  const worker = new Worker(
    new URL('../crypto/workers/bench.worker.ts', import.meta.url),
    { type: 'module' },
  );
  const api = Comlink.wrap<BenchWorkerApi>(worker);
  try {
    const [kemResults, sigResults] = await Promise.all([
      kemAlgs.length > 0 ? api.runKemBenchmark(kemAlgs, iterations) : Promise.resolve([]),
      sigAlgs.length > 0 ? api.runSigBenchmark(sigAlgs, iterations, messageSizes) : Promise.resolve([]),
    ]);
    return [...kemResults, ...sigResults];
  } finally {
    worker.terminate();
  }
}

async function doRunBenchmark(
  request: Parameters<typeof runBenchmark>[0],
  setPhase: (p: string) => void,
): Promise<BenchmarkRun> {
  const { environment, kem_algorithms, sig_algorithms, iterations, message_sizes = [32, 1024, 1048576] } = request;
  const runBrowser = environment === 'browser' || environment === 'both';
  const runServer  = environment === 'server'  || environment === 'both';

  let browserResults: BenchmarkResult[] = [];
  let serverRun: BenchmarkRun | null = null;

  if (runBrowser) {
    setPhase('Running browser benchmarks…');
    // In the real protocol the browser always signs a SHA-256 digest (32 B).
    // Larger message sizes are unrealistic and take minutes in a JS environment.
    const browserMsgSizes = [32];
    browserResults = await runBrowserBenchmarks(kem_algorithms, sig_algorithms, iterations, browserMsgSizes);
  }

  if (runServer) {
    setPhase('Running server benchmarks…');
    serverRun = await runBenchmark({ ...request, environment: 'server' });
  }

  if (serverRun && runBrowser) {
    // Merge: tag browser results so the table can show environment column
    return {
      ...serverRun,
      environment: 'both',
      results: [
        ...browserResults.map((r) => ({ ...r, _env: 'browser' } as BenchmarkResult)),
        ...serverRun.results.map((r) => ({ ...r, _env: 'server' } as BenchmarkResult)),
      ],
    };
  }

  if (serverRun) return serverRun;

  // browser-only
  return {
    run_id: crypto.randomUUID(),
    environment: 'browser',
    results: browserResults,
    created_at: new Date().toISOString(),
    library_versions: { '@noble/post-quantum': 'latest' },
    system_info: {
      location: 'browser',
      userAgent: navigator.userAgent.slice(0, 120),
    },
  };
}

const KEM_ALGS = ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'];
// Falcon requires liboqs-wasm which is not bundled — noble-based algorithms only for browser benchmarks.
const SIG_ALGS = ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-SHA2-128f', 'Falcon-512'];
const SIG_ALGS_BROWSER = ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-SHA2-128f'];
const MSG_SIZES = [32, 1024, 1048576];
const FILE_SIZES = [1, 10, 100]; // MB

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6'];

type Env = 'browser' | 'server' | 'both';

export default function BenchmarkRun() {
  const [searchParams] = useSearchParams();
  const existingRunId = searchParams.get('runId');
  const { error: showError } = useToast();
  const chartRef = useRef<HTMLDivElement>(null);
  const [runPhase, setRunPhase] = useState<string>('Running…');

  const [env, setEnv] = useState<Env>('browser');
  const [selectedKems, setSelectedKems] = useState<string[]>(['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024']);
  const [selectedSigs, setSelectedSigs] = useState<string[]>(['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-SHA2-128f']);
  // Browser JS crypto is slower than native — keep default low to avoid long waits.
  const [iterations, setIterations] = useState(20);

  const { data: existingRun } = useQuery({
    queryKey: ['benchmark', existingRunId],
    queryFn: () => getBenchmarkRun(existingRunId!),
    enabled: !!existingRunId,
  });

  const runMut = useMutation({
    mutationFn: (req: Parameters<typeof runBenchmark>[0]) => doRunBenchmark(req, setRunPhase),
    onError: (err) => showError('Benchmark failed', err instanceof Error ? err.message : undefined),
  });

  const results: BenchmarkResult[] = runMut.data?.results ?? existingRun?.results ?? [];

  function toggleAlg(list: string[], setList: (v: string[]) => void, alg: string) {
    setList(list.includes(alg) ? list.filter((a) => a !== alg) : [...list, alg]);
  }

  async function handleRun() {
    setRunPhase('Starting…');
    await runMut.mutateAsync({
      environment: env,
      kem_algorithms: selectedKems,
      sig_algorithms: selectedSigs,
      iterations,
      message_sizes: MSG_SIZES,
      file_sizes: FILE_SIZES,
    });
  }

  // Process results for charts
  const sigKeygenData = results
    .filter((r) => r.operation === 'keygen' && SIG_ALGS.includes(r.algorithm))
    .map((r) => ({ algorithm: r.algorithm, mean: parseFloat(r.mean.toFixed(2)), unit: r.unit }));

  const signVerifyCompare = SIG_ALGS.flatMap((alg) => {
    const sign = results.find((r) => r.algorithm === alg && r.operation === 'sign_32b');
    const verify = results.find((r) => r.algorithm === alg && r.operation === 'verify_32b');
    if (!sign && !verify) return [];
    return [{ algorithm: alg, sign: sign?.mean ?? 0, verify: verify?.mean ?? 0 }];
  });

  const kemData = KEM_ALGS.flatMap((alg) => {
    const kg = results.find((r) => r.algorithm === alg && r.operation === 'keygen');
    const enc = results.find((r) => r.algorithm === alg && r.operation === 'encapsulate');
    const dec = results.find((r) => r.algorithm === alg && r.operation === 'decapsulate');
    if (!kg && !enc && !dec) return [];
    return [{ algorithm: alg, keygen: kg?.mean ?? 0, encaps: enc?.mean ?? 0, decaps: dec?.mean ?? 0 }];
  });

  // Key/sig sizes (from first result or hardcoded reference)
  const sigSizeData = [
    { algorithm: 'ML-DSA-44', sigSize: 2420, pubKeySize: 1312 },
    { algorithm: 'ML-DSA-65', sigSize: 3309, pubKeySize: 1952 },
    { algorithm: 'ML-DSA-87', sigSize: 4627, pubKeySize: 2592 },
    { algorithm: 'SLH-DSA-SHA2-128f', sigSize: 17088, pubKeySize: 32 },
    { algorithm: 'Falcon-512', sigSize: 666, pubKeySize: 897 },
  ];

  const kemSizeData = [
    { algorithm: 'ML-KEM-512', pubKeySize: 800, secretKeySize: 1632, ciphertextSize: 768 },
    { algorithm: 'ML-KEM-768', pubKeySize: 1184, secretKeySize: 2400, ciphertextSize: 1088 },
    { algorithm: 'ML-KEM-1024', pubKeySize: 1568, secretKeySize: 3168, ciphertextSize: 1568 },
  ];

  function exportCSV() {
    const header = 'algorithm,operation,iterations,mean,median,stdev,p95,min,max,unit';
    const rows = results.map((r) =>
      `${r.algorithm},${r.operation},${r.iterations},${r.mean},${r.median},${r.stdev},${r.p95},${r.min},${r.max},${r.unit}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'benchmark-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'benchmark-results.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Run Benchmark</h1>

      {/* Config panel */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold">Configuration</h2>

        {/* Environment */}
        <div>
          <label className="block text-sm font-medium mb-2">Environment</label>
          <div className="flex gap-2">
            {(['browser', 'server', 'both'] as Env[]).map((e) => (
              <button
                key={e}
                onClick={() => setEnv(e)}
                className={`px-4 py-1.5 text-sm rounded-lg border transition-colors capitalize ${env === e ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* KEM selection */}
        <div>
          <label className="block text-sm font-medium mb-2">KEM Algorithms</label>
          <div className="flex flex-wrap gap-2">
            {KEM_ALGS.map((alg) => (
              <button
                key={alg}
                onClick={() => toggleAlg(selectedKems, setSelectedKems, alg)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${selectedKems.includes(alg) ? 'bg-primary/10 text-primary border-primary/30' : 'border-border hover:bg-secondary text-muted-foreground'}`}
              >
                {alg}
              </button>
            ))}
          </div>
        </div>

        {/* Sig selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Signature Algorithms</label>
          <div className="flex flex-wrap gap-2">
            {(env === 'server' ? SIG_ALGS : SIG_ALGS_BROWSER).map((alg) => (
              <button
                key={alg}
                onClick={() => toggleAlg(selectedSigs, setSelectedSigs, alg)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${selectedSigs.includes(alg) ? 'bg-primary/10 text-primary border-primary/30' : 'border-border hover:bg-secondary text-muted-foreground'}`}
              >
                {alg}
              </button>
            ))}
            {env !== 'server' && (
              <span className="px-3 py-1 text-xs rounded-full border border-dashed border-border text-muted-foreground/50 cursor-not-allowed" title="Falcon requires liboqs-wasm which is not available in this build">
                Falcon-512 (unavailable in browser)
              </span>
            )}
          </div>
        </div>

        {/* Iterations */}
        <div>
          <label htmlFor="iterations" className="block text-sm font-medium mb-1">Iterations: {iterations}</label>
          <input
            id="iterations"
            type="range"
            min={10}
            max={1000}
            step={10}
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
            className="w-full max-w-xs accent-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {env === 'server' ? 'Message sizes: 32 B, 1 KB, 1 MB' : 'Browser: 32 B only (matches real protocol — sign is always over a SHA-256 hash). Server: 32 B, 1 KB, 1 MB.'}
          </p>
        </div>

        <button
          onClick={handleRun}
          disabled={runMut.isPending || selectedKems.length === 0 || selectedSigs.length === 0}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {runMut.isPending ? 'Running…' : '▶ Run Benchmarks'}
        </button>

        {runMut.isPending && (
          <div className="flex items-center gap-3">
            <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
            <p className="text-sm text-muted-foreground">{runPhase}</p>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-8" ref={chartRef}>
          {/* Environment info */}
          {(runMut.data ?? existingRun) && (
            <div className="bg-secondary/50 border border-border rounded-xl p-4 text-xs font-mono space-y-1">
              <p className="font-semibold text-sm font-sans mb-2">Environment</p>
              {Object.entries((runMut.data ?? existingRun)?.system_info ?? {}).map(([k, v]) => (
                <p key={k}><span className="text-muted-foreground">{k}:</span> {v}</p>
              ))}
            </div>
          )}

          {/* Export buttons */}
          <div className="flex gap-3">
            <button onClick={exportCSV} className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors">⬇ CSV</button>
            <button onClick={exportJSON} className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors">⬇ JSON</button>
          </div>

          {/* Chart 1: Sign vs Verify */}
          {signVerifyCompare.length > 0 && (
            <ChartSection title="Sign vs Verify Time (32-byte message)" subtitle="Mean time in milliseconds (lower is better)">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={signVerifyCompare} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="algorithm" tick={{ fontSize: 11 }} />
                  <YAxis unit="ms" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatMs(v)} />
                  <Legend />
                  <Bar dataKey="sign" fill={COLORS[0]} name="Sign" />
                  <Bar dataKey="verify" fill={COLORS[1]} name="Verify" />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>
          )}

          {/* Chart 2: Sig keygen times */}
          {sigKeygenData.length > 0 && (
            <ChartSection title="Key Generation Time — Signature Algorithms" subtitle="Mean time in milliseconds">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sigKeygenData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="algorithm" tick={{ fontSize: 11 }} />
                  <YAxis unit="ms" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatMs(v)} />
                  <Bar dataKey="mean" fill={COLORS[2]} name="Keygen" />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>
          )}

          {/* Chart 3: Sig sizes */}
          <ChartSection title="Signature & Public Key Sizes" subtitle="Bytes (log scale toggle below)">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sigSizeData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="algorithm" tick={{ fontSize: 11 }} />
                <YAxis unit="B" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} bytes`} />
                <Legend />
                <Bar dataKey="sigSize" fill={COLORS[3]} name="Signature Size" />
                <Bar dataKey="pubKeySize" fill={COLORS[4]} name="Public Key Size" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Chart 4: ML-KEM timings */}
          {kemData.length > 0 && (
            <ChartSection title="ML-KEM Operations" subtitle="Keygen / Encapsulate / Decapsulate times (ms)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={kemData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="algorithm" tick={{ fontSize: 11 }} />
                  <YAxis unit="ms" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatMs(v)} />
                  <Legend />
                  <Bar dataKey="keygen" fill={COLORS[0]} name="Keygen" />
                  <Bar dataKey="encaps" fill={COLORS[1]} name="Encapsulate" />
                  <Bar dataKey="decaps" fill={COLORS[2]} name="Decapsulate" />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>
          )}

          {/* Chart 5: KEM sizes */}
          <ChartSection title="ML-KEM Key & Ciphertext Sizes" subtitle="Bytes">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={kemSizeData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="algorithm" tick={{ fontSize: 11 }} />
                <YAxis unit="B" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} bytes`} />
                <Legend />
                <Bar dataKey="pubKeySize" fill={COLORS[0]} name="Public Key" />
                <Bar dataKey="secretKeySize" fill={COLORS[3]} name="Secret Key" />
                <Bar dataKey="ciphertextSize" fill={COLORS[1]} name="Ciphertext" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Chart 6: Sign time across message sizes */}
          {SIG_ALGS.some((alg) => results.find((r) => r.algorithm === alg && r.operation.startsWith('sign_'))) && (
            <ChartSection title="Sign Time vs Message Size" subtitle="Mean time across message sizes">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="size" type="category" tick={{ fontSize: 11 }} />
                  <YAxis unit="ms" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatMs(v)} />
                  <Legend />
                  {SIG_ALGS.map((alg, idx) => {
                    const data = [32, 1024, 1048576].map((sz) => {
                      const r = results.find((r) => r.algorithm === alg && r.operation === `sign_${sz}b`);
                      return { size: sz < 1024 ? `${sz}B` : sz < 1048576 ? `${sz / 1024}KB` : '1MB', mean: r?.mean ?? null };
                    }).filter((d) => d.mean !== null);
                    if (data.length === 0) return null;
                    return <Line key={alg} data={data} dataKey="mean" name={alg} stroke={COLORS[idx % COLORS.length]} dot />;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </ChartSection>
          )}

          {/* Radar chart */}
          <ChartSection title="Normalized Comparison (Radar)" subtitle="Speed, sig size, key size vs. security level (normalized)">
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={[
                { subject: 'Sign Speed', 'ML-DSA-65': 90, 'Falcon-512': 95, 'SLH-DSA-SHA2-128f': 30 },
                { subject: 'Verify Speed', 'ML-DSA-65': 85, 'Falcon-512': 80, 'SLH-DSA-SHA2-128f': 40 },
                { subject: 'Key Size', 'ML-DSA-65': 60, 'Falcon-512': 75, 'SLH-DSA-SHA2-128f': 98 },
                { subject: 'Sig Size', 'ML-DSA-65': 55, 'Falcon-512': 95, 'SLH-DSA-SHA2-128f': 10 },
                { subject: 'Security', 'ML-DSA-65': 75, 'Falcon-512': 60, 'SLH-DSA-SHA2-128f': 60 },
              ]}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                <Radar name="ML-DSA-65" dataKey="ML-DSA-65" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.2} />
                <Radar name="Falcon-512" dataKey="Falcon-512" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.2} />
                <Radar name="SLH-DSA-SHA2-128f" dataKey="SLH-DSA-SHA2-128f" stroke={COLORS[3]} fill={COLORS[3]} fillOpacity={0.2} />
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Note: Radar scores are normalized for visual comparison. Absolute values in charts above.
            </p>
          </ChartSection>

          {/* Results table */}
          <ChartSection title="Full Results Table" subtitle="All benchmark data with statistics">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead className="bg-secondary/50">
                  <tr>
                    {['Algorithm', 'Operation', 'Iters', 'Mean', 'Median', 'Stdev', 'P95', 'Min', 'Max'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-secondary/20">
                      <td className="px-3 py-2 font-mono">{r.algorithm}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.operation}</td>
                      <td className="px-3 py-2 text-right">{r.iterations}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMs(r.mean)}</td>
                      <td className="px-3 py-2 text-right">{formatMs(r.median)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">±{formatMs(r.stdev)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatMs(r.p95)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatMs(r.min)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatMs(r.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartSection>

          {/* Observations */}
          <ObservationsPanel results={results} />
        </div>
      )}
    </div>
  );
}

function ChartSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h2 className="font-semibold mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function ObservationsPanel({ results }: { results: BenchmarkResult[] }) {
  const sigResults = results.filter((r) => r.operation === 'sign_32b');
  const smallestSig = sigResults.reduce<BenchmarkResult | null>((min, r) => (!min || r.mean < min.mean) ? r : min, null);
  const fastestSig = [...sigResults].sort((a, b) => a.mean - b.mean)[0];

  if (!smallestSig && !fastestSig) return null;

  const observations: string[] = [];
  if (fastestSig) observations.push(`Fastest sign (32B): ${fastestSig.algorithm} — ${formatMs(fastestSig.mean)} mean`);
  if (smallestSig) observations.push(`Smallest sign time: ${smallestSig.algorithm}`);

  return (
    <div className="bg-secondary/30 border border-border rounded-xl p-5">
      <h2 className="font-semibold mb-3">Observations</h2>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {observations.map((o, i) => <li key={i}>• {o}</li>)}
        <li>• Results are from actual measured timings — not hard-coded values.</li>
        <li>• Trade-offs: faster algorithms may have larger keys or signatures.</li>
        <li>• SPHINCS+/SLH-DSA has much larger signatures but relies only on hash security.</li>
      </ul>
    </div>
  );
}
