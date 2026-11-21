# Reference-parts Oracle Design (WC-EC-13)

**Ticket:** WC-EC-13 — Reference-parts oracle suite (analytic expected values)
**Date:** 2026-11-21
**Status:** Draft
**Parent:** WC-EC · **Depends on:** WC-EC-12 (Parity harness)

## Problem

WC-EC-12 built a comparative parity harness between two black-box kernels (WASM vs Native OCCT). It tells you whether the two kernels agree with each other, but not whether either is *correct*.

WC-EC-13 establishes an independent, ground-truth correctness oracle. It runs operation scripts against any kernel and compares the resulting geometry against analytically computed exact values (volume, surface area, bounding box, face/edge/vertex counts, validity) without trusting either kernel as the source of truth.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Reuse `KernelAdapter` from WC-EC-12 | The oracle consumes `KernelResult[]` exactly like the parity comparator. No new adapter code needed. |
| Expected values hardcoded in JSON fixtures (box-only now) | Box volume/surface area/bbox formulas are trivial; hardcoding keeps the oracle simple with zero formula code. |
| Architecture extensible to formula source later | `MetricSource` is an injectable interface. Non-box primitives (cylinder, sphere, boolean) can add formula computation later without changing evaluator or runner. |
| Delta reporting per AGENTS.md conventions | Every failure prints metric, expected, actual, and delta — never just "failed". |

## Components

### OracleRunner (`src/core/oracle/oracle-runner.ts`)

Orchestrates the full oracle flow:
1. Loads all `tests/fixtures/oracle/*.json` reference-part definitions.
2. For each part, executes its script via any `KernelAdapter`.
3. Pairs each `KernelResult` (by step index) with the fixture's analytic expected metrics.
4. Delegates per-step comparison to `OracleEvaluator`.
5. Aggregates into an `OracleReport`.

```typescript
export interface KernelAdapter {
  name: string;
  execute(script: Script): Promise<KernelResult[]>;
}
```

Reuses WC-EC-12 `KernelAdapter`, `KernelResult`, `Script` types from `src/core/harness/kernel-adapter.ts`.

### OracleEvaluator (`src/core/oracle/oracle-evaluator.ts`)

Compares kernel metrics against expected values with tolerance-aware delta reporting:

| Metric | Delta formula | Pass criterion |
|--------|--------------|----------------|
| volume, surfaceArea | `\|actual - expected\| / max(\|actual\|, \|expected\|, 1e-12)` | <= tolerance |
| bbox min/max (6 axes) | `\|actual - expected\|` per axis | all <= tolerance |
| faceCount, edgeCount, vertexCount | exact match (delta 0) | == expected |
| isValid | boolean match | == expected |

Returns `OracleMetricEvaluation` with per-metric `MetricDiff[]`. Each diff message reads like:

```
volume: expected 6000, actual 5999.8, delta 0.2, tolerance 0.0001 — FAILED
```

Missing metrics → `passed = false`, message `"metric missing from kernel result"`.

### Types (`src/core/oracle/types.ts`)

- `ReferencePart` — schema matching the JSON fixture.
- `MetricDiff` — metric, expected, actual, delta, tolerance, passed, message.
- `OracleMetricEvaluation` — part id, diffs, overall passed, error count.
- `OracleReport` — totals, per-part evaluations, timestamp.

## Reference Part Corpus (`tests/fixtures/oracle/`)

| File | Shape | Volume | Surface Area | Bbox | Faces | Edges | Vertices | Valid |
|------|-------|--------|--------------|------|-------|-------|----------|-------|
| unit_cube.json | Cube 1³ | 1.0 | 6.0 | [0..1, 0..1, 0..1] | 6 | 12 | 8 | true |
| rectangular_box.json | Box 10×20×30 | 6000.0 | 2200.0 | [0..10, 0..20, 0..30] | 6 | 12 | 8 | true |
| offset_box.json | Box 10³ at (5,10,15) | 1000.0 | 600.0 | [5..15, 10..20, 15..25] | 6 | 12 | 8 | true |
| thin_plate.json | Plate 100×100×2 | 20000.0 | 20800.0 | [0..100, 0..100, 0..2] | 6 | 12 | 8 | true |

Tolerances: volume 1e-4, surfaceArea 1e-4, bbox 1e-3, counts 0.

## Tests

- `tests/oracle/oracle-runner.test.ts` — unit tests with mock `KernelAdapter`: exact pass, tolerance-boundary pass/fail, missing metric, boolean mismatch, count mismatch.
- `tests/oracle/native-oracle.integration.test.ts` — live integration against `localhost:50051` via `NativeKernelAdapter`, all 4 reference parts must pass with 0 errors.

## Error Handling

- Script validation failure (invalid fixture schema) → runner throws, part marked errored.
- Kernel execution failure (step `success = false`) → evaluator records step error, part marked failed.
- Missing metrics → per-metric diff `passed = false`, not a hard crash.
- Adapter transport errors propagate as rejected promises; runner continues with remaining parts.

## Files

| File | Action |
|------|--------|
| `docs/superpowers/specs/2026-11-21-reference-parts-oracle-design.md` | Create (this doc) |
| `src/core/oracle/types.ts` | Create |
| `src/core/oracle/oracle-evaluator.ts` | Create |
| `src/core/oracle/oracle-runner.ts` | Create |
| `tests/fixtures/oracle/unit_cube.json` | Create |
| `tests/fixtures/oracle/rectangular_box.json` | Create |
| `tests/fixtures/oracle/offset_box.json` | Create |
| `tests/fixtures/oracle/thin_plate.json` | Create |
| `tests/oracle/oracle-runner.test.ts` | Create |
| `tests/oracle/native-oracle.integration.test.ts` | Create |

## Self-Review

- **Placeholder scan:** No TBDs. All interfaces, behaviors, formulas, and tolerances are concrete.
- **Internal consistency:** Evaluator delta formulas match MetricDiff contract; runner feeds evaluator; fixtures use analytic values consistent with the spec tables.
- **Scope check:** Box-only now, extensible architecture for non-box later. No WASM-specific or UI code.
- **Ambiguity check:** Step-to-expected pairing by step index (explicit). Delta for bbox is per-axis absolute (explicit). Missing metrics are failures, not crashes (explicit).

## Success Criteria

1. `npx tsc --noEmit` passes with 0 new errors.
2. `npx eslint src/core/oracle/ tests/oracle/` passes with 0 errors.
3. `npx vitest run tests/oracle` passes 100%.
4. Live integration test passes against `localhost:50051`, printing actual vs expected analytic values and deltas.
