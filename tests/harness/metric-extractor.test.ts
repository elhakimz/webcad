import { describe, it, expect } from 'vitest';
import { extractMetrics } from '../../src/core/harness/metric-extractor';
import { KernelResult } from '../../src/core/harness/kernel-adapter';

describe('MetricExtractor', () => {
  it('extracts all five metrics from a kernel result', () => {
    const result: KernelResult = {
      stepIndex: 0,
      stepName: 'create_box',
      shapeId: 'box_1',
      metrics: {
        volume: 1000,
        surfaceArea: 600,
        bbox: { min: [0, 0, 0], max: [10, 10, 10] },
        faceCount: 6,
        edgeCount: 12,
        vertexCount: 8,
        valid: true,
      },
      success: true,
    };
    const metrics = extractMetrics(result);
    expect(metrics.volume).toBe(1000);
    expect(metrics.surfaceArea).toBe(600);
    expect(metrics.bbox).toEqual({ min: [0, 0, 0], max: [10, 10, 10] });
    expect(metrics.faceCount).toBe(6);
    expect(metrics.edgeCount).toBe(12);
    expect(metrics.vertexCount).toBe(8);
    expect(metrics.valid).toBe(true);
  });

  it('returns partial metrics when some are missing', () => {
    const result: KernelResult = {
      stepIndex: 0,
      stepName: 'create_box',
      metrics: { volume: 1000 },
      success: true,
    };
    const metrics = extractMetrics(result);
    expect(metrics.volume).toBe(1000);
    expect(metrics.surfaceArea).toBeUndefined();
    expect(metrics.valid).toBeUndefined();
  });

  it('handles empty metrics object', () => {
    const result: KernelResult = {
      stepIndex: 0,
      stepName: 'create_box',
      metrics: {},
      success: true,
    };
    const metrics = extractMetrics(result);
    expect(metrics.volume).toBeUndefined();
    expect(metrics.valid).toBeUndefined();
  });
});
