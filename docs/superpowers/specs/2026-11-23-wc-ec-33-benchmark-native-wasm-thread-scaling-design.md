# Benchmark on Real Models: Native vs WASM, Thread Scaling (WC-EC-33)

**Ticket:** WC-EC-33 — Benchmark on real models: native vs WASM, thread scaling  
**Date:** 2026-11-23  
**Status:** Draft  
**Parent:** WC-EC · **Depends on:** WC-EC-12 (Parity harness, `KernelAdapter`)  
**Phase:** 4 · **Agent:** B · **Priority:** High

## Problem

WC-EC-12 established a comparative parity harness (WASM vs Native OCCT) that checks whether two kernels agree with each other on the same script. WC-EC-13 added a reference-parts oracle for correctness against analytic values. Neither measures **performance** — execution time, memory usage, or how throughput scales with concurrent load (thread count).

WC-EC-33 builds a benchmark harness that:
1. Runs script-defined composite models against both WASM and native kernels.
2. Runs the real AutoCAD R12 DXF model (`C:\Dev\webcad\files\turbine-01.dxf`, 44MB) against both kernels.
3. Measures per-step execution time, memory delta (RSS), and tessellation time at thread counts 1, 2, 4, 8.
4. Produces a comparable `BenchmarkReport` (JSON) showing WASM vs native at each thread count.

This is a **performance/characterization** harness, distinct from the correctness-focused WC-EC-12/13. No proto changes are required.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Reuse `KernelAdapter` from WC-EC-12 | The benchmark consumes `KernelResult[]` exactly like the parity/oracle runners. A thin wrapper (`BenchmarkAdapter`) instruments each step with timing + memory without touching the adapter contract. |
| Thread scaling = concurrent kernel operations | WC-EC-34 handles multi-kernel worker pools / process distribution separately. WC-EC-33 measures throughput scaling under concurrent load at thread counts 1/2/4/8. |
| Benchmark scripts are JSON fixtures (like oracle fixtures) | Reuses the proven `Script` type from `src/core/harness/kernel-adapter.ts`. Easy to add new models without code changes. |
| Continue-and-report error handling | A kernel crash at one thread count marks that run errored; it does not abort the whole benchmark. |
| Output = JSON report, no UI | Results are machine-readable JSON. Visual comparison is out of scope for WC-EC-33. |

## Components

### BenchmarkAdapter (`src/core/benchmark/benchmark-adapter.ts`)

Wraps a `KernelAdapter` and instruments each step execution:

```typescript
export interface StepBenchmark {
  stepIndex: number;
  stepName: string;
  durationMs: number;
  memoryBeforeKb: number;
  memoryAfterKb: number;
  memoryDeltaKb: number;
  success: boolean;
  error?: string;
}

export interface ScriptBenchmark {
  scriptName: string;
  threadCount: number;
  kernelName: string;      // "wasm" or "native"
  totalDurationMs: number;
  steps: StepBenchmark[];
  peakMemoryDeltaKb: number;
  tessellationTimeMs?: number;  // if step produces mesh
}

export class BenchmarkAdapter {
  constructor(private adapter: KernelAdapter, private threadCount: number);
  init?(): Promise<void>;
  execute(script: Script): Promise<ScriptBenchmark>;
  cleanup?(): Promise<void>;
}
```

Instrumentation uses `performance.now()` for timing and `process.resourceUsage()` (Node) for RSS delta per step. Steps that produce a mesh (`KernelResult.mesh`) also record tessellation time.

### BenchmarkRunner (`src/core/benchmark/benchmark-runner.ts`)

Orchestrates the full benchmark flow:

1. Loads all `tests/fixtures/benchmarks/*.json` benchmark script definitions.
2. For each benchmark script × kernel (WASM, native) × thread count (1, 2, 4, 8):
   - Initializes the kernel adapter.
   - Executes the script `threadCount` times concurrently (Promise.all).
   - Aggregates per-step timings and memory across concurrent runs.
   - Records total wall-clock and per-run metrics.
3. Aggregates into a `BenchmarkReport`.

```typescript
export interface KernelThreadResult {
  kernelName: string;
  threadCount: number;
  runIndex: number;
  benchmark: ScriptBenchmark;
}

export interface ScriptBenchmarkResult {
  scriptId: string;
  scriptName: string;
  results: KernelThreadResult[];  // one per (kernel, threadCount, runIndex)
}

export interface BenchmarkReport {
  timestamp: string;
  machineInfo: { platform: string; cpus: number; totalMemKb: number };
  scripts: ScriptBenchmarkResult[];
}
```

