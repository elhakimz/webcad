import { KernelMetric, ScriptTolerances } from '../harness/kernel-adapter';
import { ExpectedMetrics, MetricDiff, OraclePartEvaluation } from './types';

function relativeDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / denom;
}

function bboxMaxDelta(
  actual: { min: [number, number, number]; max: [number, number, number] },
  expected: { min: [number, number, number]; max: [number, number, number] },
): number {
  const mins = Math.max(
    Math.abs(actual.min[0] - expected.min[0]),
    Math.abs(actual.min[1] - expected.min[1]),
    Math.abs(actual.min[2] - expected.min[2]),
  );
  const maxs = Math.max(
    Math.abs(actual.max[0] - expected.max[0]),
    Math.abs(actual.max[1] - expected.max[1]),
    Math.abs(actual.max[2] - expected.max[2]),
  );
  return Math.max(mins, maxs);
}

export function evaluateMetrics(
  expected: ExpectedMetrics,
  actual: KernelMetric,
  tolerances: ScriptTolerances,
): OraclePartEvaluation {
  const diffs: Record<string, MetricDiff> = {};
  const errors: string[] = [];

  // Volume — relative diff
  if (actual.volume !== undefined) {
    const d = relativeDiff(actual.volume, expected.volume);
    const passed = d <= tolerances.volume;
    diffs.volume = {
      metric: 'volume',
      expected: expected.volume,
      actual: actual.volume,
      delta: d,
      tolerance: tolerances.volume,
      passed,
      message: passed
        ? `volume: expected ${expected.volume}, actual ${actual.volume}, delta ${d.toExponential(4)}, tolerance ${tolerances.volume} — PASSED`
        : `volume: expected ${expected.volume}, actual ${actual.volume}, delta ${d.toExponential(4)}, tolerance ${tolerances.volume} — FAILED`,
    };
    if (!passed) errors.push(diffs.volume.message!);
  } else {
    diffs.volume = {
      metric: 'volume',
      expected: expected.volume,
      actual: undefined,
      delta: Number.NaN,
      tolerance: tolerances.volume,
      passed: false,
      message: 'volume missing from kernel result',
    };
    errors.push('volume missing from kernel result');
  }

  // Surface area — relative diff
  if (actual.surfaceArea !== undefined) {
    const d = relativeDiff(actual.surfaceArea, expected.surfaceArea);
    const surfaceTol = tolerances.surfaceArea ?? tolerances.surface;
    const passed = d <= surfaceTol;
    diffs.surfaceArea = {
      metric: 'surfaceArea',
      expected: expected.surfaceArea,
      actual: actual.surfaceArea,
      delta: d,
      tolerance: tolerances.surfaceArea ?? tolerances.surface,
      passed,
      message: passed
        ? `surfaceArea: expected ${expected.surfaceArea}, actual ${actual.surfaceArea}, delta ${d.toExponential(4)}, tolerance ${tolerances.surfaceArea ?? tolerances.surface} — PASSED`
        : `surfaceArea: expected ${expected.surfaceArea}, actual ${actual.surfaceArea}, delta ${d.toExponential(4)}, tolerance ${tolerances.surfaceArea ?? tolerances.surface} — FAILED`,
    };
    if (!passed) errors.push(diffs.surfaceArea.message!);
  } else {
    diffs.surfaceArea = {
      metric: 'surfaceArea',
      expected: expected.surfaceArea,
      actual: undefined,
      delta: Number.NaN,
      tolerance: tolerances.surfaceArea ?? tolerances.surface,
      passed: false,
      message: 'surfaceArea missing from kernel result',
    };
    errors.push('surfaceArea missing from kernel result');
  }

  // Bbox — absolute per-axis max delta
  if (actual.bbox && expected.bbox) {
    const d = bboxMaxDelta(actual.bbox, expected.bbox);
    const passed = d <= tolerances.bbox;
    diffs.bbox = {
      metric: 'bbox',
      expected: expected.bbox,
      actual: actual.bbox,
      delta: d,
      tolerance: tolerances.bbox,
      passed,
      message: passed
        ? `bbox: expected ${JSON.stringify(expected.bbox)}, actual ${JSON.stringify(actual.bbox)}, delta ${d.toExponential(4)}, tolerance ${tolerances.bbox} — PASSED`
        : `bbox: expected ${JSON.stringify(expected.bbox)}, actual ${JSON.stringify(actual.bbox)}, delta ${d.toExponential(4)}, tolerance ${tolerances.bbox} — FAILED`,
    };
    if (!passed) errors.push(diffs.bbox.message!);
  } else {
    diffs.bbox = {
      metric: 'bbox',
      expected: expected.bbox,
      actual: actual.bbox ?? undefined,
      delta: Number.NaN,
      tolerance: tolerances.bbox,
      passed: false,
      message: 'bbox missing from kernel result',
    };
    errors.push('bbox missing from kernel result');
  }

  // Counts — exact match (tolerance 0)
  for (const key of ['faceCount', 'edgeCount', 'vertexCount'] as const) {
    const expVal = expected[key];
    const actVal = actual[key];
    if (actVal !== undefined) {
      const d = Math.abs(Number(actVal) - Number(expVal));
      const passed = d <= tolerances.counts;
      diffs[key] = {
        metric: key,
        expected: expVal,
        actual: actVal,
        delta: d,
        tolerance: tolerances.counts,
        passed,
        message: passed
          ? `${key}: expected ${expVal}, actual ${actVal}, delta ${d}, tolerance ${tolerances.counts} — PASSED`
          : `${key}: expected ${expVal}, actual ${actVal}, delta ${d}, tolerance ${tolerances.counts} — FAILED`,
      };
      if (!passed) errors.push(diffs[key]!.message!);
    } else {
      diffs[key] = {
        metric: key,
        expected: expVal,
        actual: undefined,
        delta: Number.NaN,
        tolerance: tolerances.counts,
        passed: false,
        message: `${key} missing from kernel result`,
      };
      errors.push(`${key} missing from kernel result`);
    }
  }

  // Validity — exact boolean match
  if (actual.valid !== undefined) {
    const passed = actual.valid === expected.isValid && actual.valid === true;
    const d = passed ? 0 : 1;
    diffs.valid = {
      metric: 'valid',
      expected: expected.isValid,
      actual: actual.valid,
      delta: d,
      tolerance: 0,
      passed,
      message: passed
        ? `valid: expected ${expected.isValid}, actual ${actual.valid}, delta ${d}, tolerance 0 — PASSED`
        : `valid: expected ${expected.isValid}, actual ${actual.valid}, delta ${d}, tolerance 0 — FAILED`,
    };
    if (!passed) errors.push(diffs.valid!.message!);
  } else {
    diffs.valid = {
      metric: 'valid',
      expected: expected.isValid,
      actual: undefined,
      delta: Number.NaN,
      tolerance: 0,
      passed: false,
      message: 'valid missing from kernel result',
    };
    errors.push('valid missing from kernel result');
  }

  const passed = errors.length === 0;
  return { partId: '', passed, diffs, errors };
}
