# WC-EC-13 Reference-parts Oracle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an independent ground-truth correctness oracle that compares kernel geometry output against analytically computed exact values (volume, surface area, bounding box, topology counts, validity), building on WC-EC-12's `KernelAdapter` abstraction.

**Architecture:** Reuses `KernelAdapter` from `src/core/harness/kernel-adapter.ts`. New code lives in `src/core/oracle/` (types, evaluator, runner). Reference-part JSON fixtures live in `tests/fixtures/oracle/`. Unit tests with mock adapters in `tests/oracle/oracle-runner.test.ts`; live integration test against `localhost:50051` in `tests/oracle/native-oracle.integration.test.ts`. C++ `kernel-worker.cpp` topology counts switched from raw `TopExp_Explorer` (visits sub-shapes per parent face → inflated counts) to `TopExp::MapShapes` (unique elements → 6/12/8 for a box).

**Tech Stack:** TypeScript strict, Vitest, Node.js gRPC client, OpenCASCADE C++ (kernel-worker.cpp), protobuf (already has ShapeMetrics from WC-EC-12).

---
## File Structure

Create:
- `src/core/oracle/types.ts` — ExpectedMetrics, ReferencePart, MetricDiff, OraclePartEvaluation, OracleReport
- `src/core/oracle/oracle-evaluator.ts` — evaluateMetrics() with delta reporting
- `src/core/oracle/oracle-runner.ts` — OracleRunner: loadFixtures, run(), init/cleanup lifecycle
- `tests/fixtures/oracle/unit_cube.json`
- `tests/fixtures/oracle/rectangular_box.json`
- `tests/fixtures/oracle/offset_box.json`
- `tests/fixtures/oracle/thin_plate.json`
- `tests/oracle/oracle-runner.test.ts`
- `tests/oracle/native-oracle.integration.test.ts`

Modify:
- `src/core/gateway/kernel-worker.cpp` — Adjustment A: unique topology counts via TopExp::MapShapes

---

## Chunk 1: Types & Evaluator

### Task 1: Write types.ts with failing type-check scaffolding

**Files:**
- Create: `src/core/oracle/types.ts`

```typescript
import { KernelMetric, Script, ScriptTolerances } from '../harness/kernel-adapter';

export interface ExpectedMetrics {
  volume: number;
  surfaceArea: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  faceCount: number;
  edgeCount: number;
  vertexCount: number;
  isValid: boolean;
}

export interface ReferencePart {
  id: string;
  name: string;
  description: string;
  script: Script;
  expected: ExpectedMetrics;
  tolerances: ScriptTolerances;
}

export interface MetricDiff {
  metric: string;
  expected: unknown;
  actual: unknown;
  delta: number;
  tolerance: number;
  passed: boolean;
  message?: string;
}

export interface OraclePartEvaluation {
  partId: string;
  passed: boolean;
  diffs: Record<string, MetricDiff>;
  errors: string[];
}

export interface OracleReport {
  totalParts: number;
  passedParts: number;
  failedParts: number;
  timestamp: string;
  results: OraclePartEvaluation[];
}
```

- [ ] **Step 1.1: Create types.ts** — write the file above
- [ ] **Step 1.2: Type-check** — Run: `npx tsc --noEmit` Expected: PASS (types are pure declarations, no runtime code)

### Task 2: Write oracle-evaluator.ts (TDD — test first)

**Files:**
- Create: `tests/oracle/oracle-runner.test.ts` (will include evaluator unit tests)
- Create: `src/core/oracle/oracle-evaluator.ts`

- [ ] **Step 2.1: Write failing evaluator unit tests** — add tests to oracle-runner.test.ts for:
  - Exact pass: all metrics within tolerance → passed=true
  - Volume tolerance boundary fail: relative diff just over tolerance → passed=false, message contains expected/actual/delta/tolerance
  - Bbox per-axis absolute diff fail → passed=false, message with delta
  - Counts exact mismatch → passed=false, delta = |actual-expected|
  - Boolean validity mismatch → passed=false, delta = 1
  - Missing metric → passed=false, message contains "missing"

  Run: `npx vitest run tests/oracle/oracle-runner.test.ts` Expected: FAIL (evaluator not implemented yet)

- [ ] **Step 2.2: Implement evaluateMetrics** in oracle-evaluator.ts:

