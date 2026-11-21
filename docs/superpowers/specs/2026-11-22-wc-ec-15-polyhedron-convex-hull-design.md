# WC-EC-15 Design: Port Polyhedron and Convex Hull

**Ticket**: WC-EC-15 — Port: polyhedron and convex hull
**Priority**: medium · **Agent Suitability**: A · **Phase**: 2
**Depends on**: WC-EC-12 (Shape Metrics Parity)
**ADR**: 004 (Add `PolyhedronFace` + `faces` field to `CreatePolyhedronOp`)

---

## 1. Objective

Port `createPolyhedron` and `createConvexHull` from the WASM kernel (`OCCWorker.ts`) to the native C++ OCCT kernel behind the gRPC `Kernel.Execute` protocol. The WASM handler is the behavioral reference; the parity harness (WC-EC-12) and oracle suite (WC-EC-13) provide verification.

---

## 2. Architecture

### 2.1 Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `OpCreatePolyhedron` | `kernel-worker.cpp` | Build B-Rep solid from `(points, faces)` via MakeWire → MakeFace → Sewing → MakeSolid |
| `computeConvexHull3D` | `kernel-worker.cpp` | C++ port of WASM incremental 3D convex hull; returns triangular face index array |
| `OpCreateConvexHull` | `kernel-worker.cpp` | Runs `computeConvexHull3D` on points, delegates to `OpCreatePolyhedron` |
| `HandleCreatePolyhedron` | `kernel-worker.cpp` | gRPC handler: parse `CreatePolyhedronOp`, call `OpCreatePolyhedron`, attach `ShapeMetrics` |
| `HandleCreateConvexHull` | `kernel-worker.cpp` | gRPC handler: parse `CreateConvexHullOp` (incl. `shape_ids`), call `OpCreateConvexHull`, attach `ShapeMetrics` |
| `opMap` entries | `native-kernel-adapter.ts` | Map `create_polyhedron` / `create_convex_hull` step names to kernel ops |

### 2.2 Data Flow

```
Client script (create_polyhedron / create_convex_hull)
        │
        ▼
NativeKernelAdapter.buildExecuteRequest()
  → normalizes points/faces/shapeIds to protobuf wire format
        │
        ▼
Kernel.Execute (gRPC) → HandleCreatePolyhedron / HandleCreateConvexHull
        │
        ├─▶ OpCreatePolyhedron / OpCreateConvexHull
        │     ├─▶ computeConvexHull3D(points) → faces (convex hull only)
        │     ├─▶ Build wires → faces → sewing → solid
        │     ├─▶ OpCreateAndCache (mesh + g_shapeCache)
        │     └─▶ OpResult { ok, shapeId, message }
        │
        ├─▶ ComputeShapeMetrics(shape, response->mutable_metrics())
        │
        ▼
ExecuteResponse { success.polyhedron/convex_hull { shape_id }, metrics }
```

### 2.3 Proto Schema (ADR 004)

```protobuf
message PolyhedronFace {
  repeated int32 vertex_indices = 1;
}

message CreatePolyhedronOp {
  repeated Point3D points_inline = 1;
  BlobRef points_ref = 2;
  double deflection = 3;
  string entity_id = 4;
  repeated PolyhedronFace faces = 5;
}

message CreateConvexHullOp {
  repeated string shape_ids = 1;
  repeated Point3D points_inline = 2;
  BlobRef points_ref = 3;
  double deflection = 4;
  string entity_id = 5;
}
```

No changes to `common.proto`. `ExecuteResponse.metrics` (from WC-EC-12) is reused for both ops.

---

## 3. C++ Implementation Details

### 3.1 OpCreatePolyhedron

**Signature:**
```cpp
static OpResult OpCreatePolyhedron(
    const std::vector<gp_Pnt>& points,
    const std::vector<std::vector<int>>& faces,
    double deflection,
    const std::string& entityId);
```

**Algorithm (ported from WASM `createPolyhedron`, OCCWorker.ts lines 2051–2462):**

