# WC-EC-21 Sweep Design — Port createSweep to Native OCCT Kernel

## Overview

Port the WASM `createSweep` operation (`OCCWorker.ts` lines 2865-3542) to the native OCCT kernel (`kernel-worker.cpp`). The operation sweeps a 2D profile along a 3D spine path, optionally capping the ends into a solid.

## Proto (Already Defined)

`CreateSweepOp` — field 23 in `ExecuteRequest` oneof, already present in `engine.proto`:

```
message CreateSweepOp {
  repeated Point3D profile_points = 1;
  repeated Point3D spine_points = 2;
  bool is_solid = 3;
  double deflection = 4;
  string entity_id = 5;
  int32 profile_count = 6;
  string corner_mode = 7;   // "DEFAULT" | "MITER" | "ROUND"
  bool is_ellipse = 8;
}
message SweepResult { string shape_id = 1; }
```

No proto changes needed.

## Design

### 1. OpCreateSweep — `kernel-worker.cpp`

A new static function `OpCreateSweep(...)` that implements two sweep paths with fallback:

**Path A — `BRepOffsetAPI_MakePipeShell` (primary):**
1. Build spine `TopoDS_Wire` from `spine_points` (consecutive points → edges → wire)
2. Build profile wire from first `profile_count` points of `profile_points`; close wire if `is_solid`
3. `BRepOffsetAPI_MakePipeShell aPipe(spineWire)`
4. Set transition mode from `corner_mode`: `"MITER"`→`RightCorner`, `"ROUND"`→`RoundCorner`, default→`Transformed`
5. Set orientation mode: try `SetDiscreteMode()` first; if fails and spine is flat (all Z equal), `SetMode(gp_Dir(0,0,1))`; else `SetMode(false)`
6. `aPipe.Add(profileWire, false, false)`
7. `aPipe.Build()`
8. If `is_solid` and `IsDone()`: `aPipe.MakeSolid()`
9. Return `aPipe.Shape()` if `IsDone()`, else error

**Path B — `BRepOffsetAPI_ThruSections` + RMF frames (fallback):**
1. Compute tangents at each spine point (forward/backward/central differences)
2. Compute RMF frames via Double Reflection Method at each spine point
3. Transform profile points into each frame → section wire points
4. Build each section wire
5. `BRepOffsetAPI_ThruSections aThru(is_solid, true, 1e-6)`
6. `aThru.AddWire(sectionWire)` for each section
7. `aThru.Build()`
8. Return `aThru.Shape()` if `IsDone()`, else error

**Fallback logic:** Try Path A first. On `!IsDone()` or `Standard_Failure`, try Path B. On both failing, return `EXECUTION_FAILURE_CODE_OPERATION_FAILED`.

**Result:** Cache via `OpCreateAndCache(shape, deflection, entityId)`.

### 2. Handler & Dispatcher — `kernel-worker.cpp`

- Add `Status HandleCreateSweep(const ExecuteRequest*, ExecuteResponse*)` that extracts proto fields, calls `OpCreateSweep`, populates `SweepResult` + `ShapeMetrics` + optional `MeshData` (matching `HandleMakeThickSolid` pattern)
- Add `case ExecuteRequest::kCreateSweep: return HandleCreateSweep(request, response);` to `Execute()` switch

### 3. Adapter — `native-kernel-adapter.ts`

- Add `create_sweep: 'create_sweep'` to `opMap`

### 4. Testing

- `tests/fixtures/oracle/sweep_simple.json` — circle profile swept along straight spine, expect valid solid
- `tests/fixtures/oracle/sweep_corner.json` — profile swept along bent spine (line + arc), expect valid solid
- Existing oracle integration test auto-discovers new fixtures via `runner.loadFixtures()`
- Test results exported as STEP files to `/doc/result/` for visual/geometric verification

## Error Handling

All OCCT `Standard_Failure` and `std::exception` caught in `Execute()` and converted to in-band `ExecuteFailure` — no gRPC errors thrown. Input validation (empty points, insufficient spine/profile points) returns `EXECUTION_FAILURE_CODE_INVALID_PARAMETER`.

## Files Changed

- `src/core/gateway/kernel-worker.cpp` — `OpCreateSweep`, `HandleCreateSweep`, switch case
- `src/core/harness/native-kernel-adapter.ts` — opMap entry
- `tests/fixtures/oracle/sweep_simple.json` — new fixture
- `tests/fixtures/oracle/sweep_corner.json` — new fixture
