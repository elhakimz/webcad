import { describe, it, expect } from 'vitest';
import { compareStepResults } from '../../src/core/harness/comparator';
import { KernelResult } from '../../src/core/harness/kernel-adapter';
import { DEFAULT_TOLERANCES } from '../../src/core/harness/kernel-adapter';

function makeResult(stepIndex: number, metrics: Record<string, unknown>): KernelResult {
  return {
    stepIndex,
    stepName: `step_${stepIndex}`,
    metrics: metrics as any,
    success: true,
  };
}

describe('Comparator', () => {
  it('passes when both results match within tolerance', () => {
    const wasm = makeResult(0, { volume: 1000, surfaceArea: 600, valid: true });
    const native = makeResult(0, { volume: 1000.00001, surfaceArea: 600.00001, valid: true });
    const result = compareStepResults(0, 'create_box', wasm, native, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when volume exceeds tolerance', () => {
    const wasm = makeResult(0, { volume: 1000 });
    const native = makeResult(0, { volume: 1001 });
    const result = compareStepResults(0, 'create_box', wasm, native, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.diffs.volume.passed).toBe(false);
  });

  it('fails when valid differs', () => {
    const wasm = makeResult(0, { valid: true });
    const native = makeResult(0, { valid: false });
    const result = compareStepResults(0, 'create_box', wasm, native, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.diffs.valid.passed).toBe(false);
  });

  it('reports missing metrics as errors', () => {
    const wasm = makeResult(0, { volume: 1000 });
    const native = makeResult(0, {});
    const result = compareStepResults(0, 'create_box', wasm, native, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles kernel errors gracefully', () => {
    const wasm = makeResult(0, { volume: 1000 });
    wasm.success = false;
    wasm.error = 'Worker crashed';
    const native = makeResult(0, { volume: 1000 });
    const result = compareStepResults(0, 'create_box', wasm, native, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('wasm error: Worker crashed');
  });
});