1. Validate: `points.size() >= 4`, `faces` not empty, `deflection > 0`.
2. Per face (`std::vector<int>` vertex indices):
   - Filter adjacent duplicate/coincident vertices (distance < 1e-7).
   - Skip faces with < 3 unique vertices.
   - Build `BRepBuilderAPI_MakeWire` from edges between consecutive vertices (last→first closes it).
   - Build `BRepBuilderAPI_MakeFace(wire, false)` — planar face.
   - Add face to `BRepBuilderAPI_Sewing(1e-4)`.
3. `sewing.Perform()` → sewed shape.
4. Extract solid from sewed shape:
   - If `TopAbs_SHELL`: add single shell to `BRepBuilderAPI_MakeSolid`.
   - Else: iterate `TopExp_Explorer(TopAbs_SHELL)` and add each shell.
   - Fallback to sewed shape if `MakeSolid` fails.
5. `OpCreateAndCache(shape, deflection, entityId)`.

**No translation**: Polyhedron points are already in absolute world-space coordinates (unlike primitives built at origin then translated).

### 3.2 computeConvexHull3D (C++ port of WASM)

**Signature:**
```cpp
std::vector<std::array<int, 3>> computeConvexHull3D(
    const std::vector<gp_Pnt>& points);
```

**Algorithm (deterministic — replaces `Math.random()` jitter with index-based micro-jitter):**

