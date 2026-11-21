# ADR 003: Shape Metrics for Parity Harness (WC-EC-12)

## Context

The WC-EC-12 parity harness compares geometric results between the WASM worker and the native OCCT kernel. The WASM adapter returns metrics (volume, surface area, bounding box, topology counts, validity), but the native kernel adapter returns `metrics: {}` because `ExecuteResponse` does not carry shape metrics. This causes the comparator to emit errors like `"volume missing from one kernel"` and prevents meaningful geometric verification.

## Decision

Add a `ShapeMetrics` message to `common.proto` and attach it as an optional field on `ExecuteResponse` in `engine.proto`. The native C++ kernel computes volume, surface area, bounding box, face/edge/vertex counts, and validity using OCCT's `BRepGProp`, `BRepBndLib`, `TopExp_Explorer`, and `BRepCheck_Analyzer`, and populates the field on every successful shape-creation operation.

## Consequences

### Positive
- Parity harness can perform automated geometric verification (volume, surface area, bbox, counts, validity) between WASM and native kernels.
- No breaking change to existing RPCs; `metrics` is optional and defaults to empty/zero.
- Metrics are computed at kernel side with zero client overhead.

### Negative
- Requires protobuf change (ADR required per project rules) and regeneration of TS + C++ stubs.
- Kernel worker binary must be rebuilt and redeployed.
- Adds minor compute cost to each shape creation (negligible for typical CAD operations).

## Scope

- `proto/webcad/engine/v1/common.proto`: Add `BoundingBox3D` and `ShapeMetrics` messages.
- `proto/webcad/engine/v1/engine.proto`: Add `ShapeMetrics metrics = 6;` to `ExecuteResponse`.
- `src/core/gateway/kernel-worker.cpp`: Add `ComputeShapeMetrics()` helper; call from `HandleCreateBox` (and other shape creation handlers as needed).
- `src/core/harness/native-kernel-adapter.ts`: Parse `ShapeMetrics` from `ExecuteResponse` into `KernelMetric`.
- `src/generated/`: Regenerated via `npm run buf:generate` (not hand-edited).
