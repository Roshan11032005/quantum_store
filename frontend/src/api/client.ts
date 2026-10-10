/**
 * client.ts — Fetch wrapper with JWT (in-memory) handling.
 * JWT is NEVER stored in localStorage or sessionStorage.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// In-memory token store (not exported — only used via this module)
let _accessToken: string | null = null;

export function setToken(token: string | null): void {
  _accessToken = token;
}

export function getToken(): string | null {
  return _accessToken;
}

export function clearToken(): void {
  _accessToken = null;
}

interface RequestOptions extends RequestInit {
  json?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const resolvedBase = API_BASE.startsWith('/') ? `${window.location.origin}${API_BASE}` : API_BASE;
  const url = new URL(path.startsWith('http') ? path : `${resolvedBase}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function request<T = unknown>(
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { json, params, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {};
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }

  const res = await fetch(buildUrl(path, params), {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    ...rest,
  });

  if (!res.ok) {
    let code = 'SERVER_ERROR';
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      code = err.code ?? err.error ?? code;
      message = err.message ?? err.detail ?? message;
    } catch { /* ignore */ }
    throw new ApiError(res.status, code, message);
  }

  // Return null for 204 No Content
  if (res.status === 204) return null as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res.arrayBuffer() as unknown as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
  put: <T>(path: string, options?: RequestOptions) => request<T>('PUT', path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};

export default api;