```typescript
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
    const passed = d <= tolerances.surface;
    diffs.surfaceArea = {
      metric: 'surfaceArea',
      expected: expected.surfaceArea,
      actual: actual.surfaceArea,
      delta: d,
      tolerance: tolerances.surface,
      passed,
      message: passed
        ? `surfaceArea: expected ${expected.surfaceArea}, actual ${actual.surfaceArea}, delta ${d.toExponential(4)}, tolerance ${tolerances.surface} — PASSED`
        : `surfaceArea: expected ${expected.surfaceArea}, actual ${actual.surfaceArea}, delta ${d.toExponential(4)}, tolerance ${tolerances.surface} — FAILED`,
    };
    if (!passed) errors.push(diffs.surfaceArea.message!);
  } else {
    diffs.surfaceArea = {
      metric: 'surfaceArea',
      expected: expected.surfaceArea,
      actual: undefined,
      delta: Number.NaN,
      tolerance: tolerances.surface,
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
```

- [ ] **Step 2.3: Run evaluator unit tests** — Run: `npx vitest run tests/oracle/oracle-runner.test.ts` Expected: PASS

---

## Chunk 2: Runner

### Task 3: Write oracle-runner.ts (TDD — test first)

**Files:**
- Modify: `tests/oracle/oracle-runner.test.ts` — add runner integration tests with mock adapter
- Create: `src/core/oracle/oracle-runner.ts`

- [ ] **Step 3.1: Write failing runner tests** — add tests for:
  - loadFixtures parses all 4 JSONs correctly
  - run() executes parts via adapter, evaluates, aggregates report with passedParts/failedParts
  - init/cleanup lifecycle called when adapter implements them
  - Adapter without init/cleanup still works (optional methods)

  Run: `npx vitest run tests/oracle/oracle-runner.test.ts` Expected: FAIL (runner not implemented)

- [ ] **Step 3.2: Implement OracleRunner** in oracle-runner.ts:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { KernelAdapter, Script } from '../harness/kernel-adapter';
import { ReferencePart, OracleReport, OraclePartEvaluation } from './types';
import { evaluateMetrics } from './oracle-evaluator';

export class OracleRunner {
  private parts: ReferencePart[] = [];

  loadFixtures(fixturesDir: string): ReferencePart[] {
    const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json')).sort();
    this.parts = files.map(f => {
      const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf8'));
      return raw as ReferencePart;
    });
    return this.parts;
  }