Concurrency: at thread count N, the same script runs N times concurrently against the same kernel adapter instance (if thread-safe) or N adapter instances (if not). The `threadCount` parameter is passed to the adapter so kernel implementations can bind to N threads internally.

### BenchmarkReport (`src/core/benchmark/benchmark-report.ts`)

Types + JSON writer. Writes report to `tests/benchmark/reports/<timestamp>.json`. Includes a comparison helper that emits WASM vs native ratios per metric per thread count.

## Benchmark Fixture Corpus (`tests/fixtures/benchmarks/`)

| File | Model | Source | Steps |
|------|-------|--------|-------|
| turbine-01.json | turbine-01.dxf import + tessellate | `C:\Dev\webcad\files\turbine-01.dxf` (44MB AutoCAD R12 DXF) | import_dxf, tessellate, compute_volume |
| composite_box.json | script-defined composite | synthetic | create_box, fillet_edges, chamfer_faces, boolean_fuse |
| composite_cylinder.json | script-defined composite | synthetic | create_cylinder, revolve_profile, boolean_cut |

Each fixture is a `Script` (from `src/core/harness/kernel-adapter.ts`) plus an optional `modelFile` field pointing to an external file (e.g., the DXF).

The turbine-01 fixture references the DXF by absolute path; tests that require it skip gracefully if the file is missing (CI environments may not have it).

## Tests

- `tests/benchmark/benchmark-adapter.test.ts` — unit tests with mock `KernelAdapter`: per-step timing recorded, memory delta computed, thread count propagated, errored step still reported.
- `tests/benchmark/benchmark-runner.test.ts` — unit tests: aggregates across kernels/thread counts, report JSON shape, continue-on-error for crashed run.
- `tests/benchmark/benchmark-e2e.spec.ts` — Playwright E2E against real WASM + native kernels at thread counts 1/2/4/8; produces report and asserts it is non-empty with all kernel × thread count combinations present.

## Error Handling

- Script validation failure (invalid fixture schema) → runner throws, script marked errored.
- Kernel execution failure (step `success = false`) → step recorded with `success: false` and error message; benchmark continues.
- Missing DXF file → turbine-01 fixture skipped with a warning, not a hard failure.
- Adapter transport errors propagate as rejected promises; runner continues with remaining scripts/thread counts.
- Out-of-memory or process crash at a thread count → that `(kernel, threadCount)` run marked errored; other thread counts continue.

## Files

| File | Action |
|------|--------|
| `docs/superpowers/specs/2026-11-23-wc-ec-33-benchmark-native-wasm-thread-scaling-design.md` | Create (this doc) |
| `src/core/benchmark/benchmark-adapter.ts` | Create |
| `src/core/benchmark/benchmark-runner.ts` | Create |
| `src/core/benchmark/benchmark-report.ts` | Create |
| `tests/fixtures/benchmarks/turbine-01.json` | Create (references external DXF) |
| `tests/fixtures/benchmarks/composite_box.json` | Create |
| `tests/fixtures/benchmarks/composite_cylinder.json` | Create |
| `tests/benchmark/benchmark-adapter.test.ts` | Create |
| `tests/benchmark/benchmark-runner.test.ts` | Create |
| `tests/benchmark/benchmark-e2e.spec.ts` | Create |

## Self-Review

- **Placeholder scan:** No TBDs. All interfaces, metrics, thread counts, and file paths are concrete.
- **Internal consistency:** BenchmarkAdapter produces `ScriptBenchmark`; BenchmarkRunner aggregates into `BenchmarkReport`; fixtures use the `Script` type from WC-EC-12. Delta reporting follows AGENTS.md conventions (actual vs expected, not just "failed").
- **Scope check:** Performance only — no correctness assertions, no UI, no proto changes. WC-EC-34 handles multi-process worker pools separately.
- **Ambiguity check:** Thread count means concurrent script executions (explicit). Memory measured via `process.resourceUsage()` RSS delta (explicit). Missing DXF = skip, not crash (explicit). Continue-on-error for crashed runs (explicit).

## Success Criteria

1. `npx tsc --noEmit` passes with 0 new errors.
2. `npx eslint src/core/benchmark/ tests/benchmark/` passes with 0 errors.
3. `npx vitest run tests/benchmark` passes 100%.
4. E2E produces a non-empty `BenchmarkReport` JSON with all (WASM, native) × (1, 2, 4, 8) combinations present when both kernels are available.
