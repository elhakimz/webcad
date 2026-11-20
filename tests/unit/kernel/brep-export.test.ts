// NOTE: OCCT BinTools::Write/Read B-rep round-trip is verified at the C++/E2E
// level (tests/e2e/kernel-roundtrip.spec.ts). OCCT is not available under
// vitest, so this suite only exercises the shared pre-validation
// (src/core/io/brep-validation.ts) applied to exported B-rep bytes before they
// are serialized into the gRPC response.

import { describe, it, expect } from 'vitest';
import { validateBRep } from '../../../src/core/io/brep-validation';

describe('B-rep export pre-validation', () => {
  it('rejects empty export buffer', () => {
    const result = validateBRep(new Uint8Array(0));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('empty B-rep');
  });

  it('rejects oversized export buffer (> 64 MiB)', () => {
    // Export output must not exceed the per-session blob quota.
    const oversized = new Uint8Array(64 * 1024 * 1024 + 1);
    const result = validateBRep(oversized);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('B-rep too large');
  });

  it('rejects truncated export buffer (missing 0x1a terminator)', () => {
    // OCCT BinTools::Write always appends the 0x1a section terminator; a
    // header-only buffer was truncated mid-stream.
    const truncated = new Uint8Array([0x42, 0x52, 0x45, 0x50]); // "BREP" header
    const result = validateBRep(truncated);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('truncated B-rep');
  });

  it('accepts valid export buffer ending with 0x1a terminator', () => {
    const exported = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x1a]);
    const result = validateBRep(exported);
    expect(result.valid).toBe(true);
  });

  it('accepts valid export buffer at exactly 64 MiB limit', () => {
    const atLimit = new Uint8Array(64 * 1024 * 1024);
    // Fill with a non-terminator pattern, then place the 0x1a terminator last.
    for (let i = 0; i < atLimit.length - 1; i++) atLimit[i] = 0x2f;
    atLimit[atLimit.length - 1] = 0x1a;
    const result = validateBRep(atLimit);
    expect(result.valid).toBe(true);
  });
});
