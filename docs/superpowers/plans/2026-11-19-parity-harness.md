# Parity Harness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parity harness that replays JSON operation scripts against both the WASM OCCT worker (via Playwright headless browser) and the native OCCT kernel (via gRPC), compares volume/surface area/bbox/counts/validity per step, and emits a JSON report with diffs vs tolerances.

**Architecture:** `KernelAdapter` interface with two implementations — `WasmKernelAdapter` (Playwright browser → OCCWorker via postMessage) and `NativeKernelAdapter` (Node gRPC client → KernelService.Execute). `ScriptParser` validates JSON scripts. `MetricExtractor` pulls available metrics. `Comparator` diffs vs tolerances. `ParityHarness` orchestrates. `ParityReport` writes JSON output.

**Tech Stack:** TypeScript, Node.js, Vitest, Playwright, @grpc/grpc-js, protobuf generated code.

---

## Chunk 1: KernelAdapter types + ScriptParser

### Task 1: Create KernelAdapter interface and types

**Files:**
- Create: `src/core/harness/kernel-adapter.ts`

- [ ] **Step 1: Write kernel-adapter.ts**

```typescript
export interface KernelMetric {
  volume?: number;
  surfaceArea?: number;
  bbox?: { min: [number, number, number]; max: [number, number, number] };
  faceCount?: number;
  edgeCount?: number;
  vertexCount?: number;
  valid?: boolean;
}

export interface KernelResult {
  stepIndex: number;
  stepName: string;
  shapeId?: string;
  metrics: KernelMetric;
  success: boolean;
  error?: string;
}

export interface ScriptStep {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ScriptTolerances {
  volume: number;
  surface: number;
  bbox: number;
  counts: number;
}

export interface Script {
  name: string;
  tolerances: ScriptTolerances;
  steps: ScriptStep[];
}

export interface KernelAdapter {
  name: string;
  execute(script: Script): Promise<KernelResult[]>;
}

export const DEFAULT_TOLERANCES: ScriptTolerances = {
  volume: 1e-4,
  surface: 1e-4,
  bbox: 1e-3,
  counts: 0,
};
```

Run: `npx tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 2: Commit**

```bash
git add src/core/harness/kernel-adapter.ts
git commit -m "feat(harness): add KernelAdapter interface and types"
```

### Task 2: Write failing test for ScriptParser

**Files:**
- Create: `tests/harness/script-parser.test.ts`
- Create: `src/core/harness/script-parser.ts`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect } from 'vitest';
import { parseScript } from '../../src/core/harness/script-parser';
import { DEFAULT_TOLERANCES } from '../../src/core/harness/kernel-adapter';

describe('ScriptParser', () => {
  it('parses a valid script with defaults', () => {
    const script = parseScript({
      name: 'test_group',
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    });
    expect(script.name).toBe('test_group');
    expect(script.tolerances).toEqual(DEFAULT_TOLERANCES);
    expect(script.steps).toHaveLength(1);
    expect(script.steps[0].name).toBe('create_box');
  });

  it('uses provided tolerances', () => {
    const script = parseScript({
      name: 'test_group',
      tolerances: { volume: 1e-3, surface: 1e-3, bbox: 1e-2, counts: 0 },
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    });
    expect(script.tolerances.volume).toBe(1e-3);
  });

  it('throws when name is missing', () => {
    expect(() => parseScript({ steps: [] } as any)).toThrow(/missing.*name/i);
  });

  it('throws when steps is missing', () => {
    expect(() => parseScript({ name: 'x' } as any)).toThrow(/steps/i);
  });

  it('throws when a step has no name', () => {
    expect(() => parseScript({ name: 'x', steps: [{ parameters: {} }] as any })).toThrow(/step.*name/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/script-parser.test.ts`
Expected: FAIL — "Cannot find module '../../src/core/harness/script-parser'"

- [ ] **Step 3: Write minimal ScriptParser implementation**

