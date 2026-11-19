# Parity Harness Design (WC-EC-12)

**Ticket:** WEBCAD-192 — Parity harness: WASM worker vs native OCCT kernel
**Date:** 2026-11-19
**Status:** Draft

## Problem

The WebCad geometry kernel runs native OCCT in server-side worker processes behind a Node gateway, with an OCCT WASM worker remaining in the browser as an offline/preview fallback. We need a parity harness that replays the same operation scripts against both kernels, compares geometric results (volume, surface area, bbox, face/edge/vertex counts, validity), and reports diffs against configured tolerances. This ensures the WASM fallback behaves identically to the native kernel, and later supports the SolidCraft/solidcore spike as a third kernel.

## Scope

**In scope:**
- `KernelAdapter` interface: `execute(script) -> KernelResult[]`
- `WasmKernelAdapter`: runs scripts against the browser OCCWorker via Playwright (headless Chromium)
- `NativeKernelAdapter`: runs scripts against the server-side native OCCT kernel via gRPC `KernelService.Execute`
- `ScriptParser`: validates JSON script schema (CommandRegistry shape: name + parameters)
- `MetricExtractor`: pulls volume, surface area, bbox, face/edge/vertex counts, validity from each kernel result
- `Comparator`: per-step diff vs tolerance; pass/fail determination
- `ParityHarness`: orchestrates runner + comparator + reporter
- `ParityReport`: JSON artifact with per-step pass/fail, diffs, tolerances, known-differences notes
- Unit tests for parser, extractor, comparator (vitest)
- Integration test: WasmKernelAdapter + mock native adapter (and vice versa)
- E2E test: real script groups against real browser WASM + real gRPC native kernel

**Out of scope (later tickets):**
- SolidCraft/solidcore adapter (spike-dependent, separate ticket)
- CI pipeline wiring (harness is CI-runnable but pipeline config is separate)
- Fixing kernel differences found by the harness (reported, not auto-fixed)

## Design

### JSON Script Format

Reuses the CommandRegistry shape (`name` + `parameters`), kernel-agnostic:

```json
{
  "name": "parity_group_box_boolean",
  "tolerances": {
    "volume": 1e-4,
    "surface": 1e-4,
    "bbox": 1e-3,
    "counts": 0
  },
  "steps": [
    { "name": "create_box", "parameters": { "x": 0, "y": 0, "z": 0, "dx": 10, "dy": 10, "dz": 10, "deflection": 0.1 } },
    { "name": "create_box", "parameters": { "x": 5, "y": 5, "z": 5, "dx": 10, "dy": 10, "dz": 10, "deflection": 0.1 } },
    { "name": "create_boolean", "parameters": { "op": "cut", "shape_ids": ["step_0", "step_1"], "deflection": 0.1 } }
  ]
}
```

- `steps[i].name` matches a registered command (e.g. `create_box`, `create_boolean`).
- `steps[i].parameters` are the command parameters.
- `shape_ids` reference prior steps by index (`step_0`, `step_1`, ...) — simple and deterministic.
- `tolerances` are optional; defaults apply when omitted.

### KernelAdapter Interface

```typescript
export interface KernelMetric {
  volume?: number;
  surfaceArea?: number;
  bbox?: { min: [number, number, number]; max: [number, number, number] };
  faceCount?: number;
  edgeCount?: number;
  vertexCount?: number;
  valid?: boolean;        // BRepCheck result
}

export interface KernelResult {
  stepIndex: number;
  stepName: string;
  shapeId?: string;       // for referencing in later steps
  metrics: KernelMetric;
  success: boolean;
  error?: string;
}

export interface KernelAdapter {
  name: string;           // "wasm" | "native" | "solidcore"
  execute(script: Script): Promise<KernelResult[]>;
}
```

### WasmKernelAdapter

- Spins up a headless Chromium page via Playwright.
- Loads `src/core/io/OCCWorker.ts` as a Web Worker.
- Sends each script step as `{ type: <commandName>, payload: <parameters>, id: <stepIndex> }` via `worker.postMessage`.
- Receives `{ type, success, payload, error, id }` responses.
- Extracts metrics from the worker payload (mesh data + BRep reference).
- Normalizes into `KernelResult[]`.

### NativeKernelAdapter

