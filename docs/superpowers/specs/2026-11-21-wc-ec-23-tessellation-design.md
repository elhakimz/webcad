# WC-EC-23 Design: Port Tessellation to Binary Buffers

**Status:** Draft — pending user approval  
**Ticket:** WC-EC-23 | Port: tessellation to binary buffers  
**Priority:** High | Phase 2  
**Author:** OpenWolf agent (autonomous)

## 1. Problem Statement

The native OCCT C++ kernel (`src/core/gateway/kernel-worker.cpp`) already creates `BRepMesh_IncrementalMesh` triangulation inside `OpCreateAndCache`, but discards the resulting mesh data. The `MeshData` message in `ExecuteResponse` (field 4) is populated only with a TODO placeholder:

```cpp
// Optional MeshData (populated later from triangulation)
if (request->include_brep()) {
  auto* meshData = response->mutable_mesh();
  // TODO: populate MeshData positions/indices from shape triangulation
}
```

The browser renderer needs `MeshData` (positions + indices + face mapping + edge lines) to render CAD shapes in the Three.js viewport. Without tessellation data from the kernel, the renderer cannot display native-kernel-created shapes.

## 2. Goals

1. **Populate `MeshData`** in `ExecuteResponse.mesh` for every shape-creating operation in the native kernel.
2. **Reuse existing triangulation**: `OpCreateAndCache` already runs `BRepMesh_IncrementalMesh`; extract positions/indices from that triangulation instead of re-meshing.
3. **Deterministic output**: Same shape + same deflection → byte-identical `MeshData` across calls (no random jitter, fixed vertex ordering).
4. **Match WASM output**: The C++ kernel's `MeshData` should be structurally equivalent to the WASM `shapeToBufferGeometryData` output (same field layouts, same coordinate space).
5. **No protocol changes**: `MeshData` proto message already exists with all needed fields.

## 3. Non-Goals (out of scope for WC-EC-23)

- Changing the `MeshData` proto schema (fields already exist: positions, indices, face_mapping, edge_offsets, edge_lines).
- Streaming large meshes via `StreamResult` RPC (inline limit of 4 MiB is sufficient for current use cases).
- Changing how `deflection` is computed — each operation request already carries a `deflection` field.
- Modifying the WASM `OCCWorker.ts` side.

## 4. Approach: Option B — Helper Function in kernel-worker.cpp

Add a static helper function `PopulateMeshData(TopoDS_Shape, double, MeshData*)` in `kernel-worker.cpp` that extracts triangulation data from a shape and fills the protobuf `MeshData` message. Call it from every `HandleCreate*` handler after `ComputeShapeMetrics`.

### Why Option B over A or C:

- **Option A** (inline in each handler): ~20 handlers would each duplicate ~60 lines of tessellation extraction code. Unmaintainable.
- **Option C** (separate `tessellation.cpp`/`.h`): Clean separation but premature — the helper is ~100 lines and tightly coupled to the kernel's `g_shapeCache` lifecycle. Can extract later if needed.
- **Option B** (helper in kernel-worker.cpp): Single implementation, follows existing code conventions (`ComputeShapeMetrics` is already a static helper in the same file), easy to unit-test via the kernel binary, no new files.

## 5. Components

### 5.1 `PopulateMeshData` Helper (new, in kernel-worker.cpp)

```cpp
static void PopulateMeshData(const TopoDS_Shape& shape, double deflection,
                              webcad::engine::v1::MeshData* meshData);
```

**Behavior:**
1. **Triangulation reuse check:** Scan all faces via `TopExp_Explorer`; if any face lacks a valid `BRep_Tool::Triangulation`, run `BRepMesh_IncrementalMesh(shape, deflection, Standard_False, 0.5, Standard_False)`. If `IsDone()` is false, log a warning and return without populating (meshData remains empty). If all faces already triangulated, skip meshing entirely.
2. First pass: iterate all faces via `TopExp_Explorer`, count total nodes and triangles using `BRep_Tool::Triangulation`.
3. Pre-size internal buffers: positions (float32 xyz triplets), indices (uint32 triangle indices), faceMapping (int32 per-triangle face index), edgeLines (vector of float32 XYZ triplets per edge segment).
4. Second pass: iterate faces again, for each face:
   - Get `TopLoc_Location` transformation and apply to node coordinates.
   - Append node XYZ as float32 triplets to positions buffer.
   - For each triangle, retrieve indices via `Poly_Triangle::Get(n1, n2, n3)` (1-based in OCCT), subtract 1, add vertex offset, append as uint32 to indices buffer. Handle face orientation (swap n2/n3 for non-FORWARD faces, matching WASM).
   - Append face index to faceMapping.
   - Increment vertexOffset and faceCounter.
