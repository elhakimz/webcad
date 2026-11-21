// NOTE: OCCT STEPControl_Writer round-trip is verified at the C++/E2E level
// (tests/e2e/kernel-roundtrip.spec.ts). OCCT is not available under vitest,
// so this suite only exercises the shared pre-validation
// (src/core/io/brep-validation.ts) applied to exported STEP bytes before they
// are serialized into the gRPC response.

import { describe, it, expect } from 'vitest';
import { validateStep } from '../../../src/core/io/brep-validation';

const STEP_END = new TextEncoder().encode('END-ISO-10303-21;');

describe('STEP export pre-validation', () => {
  it('rejects empty STEP buffer', () => {
    const result = validateStep(new Uint8Array(0));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('empty STEP');
  });

  it('rejects oversized STEP buffer (> 64 MiB)', () => {
    // Export output must not exceed the per-session blob quota.
    const oversized = new Uint8Array(64 * 1024 * 1024 + 1);
    const result = validateStep(oversized);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('STEP too large');
  });

  it('rejects truncated STEP buffer (missing END-ISO-10303-21; terminator)', () => {
    // OCCT STEPControl_Writer always appends the STEP end marker; a
    // header-only buffer was truncated mid-stream.
    const truncated = new Uint8Array(
      [...new TextEncoder().encode('ISO-10303-21;'), ...STEP_END.slice(0, -1)]
    );
    const result = validateStep(truncated);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('truncated STEP');
  });

  it('accepts valid STEP buffer ending with END-ISO-10303-21;', () => {
    const exported = new Uint8Array([
      ...new TextEncoder().encode('ISO-10303-21;'),
      ...STEP_END
    ]);
    const result = validateStep(exported);
    expect(result.valid).toBe(true);
  });

  it('accepts valid STEP buffer at exactly 64 MiB limit', () => {
    const atLimit = new Uint8Array(64 * 1024 * 1024);
    // Fill with spaces, then place the STEP end marker last.
    for (let i = 0; i < atLimit.length - STEP_END.length; i++) atLimit[i] = 0x20;
    for (let i = 0; i < STEP_END.length; i++) atLimit[atLimit.length - STEP_END.length + i] = STEP_END[i];
    const result = validateStep(atLimit);
    expect(result.valid).toBe(true);
  });
});