- Node.js gRPC client to the server-side `KernelService`.
- Serializes each script step to proto `ExecuteRequest` (CreateBoxOp, CreateBooleanOp, etc.).
- Calls `KernelService.Execute`, receives `ExecuteResponse`.
- Extracts metrics from `ResultHeader` + `MeshData` + `BrepReference`.
- Normalizes into `KernelResult[]`.

### ScriptParser

- Validates JSON against the script schema.
- Returns a typed `Script` object with `name`, `tolerances` (with defaults), and `steps[]`.
- Throws on invalid schema (missing name, unknown step command, missing required parameters).

### MetricExtractor

- Given a `KernelResult`, extracts the five metrics:
  1. **volume** — numeric
  2. **surfaceArea** — numeric
  3. **bbox** — [min, max] 3D
  4. **faceCount / edgeCount / vertexCount** — integers
  5. **valid** — boolean from BRepCheck
- Returns `undefined` for metrics the kernel didn't provide (flagged as incomplete by Comparator).

### Comparator

- Compares WASM result vs native result per step, per metric:
  - volume / surfaceArea: relative tolerance (default 1e-4)
  - bbox: absolute tolerance per axis (default 1e-3)
  - counts: exact match (tolerance 0)
  - valid: both must be true; mismatch flagged
- Returns per-step `ParityStepResult`:
  ```typescript
  export interface ParityStepResult {
    stepIndex: number;
    stepName: string;
    passed: boolean;
    diffs: Record<string, { wasm: unknown; native: unknown; diff: number; tolerance: number; passed: boolean }>;
    errors: string[];      // kernel errors, missing metrics, etc.
  }
  ```

### ParityHarness

- Orchestrates: parse script → run both adapters → pair results by stepIndex → compare → report.
- Continue-and-report on kernel crashes (step marked errored, not abort).
- Script validation failure aborts the whole harness.

### ParityReport

JSON artifact:
```json
{
  "scriptName": "parity_group_box_boolean",
  "kernelPair": ["wasm", "native"],
  "tolerances": { "volume": 1e-4, "surface": 1e-4, "bbox": 1e-3, "counts": 0 },
  "steps": [
    {
      "stepIndex": 0,
      "stepName": "create_box",
      "passed": true,
      "diffs": { "volume": { "wasm": 1000.0, "native": 1000.0001, "diff": 0.0001, "tolerance": 1e-4, "passed": true }, ... },
      "errors": []
    }
  ],
  "summary": { "totalSteps": 3, "passedSteps": 3, "failedSteps": 0, "erroredSteps": 0 },
  "knownDifferences": []
}
```

## Success Criteria

- `npm run typecheck` passes
- `npm run lint` passes (no new errors)
- `npm test` passes for all new parity harness tests
- E2E test: harness green for each ported operation group against real WASM + real native kernel
- Report artifact lists tolerances and diffs per step

## Files

| File | Action |
|------|--------|
| `src/core/harness/parity-harness.ts` | Create (ParityHarness orchestrator) |
| `src/core/harness/kernel-adapter.ts` | Create (KernelAdapter interface + types) |
| `src/core/harness/wasm-kernel-adapter.ts` | Create (Playwright browser WASM adapter) |
| `src/core/harness/native-kernel-adapter.ts` | Create (gRPC native adapter) |
| `src/core/harness/script-parser.ts` | Create (script schema validation) |
| `src/core/harness/metric-extractor.ts` | Create (metric extraction) |
| `src/core/harness/comparator.ts` | Create (diff vs tolerance) |
| `src/core/harness/parity-report.ts` | Create (report types + writer) |
| `tests/unit/harness/script-parser.test.ts` | Create |
| `tests/unit/harness/metric-extractor.test.ts` | Create |
| `tests/unit/harness/comparator.test.ts` | Create |
| `tests/integration/harness/parity-harness.integration.test.ts` | Create (mock adapters) |
| `tests/e2e/harness/parity-harness.e2e.spec.ts` | Create (real WASM + real native) |

## Self-Review

- **Placeholder scan:** No TBDs. All interfaces and behaviors are concrete.
- **Internal consistency:** KernelAdapter interface matches both adapter implementations. MetricExtractor output feeds Comparator directly.
- **Scope check:** 13 files, ~600 lines total. Focused on parity comparison only; kernel fixes and SolidCraft adapter are explicitly out of scope.
- **Ambiguity check:** `shape_ids` reference prior steps by index (`step_0`) — explicit. Error handling is continue-and-report — explicit. Default tolerances are specified.
