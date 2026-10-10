/**
 * benchmarks.ts — Benchmark API calls (server-side benchmark execution).
 */

import api from './client';

export interface BenchmarkRequest {
  environment: 'server' | 'browser' | 'both';
  kem_algorithms: string[];
  sig_algorithms: string[];
  iterations: number;
  message_sizes: number[];
  file_sizes?: number[];
}

export interface BenchmarkResult {
  algorithm: string;
  operation: string;
  iterations: number;
  mean: number;
  median: number;
  stdev: number;
  p95: number;
  min: number;
  max: number;
  unit: string;
  input_size_bytes?: number;
  public_key_bytes?: number | null;
  secret_key_bytes?: number | null;
  ciphertext_or_signature_bytes?: number | null;
}

export interface BenchmarkRun {
  run_id: string;
  environment: string;
  results: BenchmarkResult[];
  created_at: string;
  library_versions: Record<string, string>;
  system_info: Record<string, string>;
}

export interface BenchmarkListResponse {
  runs: BenchmarkRun[];
  total: number;
}

function normaliseRun(raw: Record<string, unknown>): BenchmarkRun {
  const rawResults = (raw['results'] as Array<Record<string, unknown>>) ?? [];
  const results: BenchmarkResult[] = rawResults.map((r) => ({
    algorithm: r['algorithm'] as string,
    operation: r['operation'] as string,
    iterations: r['iterations'] as number,
    mean: r['mean_ms'] as number,
    median: r['median_ms'] as number,
    stdev: r['stdev_ms'] as number,
    p95: r['p95_ms'] as number,
    min: r['min_ms'] as number,
    max: r['max_ms'] as number,
    unit: 'ms',
    public_key_bytes: r['public_key_bytes'] as number | null,
    secret_key_bytes: r['secret_key_bytes'] as number | null,
    ciphertext_or_signature_bytes: r['ciphertext_or_signature_bytes'] as number | null,
    input_size_bytes: r['input_size_bytes'] as number,
  }));
  const envRaw = raw['environment'];
  const envLocation = typeof envRaw === 'object' && envRaw !== null
    ? ((envRaw as Record<string, unknown>)['location'] as string) ?? 'server'
    : (envRaw as string) ?? 'server';
  return {
    run_id: (raw['id'] as string) ?? (raw['run_id'] as string),
    environment: envLocation,
    results,
    created_at: (raw['started_at'] as string) ?? (raw['created_at'] as string) ?? '',
    library_versions: {},
    system_info: Object.fromEntries(
      Object.entries((typeof envRaw === 'object' && envRaw !== null ? envRaw : {}) as Record<string, unknown>)
        .map(([k, v]) => [k, String(v)])
    ),
  };
}

export async function runBenchmark(request: BenchmarkRequest): Promise<BenchmarkRun> {
  const raw = await api.post<Record<string, unknown>>('/benchmarks/run', { json: request });
  return normaliseRun(raw);
}

export async function listBenchmarkRuns(): Promise<BenchmarkListResponse> {
  const runs = await api.get<Array<Record<string, unknown>>>('/benchmarks/runs');
  // Backend returns {id, status, started_at, finished_at, created_by}
  // Normalise to the BenchmarkRun shape used by the UI
  const normalised = runs.map((r) => ({
    run_id: r['id'] as string,
    environment: (r['environment'] as Record<string, unknown>)?.location as string ?? 'server',
    results: [],
    created_at: (r['started_at'] as string) ?? '',
    library_versions: {},
    system_info: { status: r['status'] as string ?? '' },
  })) as BenchmarkRun[];
  return { runs: normalised, total: normalised.length };
}

export async function getBenchmarkRun(runId: string): Promise<BenchmarkRun> {
  const raw = await api.get<Record<string, unknown>>(`/benchmarks/runs/${runId}`);
  return normaliseRun(raw);
}