5. Third pass: iterate all edges via `TopExp_Explorer`, for each edge:
   - Get `BRep_Tool::Polygon3D` — if non-null, extract node XYZ as packed float32 triplets `[x1,y1,z1, x2,y2,z2, ...]`.
   - If null, fall back to `BRepAdaptor_Curve` sampling (10 samples) matching WASM fallback.
   - Append edge segment endpoints as `[x1,y1,z1, x2,y2,z2, ...]` to edgeLines.
   - Record cumulative float count in edgeOffsets: `offsets[0] = 0`, `offsets[k+1] = offsets[k] + numFloatsInEdgeK`. For N edges, offsets has N+1 elements; empty edges produce consecutive equal offsets.
6. Serialize buffers to protobuf `bytes` fields:
   - `set_positions(reinterpret_cast<const char*>(posBuf.data()), posBuf.size())`
   - `set_indices(reinterpret_cast<const char*>(idxBuf.data()), idxBuf.size())`
   - `set_face_mapping(reinterpret_cast<const char*>(fmBuf.data()), fmBuf.size())`
   - `set_edge_offsets(reinterpret_cast<const char*>(eoBuf.data()), eoBuf.size())`
   - `set_edge_lines(reinterpret_cast<const char*>(elBuf.data()), elBuf.size())`

**Determinism guarantees:**
- `BRepMesh_IncrementalMesh` with fixed deflection is deterministic for a given shape.
- Face iteration order via `TopExp_Explorer` is deterministic (OCCT preserves shape topology order).
- Node/triangle ordering within each triangulation is deterministic.
- No `Math.random()` or equivalent (unlike WASM convex hull which jitters — not relevant here).

### 5.2 Call Sites (modified, in kernel-worker.cpp)

Every `HandleCreate*` handler that ends with `ComputeShapeMetrics` should add a mesh population call after it. The condition `if (request->include_brep())` should remain — mesh data is opt-in per request, matching the existing pattern.

Handlers to modify:
- `HandleCreateBox` (already has the TODO — replace it)
- `HandleCreateCylinder`
- `HandleCreateSphere`
- `HandleCreateCone`
- `HandleCreateTorus`
- `HandleCreateWedge`
- `HandleCreatePyramid`
- `HandleCreatePolyhedron`
- `HandleCreateConvexHull`
- `HandleCreateExtrude`
- `HandleCreateRevolve`
- `HandleCreateCompound`
- `HandleCreateBoolean`
- `HandleCreateSweep`
- `HandleCreateLoft`
- `HandleMultMatrixShape`
- `HandleTransformShape`
- `HandleRotateShape`
- `HandleMirrorShape`
- `HandleScaleShape`
- `HandleFilletSolid`
- `HandleChamferSolid`
- `HandleFilletSolidFace`
- `HandleChamferSolidFace`
- `HandleMakeThickSolid`
- `HandleDraftSolidFaces`

Pattern in each handler (after `ComputeShapeMetrics`):

```cpp
// MeshData — opt-in tessellation output
if (request->include_brep()) {
  auto it = g_shapeCache.find(r.shapeId);
  if (it != g_shapeCache.end()) {
    double deflection = op.deflection() > 0.0 ? op.deflection() : 0.1;
    PopulateMeshData(it->second, deflection, response->mutable_mesh());
  }
}
```

Where `op` is the operation request message (e.g. `request->create_box()`). For transform handlers that receive `request` directly, use `request->deflection()`.

### 5.3 Deflection Handling

Per user decision: **Use request deflection if provided (> 0), otherwise default to 0.1.**

This matches the WASM behavior (`deflection || 0.1`).

## 6. Data Flow

```
Client ExecuteRequest
    ├── include_brep = true
    ├── op.create_box { ..., deflection: 0.1, entity_id: "box1" }
    └── ...

Kernel: HandleCreateBox
    ├── OpCreateBox(...) → creates TopoDS_Shape, caches in g_shapeCache
    ├── ComputeShapeMetrics(shape, response->mutable_metrics())
    └── if (include_brep):
            PopulateMeshData(shape, deflection, response->mutable_mesh())
                ├── BRepMesh_IncrementalMesh(shape, deflection)
                ├── iterate faces → positions, indices, face_mapping
                └── iterate edges → edge_offsets, edge_lines

ExecuteResponse
    ├── success { shape_id: "box1", box { shape_id: "box1" } }
    ├── metrics { volume, surface_area, bbox, face_count, ... }
    └── mesh { positions: bytes, indices: bytes, face_mapping: bytes,
               edge_offsets: bytes, edge_lines: bytes }
```

