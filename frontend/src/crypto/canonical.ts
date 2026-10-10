/**
 * canonical.ts — Canonical JSON serialization.
 *
 * MUST produce byte-identical output to backend/app/core/canonical.py.
 * Rules:
 *  - Keys sorted lexicographically (Unicode code-point order)
 *  - No extra whitespace
 *  - Strings encoded as UTF-8 JSON strings (no escaping beyond JSON spec)
 *  - Numbers: integers as-is; floats use shortest representation
 *  - null, true, false as-is
 *  - Arrays preserve order
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
// Also accept records with unknown values for protocol metadata
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export function canonicalJson(value: Json): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!isFinite(value)) throw new Error('Non-finite number cannot be serialized');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k]));
    return '{' + pairs.join(',') + '}';
  }
  throw new Error(`Unsupported type: ${typeof value}`);
}

/** Encode canonical JSON to UTF-8 bytes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function canonicalJsonBytes(value: Json | AnyRecord): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value as Json));
}