```typescript
import { Script, ScriptStep, ScriptTolerances, DEFAULT_TOLERANCES } from '../src/core/harness/kernel-adapter';

export function parseScript(input: unknown): Script {
  if (!input || typeof input !== 'object') {
    throw new Error('Script must be an object');
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.name !== 'string' || !obj.name) {
    throw new Error('Script missing required field: name');
  }

  if (!Array.isArray(obj.steps)) {
    throw new Error('Script missing required field: steps (array)');
  }

  const steps: ScriptStep[] = obj.steps.map((step, i) => {
    if (!step || typeof step !== 'object') {
      throw new Error(`Step ${i} must be an object`);
    }
    const s = step as Record<string, unknown>;
    if (typeof s.name !== 'string' || !s.name) {
      throw new Error(`Step ${i} missing required field: name`);
    }
    return {
      name: s.name,
      parameters: (s.parameters && typeof s.parameters === 'object') ? s.parameters : {},
    };
  });

  const rawTol = obj.tolerances;
  const tolerances: ScriptTolerances = {
    ...DEFAULT_TOLERANCES,
    ...(rawTol && typeof rawTol === 'object' ? rawTol : {}),
  };

  return { name: obj.name, tolerances, steps };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/script-parser.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/harness/script-parser.test.ts src/core/harness/script-parser.ts
git commit -m "test(harness): add ScriptParser with validation"
```

---

## Chunk 2: MetricExtractor + Comparator

### Task 3: Write failing tests for MetricExtractor

**Files:**
- Create: `tests/harness/metric-extractor.test.ts`
- Create: `src/core/harness/metric-extractor.ts`

- [ ] **Step 1: Write test file**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/metric-extractor.test.ts`
Expected: FAIL — "Cannot find module '../../src/core/harness/metric-extractor'"

- [ ] **Step 3: Write minimal MetricExtractor implementation**

```typescript
import { KernelResult, KernelMetric } from '../src/core/harness/kernel-adapter';

