# WC-EC-22 Loft Design — Port createLoft to Native OCCT Kernel

## Overview

Port the proto-defined `CreateLoftOp` (field 24) to the native OCCT kernel (`kernel-worker.cpp`). The operation lofts a sequence of cross-section wires (or point/vertex apices) into a solid or shell using `BRepOffsetAPI_ThruSections`.

## Proto (Already Defined)

`CreateLoftOp` — field 24 in `ExecuteRequest` oneof, already present in `engine.proto`:

```
message CreateLoftOp {
  repeated LoftProfile profiles = 1;
  bool is_solid = 2;
  bool is_ruled = 3;
  double deflection = 4;
  string entity_id = 5;
}
message LoftProfile { string id = 1; repeated Point3D points = 2; bool closed = 3; }
message LoftResult { string shape_id = 1; }
```

No proto changes needed.

## Design

### 1. OpCreateLoft — `kernel-worker.cpp`

A new static function `OpCreateLoft(...)` implementing `BRepOffsetAPI_ThruSections`:

**Section building:**
1. For each `LoftProfile`:
   - If `id` is non-empty → look up cached shape via `GetCachedShape(id)`, extract its wire(s). `points` is ignored (UI sends both for every profile; `id` wins).
   - Else if `points` is non-empty → build a `TopoDS_Wire` from consecutive points; close if `closed == true`; if a single point and `closed == false`, treat as a vertex apex
   - Else (neither `id` nor `points`) → error INVALID_PARAMETER
2. Single-point non-closed profile → `TopoDS_Vertex` (apex) via `BRepBuilderAPI_MakeVertex`
3. Multi-point wire → `BRepBuilderAPI_MakeWire` + `BRepBuilderAPI_MakeEdge` per consecutive pair; close last→first if `closed`
4. Wire connectivity: `ShapeFix_Wire` `FixReorder()` + `FixConnected()` (same as sweep)

**Loft construction:**
1. `BRepOffsetAPI_ThruSections aLoft(is_solid, is_ruled, 1.0e-6)`
2. For each wire section: `aLoft.AddWire(sectionWire)`
3. For each vertex apex: `aLoft.AddVertex(apexVertex)`
4. `aLoft.CheckCompatibility(Standard_True)`
5. `aLoft.Build()`
6. If `!IsDone()` → return `EXECUTION_FAILURE_CODE_OPERATION_FAILED`
7. `EnsurePositiveVolume(shape)` (reverse if negative volume)
8. Return `aLoft.Shape()`

**Result:** Cache via `OpCreateAndCache(shape, deflection, entityId)`.

### 2. Handler & Dispatcher — `kernel-worker.cpp`

- Add `Status HandleCreateLoft(const ExecuteRequest*, ExecuteResponse*)` that extracts proto fields, calls `OpCreateLoft`, populates `LoftResult` + `ShapeMetrics`
- Add `case ExecuteRequest::kCreateLoft: return HandleCreateLoft(request, response);` to `Execute()` switch

### 3. Adapter — `native-kernel-adapter.ts`

- Add `create_loft: 'create_loft'` to `opMap`
- No parameter normalization needed (proto field names already match: `profiles`, `is_solid`, `is_ruled`, `deflection`, `entity_id`)

### 4. Testing

- `tests/fixtures/oracle/loft_simple.json` — 3 rectangular cross-sections of decreasing size along Z (40×30 at Z=0, 28×22 at Z=20, 18×14 at Z=45), `is_solid=true`, `is_ruled=false`, expect valid solid with positive volume
- `tests/fixtures/oracle/loft_apex.json` — 2 wire profiles + 1 vertex apex at end, `is_solid=true`, expect valid solid (cone-like)
- Existing oracle integration test auto-discovers new fixtures via `runner.loadFixtures()`

## Error Handling

| Condition | Code | Message |
|-----------|------|---------|
| No profiles | INVALID_PARAMETER | "Loft: profiles list is empty" |
| Profile with neither `id` nor `points` | INVALID_PARAMETER | "LoftProfile N: must specify id or points" |
| Cached shape lookup failure | INVALID_PARAMETER | "LoftProfile N: referenced shape id not found" |
| Cached shape is not a wire/vertex | INVALID_PARAMETER | "LoftProfile N: referenced shape is not a wire or vertex" |
| Wire build failure | OPERATION_FAILED | "LoftProfile N: failed to build wire" |
| `BRepOffsetAPI_ThruSections` not done | OPERATION_FAILED | "Loft: BRepOffsetAPI_ThruSections failed" |
| Null result shape | GEOMETRY_EMPTY | "Loft: resulting shape is null" |
| OCCT `Standard_Failure` | OPERATION_FAILED | with exception message |

All OCCT `Standard_Failure` and `std::exception` caught in `Execute()` and converted to in-band `ExecuteFailure` — no gRPC errors thrown.

## Files Changed

- `src/core/gateway/kernel-worker.cpp` — `OpCreateLoft`, `HandleCreateLoft`, switch case
- `src/core/harness/native-kernel-adapter.ts` — opMap entry
- `tests/fixtures/oracle/loft_simple.json` — new fixture
- `tests/fixtures/oracle/loft_apex.json` — new fixture