  async run(adapter: KernelAdapter, parts?: ReferencePart[]): Promise<OracleReport> {
    const targetParts = parts ?? this.parts;
    if (adapter.init) await adapter.init();

    const results: OraclePartEvaluation[] = [];
    try {
      for (const part of targetParts) {
        let partPassed = true;
        const errors: string[] = [];
        const diffs: Record<string, MetricDiff> = {};

        try {
          const kernelResults = await adapter.execute(part.script);
          // Pair each step result with expected metrics by step index
          for (let i = 0; i < kernelResults.length; i++) {
            const result = kernelResults[i];
            if (!result.success) {
              errors.push(`step ${i} (${result.stepName}): ${result.error || 'unknown error'}`);
              partPassed = false;
              continue;
            }
            const evalResult = evaluateMetrics(part.expected, result.metrics, part.tolerances);
            for (const [key, diff] of Object.entries(evalResult.diffs)) {
              diffs[key] = diff;
              if (!diff.passed) partPassed = false;
            }
            errors.push(...evalResult.errors.filter(e => !diffs[e] || !diffs[e]!.passed));
          }
        } catch (err) {
          errors.push(`adapter error: ${err instanceof Error ? err.message : String(err)}`);
          partPassed = false;
        }

        results.push({
          partId: part.id,
          passed: partPassed && errors.length === 0,
          diffs,
          errors,
        });
        if (!results[results.length - 1]!.passed) partPassed = false;
      }
    } finally {
      if (adapter.cleanup) await adapter.cleanup();
    }

    const passedParts = results.filter(r => r.passed).length;
    return {
      totalParts: results.length,
      passedParts,
      failedParts: results.length - passedParts,
      timestamp: new Date().toISOString(),
      results,
    };
  }
}
```

Need to import MetricDiff type too. Let me fix the import:

```typescript
import { MetricDiff } from './types';
```

- [ ] **Step 3.3: Run runner tests** — Run: `npx vitest run tests/oracle/oracle-runner.test.ts` Expected: PASS

---

## Chunk 3: Reference Part Corpus

### Task 4: Create the 4 reference-part JSON fixtures

**Files:**
- Create: `tests/fixtures/oracle/unit_cube.json`
- Create: `tests/fixtures/oracle/rectangular_box.json`
- Create: `tests/fixtures/oracle/offset_box.json`
- Create: `tests/fixtures/oracle/thin_plate.json`

**unit_cube.json:**
```json
{
  "id": "unit_cube",
  "name": "Unit Cube (1x1x1)",
  "description": "Axis-aligned unit cube at origin",
  "script": {
    "name": "create_box_1x1x1",
    "tolerances": { "volume": 1e-4, "surface": 1e-4, "bbox": 1e-3, "counts": 0 },
    "steps": [
      {
        "name": "create_box",
        "parameters": {
          "x": 0, "y": 0, "z": 0,
          "dx": 1, "dy": 1, "dz": 1,
          "deflection": 0.1,
          "entity_id": "box_target"
        }
      }
    ]
  },
  "expected": {
    "volume": 1.0,
    "surfaceArea": 6.0,
    "bbox": { "min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 1.0] },
    "faceCount": 6,
    "edgeCount": 12,
    "vertexCount": 8,
    "isValid": true
  },
  "tolerances": { "volume": 1e-4, "surface": 1e-4, "bbox": 1e-3, "counts": 0 }
}
```

**rectangular_box.json:**
```json
{
  "id": "rectangular_box",
  "name": "Rectangular Box (10x20x30)",
  "description": "Axis-aligned box at origin",
  "script": {
    "name": "create_box_10x20x30",
    "tolerances": { "volume": 1e-4, "surface": 1e-4, "bbox": 1e-3, "counts": 0 },
    "steps": [
      {
        "name": "create_box",
        "parameters": {
          "x": 0, "y": 0, "z": 0,
          "dx": 10, "dy": 20, "dz": 30,
          "deflection": 0.1,
          "entity_id": "box_target"
        }
      }
    ]
  },
  "expected": {
    "volume": 6000.0,
    "surfaceArea": 2200.0,
    "bbox": { "min": [0.0, 0.0, 0.0], "max": [10.0, 20.0, 30.0] },
    "faceCount": 6,
    "edgeCount": 12,
    "vertexCount": 8,
    "isValid": true
  },
  "tolerances": { "volume": 1e-4, "surface": 1e-4, "bbox": 1e-3, "counts": 0 }
}
```

**offset_box.json:**
```json
{
  "id": "offset_box",
  "name": "Offset Box (10x10x10 at 5,10,15)",
  "description": "Axis-aligned box offset from origin",
  "script": {
    "name": "create_box_10x10x10_offset",
    "tolerances": { "volume": 1e-4, "surface": 1e-4, "bbox": 1e-3, "counts": 0 },
    "steps": [
      {
        "name": "create_box",
        "parameters": {
          "x": 5, "y": 10, "z": 15,
          "dx": 10, "dy": 10, "dz": 10,
          "deflection": 0.1,
          "entity_id": "box_target"
        }
      }
    ]
  },
  "expected": {
    "volume": 1000.0,
    "surfaceArea": 600.0,
    "bbox": { "min": [5.0, 10.0, 15.0], "max": [15.0, 20.0, 25.0] },
    "faceCount": 6,
    "edgeCount": 12,
    "vertexCount": 8,
    "isValid": true
  },
  "tolerances": { "volume": 1e-4, "surface": 1e-4, "bbox": 1e-3, "counts": 0 }
}
```

**thin_plate.json:**
```json
{
  "id": "thin_plate",
  "name": "Thin Plate (100x100x2)",
  "description": "Thin axis-aligned plate at origin",
  "script": {
    "name": "create_box_100x100x2",
    "tolerances": { "volume": 1e-4, "surface": 1e-4, "bbox": 1e-3, "counts": 0 },
    "steps": [
      {
        "name": "create_box",
        "parameters": {
          "x": 0, "y": 0, "z": 0,
          "dx": 100, "dy": 100, "dz": 2,
          "deflection": 0.1,
          "entity_id": "box_target"
        }
      }
    ]
  },
  "expected": {
    "volume": 20000.0,
    "surfaceArea": 20800.0,
    "bbox": { "min": [0.0, 0.0, 0.0], "max": [100.0, 100.0, 2.0] },
    "faceCount": 6,
    "edgeCount": 12,
    "vertexCount": 8,
    "isValid": true
  },
  "tolerances": { "volume": 1e-4, "surface": 1e-4, "bbox": 1e-3, "counts": 0 }
}
```

- [ ] **Step 4.1: Create all 4 fixture files** — write each JSON above
- [ ] **Step 4.2: Verify fixtures load** — Run: `npx vitest run tests/oracle/oracle-runner.test.ts` Expected: PASS (loadFixtures test validates parsing)

---

## Chunk 4: C++ Kernel Topology Counts (Adjustment A)

### Task 5: Fix unique topology counts in kernel-worker.cpp

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

Current code uses `TopExp_Explorer` which iterates sub-shapes per parent, producing inflated counts (24 edges, 48 vertices for a box instead of 12/8). Switch to `TopExp::MapShapes` which counts unique elements.

- [ ] **Step 5.1: Add include** — after `#include <opencascade/TopExp_Explorer.hxx>` add:
```cpp
#include <opencascade/TopTools_IndexedMapOfShape.hxx>
#include <opencascade/TopExp.hxx>
```

- [ ] **Step 5.2: Replace topology counting** — in `ComputeShapeMetrics`, replace:
```cpp
  uint32_t faces = 0, edges = 0, vertices = 0;
  for (TopExp_Explorer exp(shape, TopAbs_FACE); exp.More(); exp.Next()) faces++;
  for (TopExp_Explorer exp(shape, TopAbs_EDGE); exp.More(); exp.Next()) edges++;
  for (TopExp_Explorer exp(shape, TopAbs_VERTEX); exp.More(); exp.Next()) vertices++;

  metrics->set_face_count(faces);
  metrics->set_edge_count(edges);
  metrics->set_vertex_count(vertices);
```
with:
```cpp
  TopTools_IndexedMapOfShape fMap, eMap, vMap;
  TopExp::MapShapes(shape, TopAbs_FACE, fMap);
  TopExp::MapShapes(shape, TopAbs_EDGE, eMap);
  TopExp::MapShapes(shape, TopAbs_VERTEX, vMap);

  metrics->set_face_count(static_cast<uint32_t>(fMap.Extent()));
  metrics->set_edge_count(static_cast<uint32_t>(eMap.Extent()));
  metrics->set_vertex_count(static_cast<uint32_t>(vMap.Extent()));
```

- [ ] **Step 5.3: Verify C++ compiles** — This requires the Docker kernel build environment; if unavailable locally, note that the change is syntactically verified by inspection against existing OCCT includes already present in the file. The container `webcad-kernel-test` runs the old binary; user forbade Docker rebuilds, so this C++ change is committed but not yet deployed to the running container. Mark as: C++ change committed, runtime deployment pending separate kernel rebuild.

---

## Chunk 5: Live Integration Test

### Task 6: Write native-oracle.integration.test.ts

**Files:**
- Create: `tests/oracle/native-oracle.integration.test.ts`

- [ ] **Step 6.1: Write integration test** — connects to `localhost:50051` via `NativeKernelAdapter`, runs all 4 reference parts, asserts `report.passedParts === 4` and `report.failedParts === 0`.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NativeKernelAdapter } from '../../src/core/harness/native-kernel-adapter';
import { OracleRunner } from '../../src/core/oracle/oracle-runner';

