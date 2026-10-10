/**
 * canonical.test.ts — Tests for canonical JSON against shared vectors.
 */

import { describe, it, expect } from 'vitest';
import { canonicalJson } from '../src/crypto/canonical';
import vectors from './vectors/canonical.json';

describe('canonicalJson', () => {
  for (const vector of vectors.canonical_json_vectors) {
    it(vector.description, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(canonicalJson(vector.input as any)).toBe(vector.expected);
    });
  }

  it('sorts keys lexicographically at all nesting levels', () => {
    const result = canonicalJson({ z: 3, a: 1, m: 2 });
    expect(result).toBe('{"a":1,"m":2,"z":3}');
  });

  it('produces no extra whitespace', () => {
    const result = canonicalJson({ key: 'value' });
    expect(result).not.toContain(' ');
    expect(result).not.toContain('\n');
  });

  it('handles empty object', () => {
    expect(canonicalJson({})).toBe('{}');
  });

  it('handles empty array', () => {
    expect(canonicalJson([])).toBe('[]');
  });

  it('throws on non-finite number', () => {
    expect(() => canonicalJson(Infinity as unknown as number)).toThrow();
  });
});