1. Guard: `points.size() < 4` → throw `std::runtime_error`.
2. **Deduplication**: Spatial hash / distance threshold (1e-5) to remove near-duplicate points. If `uniquePoints.size() < 4` → error.
3. **Deterministic micro-jitter**: Add `i * 1e-8` offset per coordinate based on point index (replaces WASM's `Math.random() * 1e-7`) for reproducibility.
4. **Initial tetrahedron**:
   - `i0` = leftmost point (min x).
   - `i1` = point farthest from `i0`.
   - `i2` = point farthest from line `(i0, i1)`.
   - `i3` = point farthest from plane `(i0, i1, i2)`.
   - If `i2 == -1 || i3 == -1 || maxPlaneDist < 1e-9` → throw (collinear/coplanar).
5. **Build 4 initial faces** oriented inward (center of tetrahedron is inside).
6. **Incremental insertion**: For each remaining point:
   - Find visible faces (signed distance > 1e-9).
   - Compute horizon edges (edges adjacent to exactly one visible face).
   - Remove visible faces, create new faces from each horizon edge + new point.
7. Return triangle vertex indices into the **original (un-jittered)** point array.

### 3.3 OpCreateConvexHull

**Signature:**
```cpp
static OpResult OpCreateConvexHull(
    const std::vector<gp_Pnt>& points,
    double deflection,
    const std::string& entityId);
```

1. Validate: `points.size() >= 4`, `deflection > 0`.
2. Call `computeConvexHull3D(points)` → `std::vector<std::array<int, 3>>` faces.
3. Convert to `std::vector<std::vector<int>>` for `OpCreatePolyhedron`.
4. Delegate to `OpCreatePolyhedron(points, faces, deflection, entityId)`.
5. On hull failure (collinear/coplanar), return `EXECUTION_FAILURE_CODE_OPERATION_FAILED`.

### 3.4 gRPC Handlers

**HandleCreatePolyhedron:** Parse `CreatePolyhedronOp` → extract `points_inline` (or `points_ref` blob), `faces` → call `OpCreatePolyhedron` → populate `success.polyhedron.shape_id` → attach `ShapeMetrics`.

**HandleCreateConvexHull:** Parse `CreateConvexHullOp` → extract `points_inline`/`points_ref` + optional `shape_ids` (merge vertices from cached shapes via face triangulation) → call `OpCreateConvexHull` → populate `success.convex_hull.shape_id` → attach `ShapeMetrics`.

### 3.5 CLI Mode

Add `create_polyhedron` and `create_convex_hull` branches parsing JSON:
- `create_polyhedron`: `points` (array of `[x,y,z]`), `faces` (array of index arrays), `deflection`, `entity_id`.
- `create_convex_hull`: `points` (array), optional `shape_ids` (array of cached IDs), `deflection`, `entity_id`.

---

## 4. NativeKernelAdapter

Add to `opMap` in `src/core/harness/native-kernel-adapter.ts`:
```typescript
create_polyhedron: 'create_polyhedron',
create_convex_hull: 'create_convex_hull',
```

**Parameter normalization** in `buildExecuteRequest`:
- `points` / `points_inline` → `Point3D[]` (`{ x, y, z }`)
- `faces` → `PolyhedronFace[]` (`{ vertex_indices: number[] }`)
- `shapeIds` → `shape_ids` (`string[]`)

This ensures both `WasmKernelAdapter` and `NativeKernelAdapter` can execute the same fixture scripts.

---

## 5. Testing

### 5.1 Oracle Reference Parts (`tests/fixtures/oracle/`)

1. **`tetrahedron.json`**: 4 points → convex hull = tetrahedron.
   - Points: (0,0,0), (1,0,0), (0,1,0), (0,0,1)
   - Expected: V≈0.167, surfaceArea≈2.366, faces=4, edges=6, vertices=4, valid=true

2. **`cube_from_hull.json`**: 8 cube corner points → convex hull = cube.
   - Points: all 8 corners of [0,1]³
   - Expected: V=1.0, surfaceArea=6.0, faces=6, edges=12, vertices=8, valid=true

3. **`irregular_polyhedron.json`**: Custom (points, faces) → OpCreatePolyhedron direct test.
   - Expected: metrics match analytic values within tolerance.

### 5.2 Unit Tests (`tests/oracle/oracle-runner.test.ts`)

- Mock `KernelAdapter`: verify pass/fail conditions, tolerance boundaries, delta reporting.
- Test `evaluateMetrics` with exact match, relative diff, bbox absolute diff.

### 5.3 Live Integration (`tests/oracle/native-oracle.integration.test.ts`)

- Add 3 new reference parts to the corpus (total: 7).
- Run against `localhost:50051`, assert `passedParts === totalParts` and `failedParts === 0`.

---

## 6. Error Handling

| Condition | Failure Code | Message |
|-----------|-------------|---------|
| `points.size() < 4` (convex hull) | `INVALID_PARAMETER` | "Convex hull requires at least 4 points" |
| Collinear/coplanar points | `OPERATION_FAILED` | "Points are collinear or coplanar; cannot build 3D hull" |
| Empty faces (polyhedron) | `INVALID_PARAMETER` | "Polyhedron requires at least one face" |
| Face with < 3 unique vertices | skip (logged) | — |
| Sewing fails | `OPERATION_FAILED` | "Polyhedron: sewing failed" |
| MakeSolid fails | `OPERATION_FAILED` | "Polyhedron: failed to build solid" |
| `shape_ids` entity not found | `MISSING_ENTITY` | "Shape not found in cache: ..." |

---

## 7. Definition of Done

- [ ] ADR 004 created and committed
- [ ] `engine.proto` updated with `PolyhedronFace` + `faces` field
- [ ] `npm run buf:lint` passes
- [ ] `npm run buf:generate` regenerates TS/C++ stubs
- [ ] `OpCreatePolyhedron`, `computeConvexHull3D`, `OpCreateConvexHull` implemented in `kernel-worker.cpp`
- [ ] `HandleCreatePolyhedron`, `HandleCreateConvexHull` added to `KernelServiceImpl::Execute` switch
- [ ] CLI mode branches for `create_polyhedron` / `create_convex_hull`
- [ ] `kernel_worker` recompiled in container (~3s Ninja build) and restarted
- [ ] `NativeKernelAdapter.opMap` entries added
- [ ] `npx tsc --noEmit` passes (0 new errors)
- [ ] `npx vitest run tests/oracle` passes (100%)
- [ ] Live integration test passes against `localhost:50051`
- [ ] `WEBCAD-EPIC-EC-v5.md` updated: WC-EC-15 tasks marked ✓
- [ ] All commits pushed to `dev`