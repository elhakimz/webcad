import { describe, it, expect, vi } from 'vitest';
import { evaluateMetrics } from '../../src/core/oracle/oracle-evaluator';
import { OracleRunner } from '../../src/core/oracle/oracle-runner';
import { ExpectedMetrics, ReferencePart } from '../../src/core/oracle/types';
import { KernelAdapter, KernelResult, ScriptTolerances } from '../../src/core/harness/kernel-adapter';

const DEFAULT_TOLERANCES: ScriptTolerances = {
  volume: 1e-4,
  surface: 1e-4,
  bbox: 1e-3,
  counts: 0,
};

const baseExpected: ExpectedMetrics = {
  volume: 1000.0,
  surfaceArea: 600.0,
  bbox: { min: [0, 0, 0], max: [10, 10, 10] },
  faceCount: 6,
  edgeCount: 12,
  vertexCount: 8,
  isValid: true,
};

function makeMockAdapter(results: KernelResult[]): KernelAdapter {
  return {
    name: 'mock',
    init: vi.fn(),
    execute: vi.fn().mockResolvedValue(results),
    cleanup: vi.fn(),
  } as unknown as KernelAdapter;
}

function makePart(overrides: Partial<ReferencePart> = {}): ReferencePart {
  return {
    id: 'test_part',
    name: 'Test Part',
    description: 'A test part',
    script: {
      name: 'test_script',
      tolerances: DEFAULT_TOLERANCES,
      steps: [{ name: 'create_box', parameters: {} }],
    },
    expected: baseExpected,
    tolerances: DEFAULT_TOLERANCES,
    ...overrides,
  } as ReferencePart;
}

describe('evaluateMetrics', () => {
  it('passes when all metrics are within tolerance', () => {
    const actual = {
      volume: 1000.00001,
      surfaceArea: 600.00001,
      bbox: { min: [0, 0, 0], max: [10, 10, 10] },
      faceCount: 6,
      edgeCount: 12,
      vertexCount: 8,
      valid: true,
    };
    const result = evaluateMetrics(baseExpected, actual, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.diffs.volume.passed).toBe(true);
    expect(result.diffs.surfaceArea.passed).toBe(true);
    expect(result.diffs.bbox.passed).toBe(true);
    expect(result.diffs.faceCount.passed).toBe(true);
    expect(result.diffs.edgeCount.passed).toBe(true);
    expect(result.diffs.vertexCount.passed).toBe(true);
    expect(result.diffs.valid.passed).toBe(true);
  });

  it('fails volume when relative diff exceeds tolerance with clear delta message', () => {
    const actual = {
      volume: 1001.0, // relative diff ~0.001 > 1e-4
      surfaceArea: 600.0,
      bbox: { min: [0, 0, 0], max: [10, 10, 10] },
      faceCount: 6,
      edgeCount: 12,
      vertexCount: 8,
      valid: true,
    };
    const result = evaluateMetrics(baseExpected, actual, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.diffs.volume.passed).toBe(false);
    expect(result.diffs.volume.message).toContain('expected 1000');
    expect(result.diffs.volume.message).toContain('actual 1001');
    expect(result.diffs.volume.message).toContain('tolerance 0.0001');
    expect(result.diffs.volume.message).toContain('FAILED');
  });

  it('fails bbox when per-axis delta exceeds tolerance', () => {
    const actual = {
      volume: 1000.0,
      surfaceArea: 600.0,
      bbox: { min: [0, 0, 0], max: [10.001, 10, 10] }, // 0.001 > 1e-3? actually equal, use 0.002
      faceCount: 6,
      edgeCount: 12,
      vertexCount: 8,
      valid: true,
    };
    const result = evaluateMetrics(baseExpected, { ...actual, bbox: { min: [0, 0, 0], max: [10.002, 10, 10] } }, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.diffs.bbox.passed).toBe(false);
    expect(result.diffs.bbox.message).toContain('FAILED');
  });

  it('fails faceCount on exact mismatch with delta', () => {
    const actual = {
      volume: 1000.0,
      surfaceArea: 600.0,
      bbox: { min: [0, 0, 0], max: [10, 10, 10] },
      faceCount: 5,
      edgeCount: 12,
      vertexCount: 8,
      valid: true,
    };
    const result = evaluateMetrics(baseExpected, actual, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.diffs.faceCount.passed).toBe(false);
    expect(result.diffs.faceCount.delta).toBe(1);
    expect(result.diffs.faceCount.message).toContain('expected 6');
    expect(result.diffs.faceCount.message).toContain('actual 5');
  });

  it('fails valid on boolean mismatch', () => {
    const actual = {
      volume: 1000.0,
      surfaceArea: 600.0,
      bbox: { min: [0, 0, 0], max: [10, 10, 10] },
      faceCount: 6,
      edgeCount: 12,
      vertexCount: 8,
      valid: false,
    };
    const result = evaluateMetrics(baseExpected, actual, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.diffs.valid.passed).toBe(false);
    expect(result.diffs.valid.delta).toBe(1);
    expect(result.diffs.valid.message).toContain('expected true');
    expect(result.diffs.valid.message).toContain('actual false');
  });

  it('fails when volume is missing from kernel result', () => {
    const actual = {
      surfaceArea: 600.0,
      bbox: { min: [0, 0, 0], max: [10, 10, 10] },
      faceCount: 6,
      edgeCount: 12,
      vertexCount: 8,
      valid: true,
    };
    const result = evaluateMetrics(baseExpected, actual, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.diffs.volume.passed).toBe(false);
    expect(result.diffs.volume.message).toContain('missing');
  });

  it('reports NaN delta for missing metrics', () => {
    const actual = {} as KernelMetric;
    const result = evaluateMetrics(baseExpected, actual, DEFAULT_TOLERANCES);
    expect(result.passed).toBe(false);
    expect(result.diffs.volume.delta).toBe(Number.NaN);
    expect(result.diffs.valid.delta).toBe(Number.NaN);
  });
});