describe('Native kernel oracle integration (localhost:50051)', () => {
  let adapter: NativeKernelAdapter;
  let runner: OracleRunner;

  beforeAll(async () => {
    adapter = new NativeKernelAdapter('localhost:50051');
    runner = new OracleRunner();
    runner.loadFixtures(path.resolve(__dirname, '../../tests/fixtures/oracle'));
  });

  afterAll(async () => {
    if (adapter.cleanup) await adapter.cleanup();
  });

  it('all reference parts pass against native kernel', async () => {
    const report = await runner.run(adapter);
    expect(report.failedParts).toBe(0);
    expect(report.passedParts).toBe(report.totalParts);
    expect(report.totalParts).toBe(4);
    for (const result of report.results) {
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  }, 60000);
});
```

Need to import `path` from `node:path`.

- [ ] **Step 6.2: Run integration test** — Run: `npx vitest run tests/oracle/native-oracle.integration.test.ts` Expected: PASS (requires live kernel at localhost:50051 with metrics deployed)

---

## Chunk 6: Verification & Commit

### Task 7: Full verification

- [ ] **Step 7.1: Type-check** — Run: `npx tsc --noEmit` Expected: 0 errors
- [ ] **Step 7.2: Lint** — Run: `npx eslint src/core/oracle/ tests/oracle/` Expected: 0 errors
- [ ] **Step 7.3: Unit tests** — Run: `npx vitest run tests/oracle/oracle-runner.test.ts` Expected: 100% pass
- [ ] **Step 7.4: Integration test** — Run: `npx vitest run tests/oracle/native-oracle.integration.test.ts` Expected: PASS (if kernel running)

### Task 8: Commit

- [ ] **Step 8.1: Stage and commit** — Run:
```bash
git add src/core/oracle/ tests/oracle/ tests/fixtures/oracle/ src/core/gateway/kernel-worker.cpp docs/superpowers/plans/2026-11-21-wc-ec-13-reference-parts-oracle.md
git commit -m "feat(wc-ec-13): add reference-parts oracle suite

Add independent ground-truth correctness oracle comparing kernel
geometry against analytic expected values (volume, surface area,
bbox, topology counts, validity). Reuses KernelAdapter from WC-EC-12.
Fix unique topology counts in kernel-worker.cpp via TopExp::MapShapes."
```

---
## Success Criteria

1. `npx tsc --noEmit` passes with 0 new errors
2. `npx eslint src/core/oracle/ tests/oracle/` passes with 0 errors
3. `npx vitest run tests/oracle` passes 100%
4. Live integration test passes against `localhost:50051` printing actual vs expected analytic values and deltas
