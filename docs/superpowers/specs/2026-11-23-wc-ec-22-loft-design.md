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

**Section building (per profile, in order):**
1. If `id` is non-empty → look up cached shape via `g_shapeCache[id]`. `points` is ignored (UI sends both for every profile; `id` wins).
   - If shape not found in cache → `MISSING_ENTITY` (not `INVALID_PARAMETER`).
   - If shape is null → `GEOMETRY_EMPTY`.
   - If shape is a `FACE` → use `BRepTools::OuterWire(face)` for the outer wire.
   - If shape is a `WIRE` → add its wire.
   - If shape is a `VERTEX` → add its vertex.
   - Otherwise → `INVALID_PROFILE`.
2. Else if `points` is non-empty:
   - If empty → `INVALID_PROFILE`.
   - Single point, not closed → vertex apex via `BRepBuilderAPI_MakeVertex`; check `IsDone()` before using result.
   - Multi-point → build wire from consecutive `BRepBuilderAPI_MakeEdge` calls; close last→first if `closed`.
   - Check `IsDone()` on each edge builder before using `.Edge()`; degenerate input → `INVALID_PROFILE`.
   - No `ShapeFix_Wire` (dropped for parity with WASM loft handler).
3. Else (neither `id` nor `points`) → `INVALID_PROFILE`.

**Loft construction:**
1. `BRepOffsetAPI_ThruSections aLoft(is_solid, is_ruled, 1.0e-6)`
2. For each profile section (in order): `aLoft.AddWire(wire)` or `aLoft.AddVertex(vertex)`
3. No `CheckCompatibility(true)` (not in WASM handler; OCCT default behavior is sufficient).
4. `aLoft.Build()`
5. If `!IsDone()` → `OPERATION_FAILED`
6. Null result → `GEOMETRY_EMPTY`
7. `EnsurePositiveVolume(shape)` only when `isSolid == true` AND shape is `TopAbs_SOLID` (volume meaningless for shells).
8. `BRepCheck_Analyzer` validity check on result → `OPERATION_FAILED` if invalid.
   - Solid-closing fallback: intentionally omitted. `ThruSections` with `is_solid=true` returns a `SOLID` even for open wires; validity is confirmed via `BRepCheck` rather than a speculative cap-and-sew fallback.

**Result:** Cache via `OpCreateAndCache(shape, deflection, entityId)`. Empty `entity_id` → auto-generated `"shape_N"` ID (handled by `CacheShape`); result is still returned but not cached under a client-provided name.

### 2. Handler & Dispatcher — `kernel-worker.cpp`

- Add `Status HandleCreateLoft(const ExecuteRequest*, ExecuteResponse*)` that extracts proto fields, calls `OpCreateLoft`, populates `LoftResult` + `ShapeMetrics`
- Add `case ExecuteRequest::kCreateLoft: return HandleCreateLoft(request, response);` to `Execute()` switch

### 3. Adapter — `native-kernel-adapter.ts`

- Add `create_loft: 'create_loft'` to `opMap`
- No parameter normalization needed (proto field names already match: `profiles`, `is_solid`, `is_ruled`, `deflection`, `entity_id`)

### 4. Testing

**Oracle fixtures:**

| Fixture | Sections | is_solid | is_ruled | Expected volume | Oracle type |
|---------|----------|----------|----------|-----------------|-------------|
| `loft_simple.json` | 3 rectangles: 40×30 @Z=0, 28×22 @Z=20, 18×14 @Z=45 | true | false | 28356.667 | Closed form (prismatoid) |
| `loft_apex.json` | 2 wire profiles + 1 vertex apex | true | true | Valid solid | Parity vs WASM |
| `loft_apex_pyramid.json` | Rectangle base + apex vertex | true | true | A·h/3 | Closed form (pyramid) |

- Existing oracle integration test auto-discovers new fixtures via `runner.loadFixtures()`.
- Volume assertions use `expect(volume).toBeCloseTo(expected, 5)` with delta printed.
- Smooth loft (27812.316) kept for WASM parity, not as an oracle.

## Error Handling

| Condition | Code | Message |
|-----------|------|---------|
| No profiles | INVALID_PARAMETER | "Loft: profiles list is empty" |
| Profile with neither `id` nor `points` | INVALID_PROFILE | "LoftProfile N: must specify id or points" |
| Cached shape id not found | MISSING_ENTITY | "LoftProfile N: referenced shape id not found: ..." |
| Cached shape is null | GEOMETRY_EMPTY | "LoftProfile N: referenced shape is null: ..." |
| Cached shape is not wire/face/vertex | INVALID_PROFILE | "LoftProfile N: referenced shape is not a wire, face, or vertex: ..." |
| Face has no outer wire | INVALID_PROFILE | "LoftProfile N: face has no outer wire: ..." |
| Edge build failure (degenerate points) | INVALID_PROFILE | "LoftProfile N: failed to build edge (degenerate input)" |
| Wire build failure | INVALID_PROFILE | "LoftProfile N: failed to build wire (degenerate input)" |
| Vertex build failure | INVALID_PROFILE | "LoftProfile N: failed to build vertex" |
| `BRepOffsetAPI_ThruSections` not done | OPERATION_FAILED | "Loft: BRepOffsetAPI_ThruSections failed" |
| Result shape failed BRepCheck | OPERATION_FAILED | "Loft: resulting shape failed BRepCheck validity" |
| Null result shape | GEOMETRY_EMPTY | "Loft: resulting shape is null" |
| OCCT `Standard_Failure` | OPERATION_FAILED | with exception message |

All OCCT `Standard_Failure` and `std::exception` caught in `Execute()` and converted to in-band `ExecuteFailure` — no gRPC errors thrown.

## Files Changed

- `src/core/gateway/kernel-worker.cpp` — `OpCreateLoft`, `HandleCreateLoft`, switch case, added `BRepTools.hxx` include
- `src/core/harness/native-kernel-adapter.ts` — opMap entry
- `tests/fixtures/oracle/loft_simple.json` — new fixture (ruled prismatoid, 28356.667)
- `tests/fixtures/oracle/loft_apex.json` — new fixture (smooth loft, WASM parity)
- `tests/fixtures/oracle/loft_apex_pyramid.json` — new fixture (ruled apex pyramid, V = A·h/3)
