/**
 * encoding.test.ts — Tests for encoding utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  toBase64Url, fromBase64Url, toHex, fromHex, concat, uint32BE, randomBytes, timingSafeEqual,
} from '../src/crypto/encoding';

describe('base64url roundtrip', () => {
  it('encodes and decodes correctly', () => {
    const original = new Uint8Array([0, 1, 2, 127, 128, 255]);
    expect(fromBase64Url(toBase64Url(original))).toEqual(original);
  });

  it('produces no padding characters', () => {
    const b = new Uint8Array(10);
    crypto.getRandomValues(b);
    expect(toBase64Url(b)).not.toContain('=');
  });

  it('replaces + with - and / with _', () => {
    // Create bytes that produce + or / in standard base64
    const b = new Uint8Array([0xfb, 0xff]);
    const encoded = toBase64Url(b);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
});

describe('hex roundtrip', () => {
  it('encodes and decodes correctly', () => {
    const original = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(fromHex(toHex(original))).toEqual(original);
  });

  it('produces lowercase hex', () => {
    expect(toHex(new Uint8Array([0xAB]))).toBe('ab');
  });
});

describe('concat', () => {
  it('concatenates arrays', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    expect(concat(a, b)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('handles empty arrays', () => {
    expect(concat()).toEqual(new Uint8Array(0));
  });
});

describe('uint32BE', () => {
  it('encodes 0', () => {
    expect(uint32BE(0)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('encodes 256', () => {
    expect(uint32BE(256)).toEqual(new Uint8Array([0, 0, 1, 0]));
  });

  it('encodes 0xDEADBEEF', () => {
    expect(uint32BE(0xDEADBEEF)).toEqual(new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]));
  });
});

describe('randomBytes', () => {
  it('returns the requested number of bytes', () => {
    expect(randomBytes(16).length).toBe(16);
    expect(randomBytes(32).length).toBe(32);
  });

  it('returns different values each call', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    // Should be different with overwhelming probability
    expect(a).not.toEqual(b);
  });
});

describe('timingSafeEqual', () => {
  it('returns true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(timingSafeEqual(a, b)).toBe(true);
  });

  it('returns false for unequal arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