## 7. Error Handling

| Condition | Handling |
|-----------|----------|
| `BRepMesh_IncrementalMesh.IsDone() == false` | Log WARN, leave `meshData` empty (positions/indices empty). Do not fail the RPC — metrics and shape_id are still valid. |
| `BRep_Tool::Triangulation` returns null for a face | Skip that face (no nodes/triangles contributed). Continue with remaining faces. |
| `BRep_Tool::Polygon3D` returns null for an edge | Fall back to `BRepAdaptor_Curve` sampling (10 points). If that also fails, push empty edge line (preserves index mapping). |
| Shape is null/empty | `OpCreateAndCache` already returns `GEOMETRY_EMPTY` before reaching mesh population. |
| `include_brep == false` | Skip mesh population entirely (no `mutable_mesh()` call). |

All errors are non-fatal: the operation succeeds even if tessellation is incomplete or empty.

## 8. Testing

### 8.1 Unit Tests (C++ — `tests/codec_test.cpp`)

Existing file already has `MeshDataRoundTrip` and `MeshDataEmpty` tests for protobuf serialization. Add:

- **`MeshDataFromBox`**: Create a box via the kernel (or directly via `OpCreateBox` + `PopulateMeshData`), assert:
  - `positions().size() > 0` and divisible by 3
  - `indices().size() > 0` and divisible by 3
  - All index values < (positions().size() / 12) — valid vertex references
  - `face_mapping().size() == indices().size() / 12 * 4` (int32 per triangle)
  - `edge_offsets().size() == edge_lines().size() / 8 * 4` roughly

### 8.2 Integration Tests (TypeScript — `tests/oracle/native-oracle.integration.test.ts`)

Add dedicated tests. Note: `NativeKernelAdapter.executeStep` currently hardcodes `include_brep: false` — add an `options?: { includeBrep?: boolean }` parameter (or set `include_brep: true` when testing mesh responses).

- **`mesh_data_returned_for_box`**: Execute `create_box` via `NativeKernelAdapter` with `includeBrep: true`, assert:
  - `result.mesh.positions` is a non-empty `Uint8Array`
  - `result.mesh.indices` is a non-empty `Uint8Array`
  - `result.mesh.face_mapping` is non-empty
  - Decode positions as Float32LE: length divisible by 3, all finite values
  - Decode indices as Uint32LE: length divisible by 3, all values < vertex count

### 8.3 Deterministic Verification

- **`mesh_data_deterministic`**: Execute the same `create_box` twice with identical parameters, assert `positions`, `indices`, `face_mapping`, `edge_offsets`, `edge_lines` are byte-identical between the two responses.

### 8.4 Oracle Fixtures

No new oracle fixtures needed for mesh data — mesh data is structural, not geometric. Existing 3D solid oracle fixtures (`extrude_rectangle.json`, `extrude_thickness.json`, `revolve_cylinder.json`, `compound_two_boxes.json`, plus the 12 existing parts) continue to validate geometry via `ShapeMetrics`. Mesh data is validated separately by the tests above.

## 9. Files Changed

| File | Change |
|------|--------|
| `src/core/gateway/kernel-worker.cpp` | Add `PopulateMeshData` static helper; call it from all ~25 `HandleCreate*` handlers after `ComputeShapeMetrics` |
| `tests/codec_test.cpp` | Add `MeshDataFromBox` test (C++ unit test) |
| `tests/oracle/native-oracle.integration.test.ts` | Add `mesh_data_returned_for_box` + `mesh_data_deterministic` tests |
| `src/core/harness/native-kernel-adapter.ts` | Add `includeBrep` option to `executeStep` for mesh testing |
| `docs/epics/WEBCAD-EPIC-EC-v5.md` | Mark WC-EC-23 as in progress / done |

## 10. Self-Review Checklist

- [x] **Placeholder scan:** No TBD, TODO, or incomplete sections remain.
- [x] **Internal consistency:** Architecture matches feature descriptions; `PopulateMeshData` signature matches call sites; proto fields match existing `MeshData` message.
- [x] **Scope check:** Focused on tessellation extraction only; no protocol changes, no new files (except tests).
- [x] **Ambiguity check:** Deflection default (0.1) and `include_brep` gating are explicit; error handling for null triangulation is defined.

---

**Spec written to `docs/superpowers/specs/2026-11-21-wc-ec-23-tessellation-design.md`.**  
Please review it and let me know if you want changes before we proceed to the implementation plan.