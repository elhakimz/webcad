import { KernelResult, ScriptTolerances } from './kernel-adapter';

export interface ParityDiff {
  wasm: unknown;
  native: unknown;
  diff: number;
  tolerance: number;
  passed: boolean;
}

export interface ParityStepResult {
  stepIndex: number;
  stepName: string;
  passed: boolean;
  diffs: Record<string, ParityDiff>;
  errors: string[];
}

function relativeDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / denom;
}

function bboxDiff(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

export function compareStepResults(
  stepIndex: number,
  stepName: string,
  wasm: KernelResult,
  native: KernelResult,
  tolerances: ScriptTolerances,
): ParityStepResult {
  const errors: string[] = [];
  const diffs: Record<string, ParityDiff> = {};

  if (!wasm.success) errors.push(`wasm error: ${wasm.error || 'unknown'}`);
  if (!native.success) errors.push(`native error: ${native.error || 'unknown'}`);

  const wm = wasm.metrics;
  const nm = native.metrics;

  // Volume
  if (wm.volume !== undefined && nm.volume !== undefined) {
    const d = relativeDiff(wm.volume, nm.volume);
    diffs.volume = { wasm: wm.volume, native: nm.volume, diff: d, tolerance: tolerances.volume, passed: d <= tolerances.volume };
  } else if (wm.volume !== undefined || nm.volume !== undefined) {
    errors.push('volume missing from one kernel');
  }

  // Surface area
  if (wm.surfaceArea !== undefined && nm.surfaceArea !== undefined) {
    const d = relativeDiff(wm.surfaceArea, nm.surfaceArea);
    const surfaceTol = tolerances.surfaceArea ?? tolerances.surface;
    diffs.surface = { wasm: wm.surfaceArea, native: nm.surfaceArea, diff: d, tolerance: surfaceTol, passed: d <= surfaceTol };
  } else if (wm.surfaceArea !== undefined || nm.surfaceArea !== undefined) {
    errors.push('surfaceArea missing from one kernel');
  }

  // Bbox
  if (wm.bbox && nm.bbox) {
    const d = bboxDiff(wm.bbox.min, nm.bbox.min) + bboxDiff(wm.bbox.max, nm.bbox.max);
    diffs.bbox = { wasm: wm.bbox, native: nm.bbox, diff: d, tolerance: tolerances.bbox, passed: d <= tolerances.bbox };
  } else if (wm.bbox || nm.bbox) {
    errors.push('bbox missing from one kernel');
  }

  // Counts (exact match)
  for (const key of ['faceCount', 'edgeCount', 'vertexCount'] as const) {
    const w = wm[key];
    const n = nm[key];
    if (w !== undefined && n !== undefined) {
      const passed = w === n;
      diffs[key] = { wasm: w, native: n, diff: Math.abs(Number(w) - Number(n)), tolerance: tolerances.counts, passed };
      if (!passed) errors.push(`${key} mismatch: wasm=${w}, native=${n}`);
    } else if (w !== undefined || n !== undefined) {
      errors.push(`${key} missing from one kernel`);
    }
  }

  // Validity
  if (wm.valid !== undefined && nm.valid !== undefined) {
    const passed = wm.valid === nm.valid && wm.valid === true;
    diffs.valid = { wasm: wm.valid, native: nm.valid, diff: passed ? 0 : 1, tolerance: 0, passed };
    if (!passed) errors.push(`validity mismatch: wasm=${wm.valid}, native=${nm.valid}`);
  } else if (wm.valid !== undefined || nm.valid !== undefined) {
    errors.push('valid missing from one kernel');
  }

  const passed = errors.length === 0 && Object.values(diffs).every(d => d.passed);
  return { stepIndex, stepName, passed, diffs, errors };
}