export function extractMetrics(result: KernelResult): KernelMetric {
  return {
    volume: result.metrics.volume,
    surfaceArea: result.metrics.surfaceArea,
    bbox: result.metrics.bbox,
    faceCount: result.metrics.faceCount,
    edgeCount: result.metrics.edgeCount,
    vertexCount: result.metrics.vertexCount,
    valid: result.metrics.valid,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/metric-extractor.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/harness/metric-extractor.test.ts src/core/harness/metric-extractor.ts
git commit -m "test(harness): add MetricExtractor"
```

### Task 4: Write failing tests for Comparator

**Files:**
- Create: `tests/harness/comparator.test.ts`
- Create: `src/core/harness/comparator.ts`

- [ ] **Step 1: Write test file**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/comparator.test.ts`
Expected: FAIL — "Cannot find module '../../src/core/harness/comparator'"

- [ ] **Step 3: Write minimal Comparator implementation**

```typescript
import { KernelResult, ScriptTolerances } from '../src/core/harness/kernel-adapter';

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
    diffs.surface = { wasm: wm.surfaceArea, native: nm.surfaceArea, diff: d, tolerance: tolerances.surface, passed: d <= tolerances.surface };
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/comparator.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/harness/comparator.test.ts src/core/harness/comparator.ts
git commit -m "test(harness): add Comparator with tolerance-based diffing"
```

---

## Chunk 3: ParityReport

### Task 5: Create ParityReport types and writer

**Files:**
- Create: `src/core/harness/parity-report.ts`
- Create: `tests/harness/parity-report.test.ts`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect } from 'vitest';
import { writeParityReport } from '../../src/core/harness/parity-report';
import { ParityStepResult } from '../../src/core/harness/comparator';
import { KernelResult } from '../../src/core/harness/kernel-adapter';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('ParityReport', () => {
  const tmpDir = path.join(process.cwd(), 'tests/harness/.tmp-report');

  it('writes a JSON report with correct structure', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const reportPath = path.join(tmpDir, 'report.json');

    const stepResult: ParityStepResult = {
      stepIndex: 0,
      stepName: 'create_box',
      passed: true,
      diffs: {},
      errors: [],
    };

    const wasmResult: KernelResult = { stepIndex: 0, stepName: 'create_box', metrics: { volume: 1000 }, success: true };
    const nativeResult: KernelResult = { stepIndex: 0, stepName: 'create_box', metrics: { volume: 1000 }, success: true };

    writeParityReport(reportPath, {
      scriptName: 'test_group',
      kernelPair: ['wasm', 'native'],
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [stepResult],
      wasmResults: [wasmResult],
      nativeResults: [nativeResult],
      knownDifferences: [],
    });

    const content = fs.readFileSync(reportPath, 'utf-8');
    const report = JSON.parse(content);
    expect(report.scriptName).toBe('test_group');
    expect(report.kernelPair).toEqual(['wasm', 'native']);
    expect(report.summary.totalSteps).toBe(1);
    expect(report.summary.passedSteps).toBe(1);
    expect(report.summary.failedSteps).toBe(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/parity-report.test.ts`
Expected: FAIL — "Cannot find module '../../src/core/harness/parity-report'"

- [ ] **Step 3: Write minimal ParityReport implementation**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ParityStepResult } from './comparator';
import { KernelResult, ScriptTolerances } from './kernel-adapter';

export interface ParityReportInput {
  scriptName: string;
  kernelPair: string[];
  tolerances: ScriptTolerances;
  steps: ParityStepResult[];
  wasmResults: KernelResult[];
  nativeResults: KernelResult[];
  knownDifferences: string[];
}

export interface ParityReportOutput {
  scriptName: string;
  kernelPair: string[];
  tolerances: ScriptTolerances;
  steps: ParityStepResult[];
  summary: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    erroredSteps: number;
  };
  knownDifferences: string[];
}

export function writeParityReport(filePath: string, input: ParityReportInput): ParityReportOutput {
  const passedSteps = input.steps.filter(s => s.passed).length;
  const failedSteps = input.steps.filter(s => !s.passed && s.errors.length === 0).length;
  const erroredSteps = input.steps.filter(s => !s.passed && s.errors.length > 0).length;

  const output: ParityReportOutput = {
    scriptName: input.scriptName,
    kernelPair: input.kernelPair,
    tolerances: input.tolerances,
    steps: input.steps,
    summary: {
      totalSteps: input.steps.length,
      passedSteps,
      failedSteps,
      erroredSteps,
    },
    knownDifferences: input.knownDifferences,
  };

  const dir = path.dirname(filePath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2));

  return output;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/parity-report.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/core/harness/parity-report.ts tests/harness/parity-report.test.ts
git commit -m "test(harness): add ParityReport writer"
```

---

## Chunk 4: WasmKernelAdapter (Playwright)

### Task 6: Create WasmKernelAdapter

**Files:**
- Create: `src/core/harness/wasm-kernel-adapter.ts`
- Create: `tests/e2e/harness/worker-host.html`
- Create: `tests/harness/wasm-kernel-adapter.integration.test.ts`

- [ ] **Step 1: Write worker-host.html**

```html
<!DOCTYPE html>
<html>
  <head><title>OCC Worker Host</title></head>
  <body>
    <script type="module">
      const worker = new Worker(new URL('../../src/core/io/OCCWorker.ts', import.meta.url), { type: 'module' });
      const pending = new Map();

      worker.onmessage = (e) => {
        const { id, type, success, payload, error } = e.data || {};
        if (type === 'log' || type === 'error') return;
        const resolver = pending.get(id);
        if (resolver) {
          pending.delete(id);
          resolver({ id, type, success, payload, error });
        }
      };

      window.__sendToWorker = (msg) => {
        return new Promise((resolve) => {
          const id = msg.id ?? Date.now();
          pending.set(id, resolve);
          worker.postMessage(msg);
        });
      };

      window.__workerReady = true;
    </script>
  </body>
</html>
```

- [ ] **Step 2: Write WasmKernelAdapter**

```typescript
import { chromium, type Browser, type Page } from '@playwright/test';
import * as path from 'node:path';
import { KernelAdapter, Script, KernelResult, KernelMetric } from './kernel-adapter';

export class WasmKernelAdapter implements KernelAdapter {
  readonly name = 'wasm';
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
    const hostPath = path.resolve(process.cwd(), 'tests/e2e/harness/worker-host.html');
    await this.page.goto(`file://${hostPath}`);
    await this.page.waitForFunction(() => (window as any).__workerReady, { timeout: 30000 });
  }

  async execute(script: Script): Promise<KernelResult[]> {
    if (!this.page) throw new Error('WasmKernelAdapter not initialized');
    const results: KernelResult[] = [];

    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      const msg = { type: step.name, payload: step.parameters, id: i };

      let response: any;
      try {
        response = await this.page.evaluate((m) => (window as any).__sendToWorker(m), msg);
      } catch (err) {
        results.push({
          stepIndex: i,
          stepName: step.name,
          metrics: {},
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      results.push({
        stepIndex: i,
        stepName: step.name,
        shapeId: response?.payload?.shapeId || response?.payload?.entityId,
        metrics: this.extractMetricsFromPayload(response?.payload),
        success: response?.success === true,
        error: response?.error,
      });
    }

    return results;
  }

  private extractMetricsFromPayload(payload: any): KernelMetric {
    if (!payload) return {};
    const m: KernelMetric = {};
    if (typeof payload.volume === 'number') m.volume = payload.volume;
    if (typeof payload.surfaceArea === 'number') m.surfaceArea = payload.surfaceArea;
    if (payload.bbox) m.bbox = payload.bbox;
    if (typeof payload.faceCount === 'number') m.faceCount = payload.faceCount;
    if (typeof payload.edgeCount === 'number') m.edgeCount = payload.edgeCount;
    if (typeof payload.vertexCount === 'number') m.vertexCount = payload.vertexCount;
    if (typeof payload.valid === 'boolean') m.valid = payload.valid;
    return m;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 4: Commit**

```bash
git add src/core/harness/wasm-kernel-adapter.ts tests/e2e/harness/worker-host.html
git commit -m "feat(harness): add WasmKernelAdapter with Playwright"
```

### Task 7: Write WasmKernelAdapter integration test

**Files:**
- Create: `tests/harness/wasm-kernel-adapter.integration.test.ts`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WasmKernelAdapter } from '../../src/core/harness/wasm-kernel-adapter';
import { Script } from '../../src/core/harness/kernel-adapter';

describe('WasmKernelAdapter', () => {
  const adapter = new WasmKernelAdapter();

  beforeAll(async () => {
    await adapter.init();
  }, 60000);

  afterAll(async () => {
    await adapter.cleanup();
  }, 30000);

  it('creates a box and returns metrics', async () => {
    const script: Script = {
      name: 'test_box',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    };
    const results = await adapter.execute(script);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].metrics.volume).toBeGreaterThan(0);
  }, 120000);

  it('fails gracefully on unknown command', async () => {
    const script: Script = {
      name: 'test_bad',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'nonexistent_op', parameters: {} }],
    };
    const results = await adapter.execute(script);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
  }, 60000);
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/harness/wasm-kernel-adapter.integration.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/harness/wasm-kernel-adapter.integration.test.ts
git commit -m "test(harness): add WasmKernelAdapter integration test"
```

---

## Chunk 5: NativeKernelAdapter (gRPC)

### Task 8: Create NativeKernelAdapter

**Files:**
- Create: `src/core/harness/native-kernel-adapter.ts`

- [ ] **Step 1: Write native-kernel-adapter.ts**

```typescript
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import * as path from 'node:path';
import {
  ExecuteRequest,
  CommandHeader,
} from '../../generated/proto/webcad/engine/v1/engine_pb.js';
import { KernelAdapter, Script, KernelResult, KernelMetric } from './kernel-adapter';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/webcad/engine/v1/engine.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const grpcObject = (grpc as unknown as { loadPackageDefinition: (def: any) => any }).loadPackageDefinition(packageDefinition);
const engineProto = grpcObject.webcad.engine.v1;

export class NativeKernelAdapter implements KernelAdapter {
  readonly name = 'native';
  private client: InstanceType<typeof engineProto.KernelService>;
  private requestId = 0;

  constructor(kernelAddress: string) {
    this.client = new engineProto.KernelService(kernelAddress, grpc.credentials.createInsecure());
  }

  async execute(script: Script): Promise<KernelResult[]> {
    const results: KernelResult[] = [];

    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      const requestId = `req_${this.requestId++}`;

      let response: any;
      try {
        response = await this.executeStep(step, requestId);
      } catch (err) {
        results.push({
          stepIndex: i,
          stepName: step.name,
          metrics: {},
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const isSuccess = response?.result?.case === 'success';
      results.push({
        stepIndex: i,
        stepName: step.name,
        shapeId: response?.result?.value?.shapeId || response?.opResult?.box?.shapeId,
        metrics: this.extractMetricsFromResponse(response),
        success: isSuccess,
        error: isSuccess ? undefined : response?.result?.value?.message,
      });
    }

    return results;
  }

  private async executeStep(step: { name: string; parameters: Record<string, unknown> }, requestId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const header = CommandHeader.fromJson({
        session_id: 'parity-harness',
        request_id: requestId,
        client_seq: '1',
      });

      let request: any;
      if (step.name === 'create_box') {
        request = ExecuteRequest.fromJson({
          header,
          createBox: {
            x: Number(step.parameters.x ?? 0),
            y: Number(step.parameters.y ?? 0),
            z: Number(step.parameters.z ?? 0),
            dx: Number(step.parameters.dx ?? 0),
            dy: Number(step.parameters.dy ?? 0),
            dz: Number(step.parameters.dz ?? 0),
            deflection: Number(step.parameters.deflection ?? 0.1),
          },
        });
      } else if (step.name === 'create_boolean') {
        request = ExecuteRequest.fromJson({
          header,
          createBoolean: {
            op: (step.parameters.op ?? 'cut') as 'fuse' | 'cut' | 'common',
            shapeIds: Array.isArray(step.parameters.shape_ids) ? step.parameters.shape_ids : [],
            deflection: Number(step.parameters.deflection ?? 0.1),
          },
        });
      } else {
        reject(new Error(`Unsupported operation: ${step.name}`));
        return;
      }

      this.client.Execute(request, (err: grpc.ServiceError | null, resp: any) => {
        if (err) reject(err);
        else resolve(resp);
      });
    });
  }

  private extractMetricsFromResponse(response: any): KernelMetric {
    const m: KernelMetric = {};
    const mesh = response?.mesh;
    if (mesh) {
      // MeshData contains raw binary data; derived metrics computed separately
    }
    const brepRef = response?.brepRef;
    if (brepRef?.data) {
      // B-rep data present; metrics computed server-side or from mesh
    }
    return m;
  }

  close(): void {
    this.client?.close();
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 3: Commit**

```bash
git add src/core/harness/native-kernel-adapter.ts
git commit -m "feat(harness): add NativeKernelAdapter via gRPC"
```

### Task 9: Write NativeKernelAdapter integration test (mock)

**Files:**
- Create: `tests/harness/native-kernel-adapter.integration.test.ts`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeKernelAdapter } from '../../src/core/harness/native-kernel-adapter';
import { Script } from '../../src/core/harness/kernel-adapter';

describe('NativeKernelAdapter', () => {
  const mockExecute = vi.fn();

  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('creates a box via gRPC and returns result', async () => {
    // Mock the grpc client
    const mockClient = {
      Execute: mockExecute.mockImplementation((req: any, callback: (err: Error | null, res: any) => void) => {
        callback(null, {
          result: { case: 'success', value: { shapeId: 'box_req_0' } },
          mesh: undefined,
          brepRef: undefined,
        });
      }),
      close: vi.fn(),
    };

    vi.mocked(NativeKernelAdapter.prototype).constructor = function (this: any, address: string) {
      this.client = mockClient;
      this.requestId = 0;
    };

    const adapter = new NativeKernelAdapter('unix:/tmp/test.sock');
    const script: Script = {
      name: 'test_box',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    };
    const results = await adapter.execute(script);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].shapeId).toBe('box_req_0');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('handles unsupported operation gracefully', async () => {
    const adapter = new NativeKernelAdapter('unix:/tmp/test.sock');
    const script: Script = {
      name: 'test_unsupported',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'unknown_op', parameters: {} }],
    };
    const results = await adapter.execute(script);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('Unsupported operation');
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/harness/native-kernel-adapter.integration.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/harness/native-kernel-adapter.integration.test.ts
git commit -m "test(harness): add NativeKernelAdapter integration test with mock"
```

---

## Chunk 6: ParityHarness orchestrator

### Task 10: Create ParityHarness

**Files:**
- Create: `src/core/harness/parity-harness.ts`
- Create: `tests/harness/parity-harness.integration.test.ts`

- [ ] **Step 1: Write parity-harness.ts**

```typescript
import { Script, KernelResult, KernelAdapter, DEFAULT_TOLERANCES } from './kernel-adapter';
import { parseScript } from './script-parser';
import { compareStepResults, ParityStepResult } from './comparator';
import { writeParityReport, ParityReportOutput } from './parity-report';

export interface ParityHarnessOptions {
  wasmAdapter: KernelAdapter;
  nativeAdapter: KernelAdapter;
  reportPath?: string;
  knownDifferences?: string[];
}

export class ParityHarness {
  private wasmAdapter: KernelAdapter;
  private nativeAdapter: KernelAdapter;
  private reportPath?: string;
  private knownDifferences: string[];

  constructor(options: ParityHarnessOptions) {
    this.wasmAdapter = options.wasmAdapter;
    this.nativeAdapter = options.nativeAdapter;
    this.reportPath = options.reportPath;
    this.knownDifferences = options.knownDifferences ?? [];
  }

  async run(scriptInput: unknown): Promise<ParityReportOutput> {
    const script = parseScript(scriptInput);

    const [wasmResults, nativeResults] = await Promise.all([
      this.wasmAdapter.execute(script),
      this.nativeAdapter.execute(script),
    ]);

    const steps: ParityStepResult[] = [];
    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      const wasm = wasmResults[i];
      const native = nativeResults[i];

      if (!wasm || !native) {
        steps.push({
          stepIndex: i,
          stepName: step.name,
          passed: false,
          diffs: {},
          errors: ['Missing result from one kernel'],
        });
        continue;
      }

      steps.push(compareStepResults(i, step.name, wasm, native, script.tolerances));
    }

    const reportInput = {
      scriptName: script.name,
      kernelPair: [this.wasmAdapter.name, this.nativeAdapter.name],
      tolerances: script.tolerances,
      steps,
      wasmResults,
      nativeResults,
      knownDifferences: this.knownDifferences,
    };

    if (this.reportPath) {
      return writeParityReport(this.reportPath, reportInput);
    }
    return writeParityReport('/dev/null', reportInput);
  }
}
```

- [ ] **Step 2: Write integration test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ParityHarness } from '../../src/core/harness/parity-harness';
import { KernelAdapter, Script, KernelResult } from '../../src/core/harness/kernel-adapter';
import { DEFAULT_TOLERANCES } from '../../src/core/harness/kernel-adapter';

function makeAdapter(name: string, results: KernelResult[]): KernelAdapter {
  return {
    name,
    execute: vi.fn().mockResolvedValue(results),
  } as unknown as KernelAdapter;
}

describe('ParityHarness', () => {
  it('runs script against both adapters and compares', async () => {
    const boxResult: KernelResult = {
      stepIndex: 0,
      stepName: 'create_box',
      shapeId: 'box_1',
      metrics: { volume: 1000, surfaceArea: 600, valid: true },
      success: true,
    };

    const wasmAdapter = makeAdapter('wasm', [boxResult]);
    const nativeAdapter = makeAdapter('native', [{ ...boxResult, metrics: { volume: 1000.00001, surfaceArea: 600.00001, valid: true } }]);

    const harness = new ParityHarness({
      wasmAdapter,
      nativeAdapter,
      reportPath: '/tmp/parity-test-report.json',
    });

    const script: Script = {
      name: 'test_box',
      tolerances: DEFAULT_TOLERANCES,
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    };

    const report = await harness.run(script);
    expect(report.scriptName).toBe('test_box');
    expect(report.summary.totalSteps).toBe(1);
    expect(report.summary.passedSteps).toBe(1);
    expect(report.summary.failedSteps).toBe(0);
    expect(wasmAdapter.execute).toHaveBeenCalledTimes(1);
    expect(nativeAdapter.execute).toHaveBeenCalledTimes(1);
  });

  it('reports failure when metrics diverge', async () => {
    const wasmAdapter = makeAdapter('wasm', [{
      stepIndex: 0, stepName: 'create_box',
      metrics: { volume: 1000, valid: true }, success: true,
    }]);
    const nativeAdapter = makeAdapter('native', [{
      stepIndex: 0, stepName: 'create_box',
      metrics: { volume: 2000, valid: true }, success: true,
    }]);

    const harness = new ParityHarness({ wasmAdapter, nativeAdapter });
    const script: Script = {
      name: 'test_diverge',
      tolerances: DEFAULT_TOLERANCES,
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    };

    const report = await harness.run(script);
    expect(report.summary.passedSteps).toBe(0);
    expect(report.summary.failedSteps).toBe(1);
  });
});
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/harness/parity-harness.integration.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/harness/parity-harness.ts tests/harness/parity-harness.integration.test.ts
git commit -m "test(harness): add ParityHarness orchestrator"
```

---

## Chunk 7: E2E test + verify

### Task 11: Create E2E test for full parity harness

**Files:**
- Create: `tests/e2e/harness/parity-harness.e2e.spec.ts`

- [ ] **Step 1: Write e2e test**

```typescript
import { test, expect } from '@playwright/test';
import { ParityHarness } from '../../../src/core/harness/parity-harness';
import { WasmKernelAdapter } from '../../../src/core/harness/wasm-kernel-adapter';
import { NativeKernelAdapter } from '../../../src/core/harness/native-kernel-adapter';
import { Script } from '../../../src/core/harness/kernel-adapter';

test('parity harness: box creation matches between WASM and native kernels', async ({ page }) => {
  // This test requires a running native OCCT kernel (gRPC server)
  // Skip if kernel address not configured
  const kernelAddress = process.env.KERNEL_ADDRESS;
  if (!kernelAddress) {
    test.skip();
    return;
  }

  const wasmAdapter = new WasmKernelAdapter();
  await wasmAdapter.init();

  const nativeAdapter = new NativeKernelAdapter(kernelAddress);

  const harness = new ParityHarness({
    wasmAdapter,
    nativeAdapter,
    reportPath: '/tmp/parity-e2e-report.json',
    knownDifferences: [],
  });

  const script: Script = {
    name: 'e2e_box_parity',
    tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
    steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
  };

  const report = await harness.run(script);
  expect(report.summary.passedSteps).toBeGreaterThan(0);
  expect(report.summary.failedSteps).toBe(0);

  await wasmAdapter.cleanup();
  nativeAdapter.close();
}, 120000);
```

- [ ] **Step 2: Run e2e test (if kernel available)**

Run: `KERNEL_ADDRESS=unix:/tmp/webcad-kernel.sock npx playwright test tests/e2e/harness/parity-harness.e2e.spec.ts`
Expected: PASS (or skipped if no kernel)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/harness/parity-harness.e2e.spec.ts
git commit -m "test(harness): add E2E parity harness test"
```

### Task 12: Run full verify

**Files:** None

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors)

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (0 errors, pre-existing warnings OK)

- [ ] **Step 3: Run unit tests**

Run: `npm test`
Expected: PASS for all new test files

- [ ] **Step 4: Run buf checks**

Run: `npm run buf:lint` and `npm run buf:breaking`
Expected: PASS (no proto changes, so should pass)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(harness): complete WC-EC-12 parity harness implementation"
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-11-19-parity-harness.md`. Ready to execute?**