describe('OracleRunner', () => {
  it('loads fixtures and runs all parts through adapter', async () => {
    const kernelResult: KernelResult = {
      stepIndex: 0,
      stepName: 'create_box',
      metrics: {
        volume: 1000.0,
        surfaceArea: 600.0,
        bbox: { min: [0, 0, 0], max: [10, 10, 10] },
        faceCount: 6,
        edgeCount: 12,
        vertexCount: 8,
        valid: true,
      },
      success: true,
    };

    const adapter = makeMockAdapter([kernelResult]);
    const runner = new OracleRunner();
    const parts = [makePart()];

    const report = await runner.run(adapter, parts);

    expect(adapter.init).toHaveBeenCalled();
    expect(adapter.cleanup).toHaveBeenCalled();
    expect(adapter.execute).toHaveBeenCalledWith(parts[0].script);
    expect(report.totalParts).toBe(1);
    expect(report.passedParts).toBe(1);
    expect(report.failedParts).toBe(0);
    expect(report.results[0].partId).toBe('test_part');
    expect(report.results[0].passed).toBe(true);
  });

  it('marks part failed when kernel step errors', async () => {
    const kernelResult: KernelResult = {
      stepIndex: 0,
      stepName: 'create_box',
      metrics: {},
      success: false,
      error: 'kernel crash',
    };

    const adapter = makeMockAdapter([kernelResult]);
    const runner = new OracleRunner();
    const parts = [makePart()];

    const report = await runner.run(adapter, parts);

    expect(report.passedParts).toBe(0);
    expect(report.failedParts).toBe(1);
    expect(report.results[0].errors.length).toBeGreaterThan(0);
  });

  it('works with adapter that has no init/cleanup', async () => {
    const kernelResult: KernelResult = {
      stepIndex: 0,
      stepName: 'create_box',
      metrics: {
        volume: 1000.0,
        surfaceArea: 600.0,
        bbox: { min: [0, 0, 0], max: [10, 10, 10] },
        faceCount: 6,
        edgeCount: 12,
        vertexCount: 8,
        valid: true,
      },
      success: true,
    };

    const adapter = {
      name: 'minimal',
      execute: vi.fn().mockResolvedValue([kernelResult]),
    } as unknown as KernelAdapter;

    const runner = new OracleRunner();
    const report = await runner.run(adapter, [makePart()]);

    expect(report.passedParts).toBe(1);
    expect(report.failedParts).toBe(0);
  });
});
