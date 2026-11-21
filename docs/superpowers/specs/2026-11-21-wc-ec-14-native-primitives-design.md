# WC-EC-14 Design: Native OCCT Primitive Port

**Ticket:** WC-EC-14 | Port: simple primitives (box, cylinder, frustum, sphere, cone, torus, wedge, pyramid)
**Priority:** High | **Phase:** Phase 2 | **Agent Suitability:** A
**Depends on:** WC-EC-12 (Parity harness), WC-EC-13 (Oracle suite)
**Branch:** `dev` at `C:\Dev\webcad`

---

## 1. Context

WC-EC-12 built a parity harness comparing WASM vs native OCCT kernels. WC-EC-13 built a reference-parts oracle suite. The native C++ kernel (`src/core/gateway/kernel-worker.cpp`) currently only handles `create_box` — the other 7 simple primitives have proto definitions and WASM implementations but no C++ kernel handler.

The `NativeKernelAdapter.opMap` covers box, cylinder, sphere, cone, torus — but not frustum, wedge, pyramid. Any script step using those ops against the native kernel will fail with no matching handler.

## 2. Decision

Port all 7 remaining primitives (cylinder, frustum, sphere, cone, torus, wedge, pyramid) to the C++ kernel in a single change, matching WASM behavior exactly (create at origin → translate if x,y,z ≠ 0 → mesh → cache → compute metrics).

Introduce a shared `OpCreateAndCache()` helper to eliminate per-primitive boilerplate for translation, meshing, caching, and metric computation.

## 3. Architecture

### 3.1 Components

| Component | Responsibility |
|-----------|---------------|
| `OpCreateAndCache(shape, x, y, z, deflection, entityId)` | Translate (if needed), mesh, cache in g_shapeCache, compute ShapeMetrics |
| `OpCreateCylinder(...)` | BRepPrimAPI_MakeCylinder(r, h, 2π) → OpCreateAndCache |
| `OpCreateFrustum(...)` | BRepPrimAPI_MakeCone(r1, r2, h) → OpCreateAndCache (cylinder if r1≈r2) |
| `OpCreateSphere(...)` | BRepPrimAPI_MakeSphere(r) → OpCreateAndCache |
| `OpCreateCone(...)` | BRepPrimAPI_MakeCone(r, 0, h) → OpCreateAndCache |
| `OpCreateTorus(...)` | BRepPrimAPI_MakeTorus(r1, r2) → OpCreateAndCache |
| `OpCreateWedge(...)` | Manual polyhedron via BRepBuilderAPI + sewing → OpCreateAndCache |
| `OpCreatePyramid(...)` | BRepOffsetAPI_ThruSections (wire → vertex) → OpCreateAndCache |
| `Execute()` switch | Add 7 new cases: kCreateCylinder, kCreateFrustum, ..., kCreatePyramid |
| `NativeKernelAdapter.opMap` | Add create_frustum, create_wedge, create_pyramid |

### 3.2 Data Flow

```
NativeKernelAdapter.execute(step: create_cylinder)
  → gRPC ExecuteRequest { op: create_cylinder, r: 5, h: 10, x: 1, y: 2, z: 3, ... }
  → KernelServiceImpl::Execute() → case kCreateCylinder → HandleCreateCylinder()
  → OpCreateCylinder(r, h, x, y, z, deflection, entityId)
    → BRepPrimAPI_MakeCylinder(r, h, 2π).Shape()
    → OpCreateAndCache(shape, 1, 2, 3, deflection, entityId)
      → gp_Trsf translation (1,2,3) → BRepBuilderAPI_Transform
      → BRepMesh_IncrementalMesh(shape, deflection)
      → g_shapeCache[entityId] = shape
      → ComputeShapeMetrics(shape, response.mutable_metrics())
  → ExecuteResponse { success: { shape_id }, metrics: { volume, area, bbox, ... } }
  → NativeKernelAdapter.parseExecuteResponse() → KernelResult
```

### 3.3 Error Handling

- OCCT `Standard_Failure` → `EXECUTION_FAILURE_CODE_OPERATION_FAILED` with OCCT message
- `!maker.IsDone()` → `EXECUTION_FAILURE_CODE_OPERATION_FAILED`
- `shape.IsNull()` → `EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY`
- Invalid dimensions (wedge dx/dy/dz ≈ 0) → `EXECUTION_FAILURE_CODE_INVALID_PARAMETER`

## 4. Files Changed

### `src/core/gateway/kernel-worker.cpp`

- Add helper `OpCreateAndCache(TopoDS_Shape shape, double x, y, z, double deflection, const string& entityId)`
- Add `OpCreateCylinder`, `OpCreateFrustum`, `OpCreateSphere`, `OpCreateCone`, `OpCreateTorus`, `OpCreateWedge`, `OpCreatePyramid`
- Add 7 cases to `Execute()` switch
- Wire `ComputeShapeMetrics()` call via `OpCreateAndCache` (already implemented from WC-EC-12)

No new includes needed — all OCCT headers for these primitives are already present:
- `BRepPrimAPI_MakeCylinder`, `BRepPrimAPI_MakeSphere`, `BRepPrimAPI_MakeCone`, `BRepPrimAPI_MakeTorus`, `BRepPrimAPI_MakeWedge`, `BRepPrimAPI_MakePrism`, `BRepPrimAPI_MakeRevol` — already included
- `BRepBuilderAPI_MakeWire`, `BRepBuilderAPI_MakeEdge`, `BRepBuilderAPI_MakeFace`, `BRepBuilderAPI_Sewing`, `BRepBuilderAPI_MakeSolid` — already included
- `BRepOffsetAPI_ThruSections` — already included (via BRepPrimAPI_MakeRevol include chain)

### `src/core/harness/native-kernel-adapter.ts`

- Add `create_frustum: 'create_frustum'`, `create_wedge: 'create_wedge'`, `create_pyramid: 'create_pyramid'` to `opMap`

## 5. No Proto Changes

All primitive op messages (`CreateCylinderOp` through `CreatePyramidOp`) and `ShapeMetrics` are already defined in `proto/`. No ADR or `buf generate` needed.

## 6. Testing

| Check | Command | Expected |
|-------|---------|----------|
| TypeScript compile | `npx tsc --noEmit` | 0 errors |
| Unit tests (harness) | `npx vitest run tests/harness` | All pass |
| Lint | `npx eslint src/core/harness/` | 0 errors |

**Note:** The Docker container `webcad-kernel-test` runs the old binary (user forbade rebuild). Live integration tests against `localhost:50051` will test against the pre-WC-EC-14 binary and will not exercise the new C++ handlers until the container is redeployed.

## 7. Consequences

- Positive: All 8 primitives now available on native kernel; parity harness can compare all ops
- Positive: `ComputeShapeMetrics` automatically called for all shapes via `OpCreateAndCache`
- Neutral: ~200 lines added to kernel-worker.cpp, ~3 lines to adapter
- Negative: Docker binary not updated (user constraint) — integration validation deferred

---

## Spec Self-Review

1. **Placeholder scan:** No TBDs or incomplete sections.
2. **Internal consistency:** Architecture matches feature description; helper function reduces duplication; opMap additions match proto definitions.
3. **Scope check:** Focused on 7 primitives + helper + adapter opMap. 2 files changed (~203 lines). Within 15-file / 600-line limit.
4. **Ambiguity check:** Translation behavior explicitly matches WASM (create at origin → translate). Error codes consistent with existing patterns.

---

**Next step:** Invoke writing-plans skill to create the implementation plan.