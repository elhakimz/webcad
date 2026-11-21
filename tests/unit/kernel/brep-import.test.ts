import { describe, it, expect } from 'vitest';
import { validateBRep } from '../../../src/core/io/brep-validation';

describe('B-rep pre-validation', () => {
  it('rejects empty B-rep', () => {
    const result = validateBRep(new Uint8Array(0));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('empty B-rep');
  });

  it('rejects oversized B-rep (> 64 MiB)', () => {
    const oversized = new Uint8Array(64 * 1024 * 1024 + 1);
    const result = validateBRep(oversized);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('B-rep too large');
  });

  it('rejects truncated B-rep (missing 0x1a terminator)', () => {
    const result = validateBRep(new Uint8Array([1, 2, 3]));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('truncated B-rep');
  });

  it('accepts valid B-rep (ends with 0x1a)', () => {
    const result = validateBRep(new Uint8Array([...Array(10).fill(0), 0x1a]));
    expect(result.valid).toBe(true);
  });

  it('accepts B-rep at exactly 64 MiB limit', () => {
    const atLimit = new Uint8Array(64 * 1024 * 1024);
    atLimit[atLimit.length - 1] = 0x1a;
    const result = validateBRep(atLimit);
    expect(result.valid).toBe(true);
  });
});
