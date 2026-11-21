# WC-EC-23 Tessellation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `MeshData` (positions, indices, face_mapping, edge_offsets, edge_lines as binary bytes) in `ExecuteResponse.mesh` for every shape-creating operation in the native C++ OCCT kernel. No proto changes needed — `MeshData` message already exists in `common.proto`.

**Architecture:** Add a static `PopulateMeshData(TopoDS_Shape, double, MeshData*)` helper in `kernel-worker.cpp` that triangulates a shape via `BRepMesh_IncrementalMesh`, iterates faces/edges with `TopExp_Explorer`, extracts node/triangle data via `BRep_Tool::Triangulation`/`Polygon3D`, and serializes to protobuf bytes. Call it from every `HandleCreate*` handler after `ComputeShapeMetrics`, gated by `request->include_brep()`.

**Tech Stack:** C++17 + OpenCASCADE 7.9.3 (BRepMesh_IncrementalMesh, BRep_Tool, TopExp_Explorer, TopLoc_Location, Poly_Triangle, BRepAdaptor_Curve, GCPnts_QuasiUniformDeflection), gRPC protobuf, TypeScript for adapter/tests.

---

## Files to touch

| File | Action | Purpose |
|------|--------|---------|
| `src/core/gateway/kernel-worker.cpp` | Modify | Add `PopulateMeshData` static helper (~100 lines) after `ComputeShapeMetrics`; add mesh population call to all ~25 `HandleCreate*` handlers |
| `src/core/harness/native-kernel-adapter.ts` | Modify | Add `includeBrep` option to `executeStep`/`execute` for mesh testing; parse `mesh` field in `parseExecuteResponse` |
| `tests/codec_test.cpp` | Create | `MeshDataFromBox` unit test: create box, populate mesh, assert positions/indices/face_mapping/edge_offsets/edge_lines |
| `tests/oracle/native-oracle.integration.test.ts` | Modify | Add `mesh_data_returned_for_box` + `mesh_data_deterministic` integration tests |
| `docs/epics/WEBCAD-EPIC-EC-v5.md` | Modify | Mark WC-EC-23 as done |

---

## Chunk 1: C++ Kernel — PopulateMeshData Helper

### Task 1.1: Add `PopulateMeshData` static helper function

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp` (after `ComputeShapeMetrics`, around line 810)

- [ ] **Step 1: Write `PopulateMeshData` function**

Add this static function after `ComputeShapeMetrics` (find its closing brace, insert after):

```cpp
// PopulateMeshData — extract tessellation from a TopoDS_Shape into MeshData protobuf.
// Layout matches MeshData proto: positions=float32 LE xyz triplets,
// indices=uint32 LE triangle indices, face_mapping=int32 LE per-triangle face index,
// edge_offsets=uint32 LE cumulative float count per edge (N+1 entries for N edges),
// edge_lines=packed float32 LE [x1,y1,z1,x2,y2,z2,...] per edge segment.
// Deterministic: same shape + same deflection → byte-identical output.
static void PopulateMeshData(const TopoDS_Shape& shape, double deflection,
                              webcad::engine::v1::MeshData* meshData) {
  if (shape.IsNull()) {
    return;
  }

  // ---- Triangulation reuse check ----
  bool needsMesh = false;
  TopExp_Explorer checkExp(shape, TopAbs_FACE);
  while (checkExp.More()) {
    TopLoc_Location loc;
    if (BRep_Tool::Triangulation(TopoDS::Face(checkExp.Current()), loc).IsNull()) {
      needsMesh = true;
      break;
    }
    checkExp.Next();
  }

  if (needsMesh) {
    BRepMesh_IncrementalMesh mesher(shape, deflection, Standard_False, 0.5, Standard_False);
    if (!mesher.IsDone()) {
      LOG(kLogWarn) << "PopulateMeshData: BRepMesh_IncrementalMesh not done for deflection="
                    << deflection << "\n";
      return; // Leave meshData empty
    }
  }

  // ---- First pass: count nodes and triangles ----
  size_t totalNodes = 0;
  size_t totalTriangles = 0;
  TopExp_Explorer countExp(shape, TopAbs_FACE);
  while (countExp.More()) {
    TopLoc_Location loc;
    const Handle(Poly_Triangulation) tri =
        BRep_Tool::Triangulation(TopoDS::Face(countExp.Current()), loc);
    if (!tri.IsNull()) {
      totalNodes += tri->NbNodes();
      totalTriangles += tri->NbTriangles();
    }
    countExp.Next();
  }

  // Pre-allocate output buffers
  std::vector<float> posBuf;       // xyz triplets
  std::vector<uint32_t> idxBuf;    // triangle indices
  std::vector<int32_t> fmBuf;      // per-triangle face index
  std::vector<float> elBuf;        // packed edge line floats
  std::vector<uint32_t> eoBuf;     // cumulative float count per edge (N+1 entries)
  posBuf.reserve(totalNodes * 3);
  idxBuf.reserve(totalTriangles * 3);
  fmBuf.reserve(totalTriangles);

  size_t vertexOffset = 0;
  int32_t faceCounter = 0;

  // ---- Second pass: extract face geometry ----
  TopExp_Explorer faceExp(shape, TopAbs_FACE);
  while (faceExp.More()) {
    TopoDS_Face face = TopoDS::Face(faceExp.Current());
    TopLoc_Location location;
    const Handle(Poly_Triangulation) tri =
        BRep_Tool::Triangulation(face, location);
    if (tri.IsNull()) {
      faceExp.Next();
      continue;
    }

    const gp_Trsf& trsf = location.Transformation();
    const Poly_Triangulation& triRef = *tri;

    // Extract nodes
    const Standard_Integer nbNodes = triRef.NbNodes();
    for (Standard_Integer i = 1; i <= nbNodes; ++i) {
      gp_Pnt pnt = triRef.Node(i);
      pnt.Transform(trsf);
      posBuf.push_back(static_cast<float>(pnt.X()));
      posBuf.push_back(static_cast<float>(pnt.Y()));
      posBuf.push_back(static_cast<float>(pnt.Z()));
    }

    // Extract triangles
    const Standard_Integer nbTriangles = triRef.NbTriangles();
    const TopAbs_Orientation orientation = face.Orientation();
    for (Standard_Integer i = 1; i <= nbTriangles; ++i) {
      Standard_Integer n1, n2, n3;
      triRef.Triangle(i).Get(n1, n2, n3);
      if (orientation != TopAbs_FORWARD) {
        std::swap(n2, n3);
      }
      idxBuf.push_back(static_cast<uint32_t>(n1 - 1 + vertexOffset));
      idxBuf.push_back(static_cast<uint32_t>(n2 - 1 + vertexOffset));
      idxBuf.push_back(static_cast<uint32_t>(n3 - 1 + vertexOffset));
      fmBuf.push_back(faceCounter);
    }

    vertexOffset += nbNodes;
    ++faceCounter;
    faceExp.Next();
  }

  // ---- Third pass: extract edge lines ----
  eoBuf.push_back(0); // offsets[0] = 0
  TopExp_Explorer edgeExp(shape, TopAbs_EDGE);
  while (edgeExp.More()) {
    TopoDS_Edge edge = TopoDS::Edge(edgeExp.Current());
    TopLoc_Location loc;
    const Handle(Poly_Polygon3D) poly = BRep_Tool::Polygon3D(edge, loc);
    size_t edgeFloatCount = 0;

    if (!poly.IsNull()) {
      const gp_Pnt& trsfPnt = loc.Transformation().TranslationPart();
      const Poly_Polygon3D& polyRef = *poly;
      for (Standard_Integer j = polyRef.NodesLower(); j <= polyRef.NodesUpper(); ++j) {
        gp_Pnt pnt = polyRef.Node(j);
        pnt.Transform(loc.Transformation());
        elBuf.push_back(static_cast<float>(pnt.X()));
        elBuf.push_back(static_cast<float>(pnt.Y()));
        elBuf.push_back(static_cast<float>(pnt.Z()));
        edgeFloatCount += 3;
      }
    } else {
      // Fallback: BRepAdaptor_Curve sampling (10 points)
      try {
        BRepAdaptor_Curve adaptor(edge);
        const Standard_Real first = adaptor.FirstParameter();
        const Standard_Real last = adaptor.LastParameter();
        for (int j = 0; j <= 10; ++j) {
          const Standard_Real u = first + (last - first) * (j / 10.0);
          gp_Pnt pnt;
          adaptor.D0(u, pnt);
          pnt.Transform(loc.Transformation());
          elBuf.push_back(static_cast<float>(pnt.X()));
          elBuf.push_back(static_cast<float>(pnt.Y()));
          elBuf.push_back(static_cast<float>(pnt.Z()));
          edgeFloatCount += 3;
        }
      } catch (const Standard_Failure&) {
        // Empty edge — push nothing, offset stays same
      }
    }

    eoBuf.push_back(eoBuf.back() + static_cast<uint32_t>(edgeFloatCount));
    edgeExp.Next();
  }

  // ---- Serialize to protobuf bytes ----
  meshData->set_positions(reinterpret_cast<const char*>(posBuf.data()),
                          posBuf.size() * sizeof(float));
  meshData->set_indices(reinterpret_cast<const char*>(idxBuf.data()),
                        idxBuf.size() * sizeof(uint32_t));
  meshData->set_face_mapping(reinterpret_cast<const char*>(fmBuf.data()),
                             fmBuf.size() * sizeof(int32_t));
  meshData->set_edge_offsets(reinterpret_cast<const char*>(eoBuf.data()),
                             eoBuf.size() * sizeof(uint32_t));
  meshData->set_edge_lines(reinterpret_cast<const char*>(elBuf.data()),
                           elBuf.size() * sizeof(float));
}
```

Expected: Function compiles cleanly (no call sites yet, may produce unused-function warning — that's fine, will be used in next tasks).

- [ ] **Step 2: Verify C++ compilation**

Run: `ninja kernel_worker -j4` in the kernel build directory inside the container.

Expected: Compiles successfully (unused-function warning acceptable).

- [ ] **Step 3: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-23): add PopulateMeshData helper to kernel-worker"
```

---

### Task 1.2: Wire `PopulateMeshData` into `HandleCreateBox` (replace TODO)

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp:2032-2036`

- [ ] **Step 1: Replace the TODO comment with mesh population call**

Replace:

```cpp
    // Optional MeshData (populated later from triangulation)
    if (request->include_brep()) {
      auto* meshData = response->mutable_mesh();
      // TODO: populate MeshData positions/indices from shape triangulation
    }
```

With:

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

Expected: Box handler now populates MeshData when `include_brep=true`.

- [ ] **Step 2: Verify C++ compilation**

Run: `ninja kernel_worker -j4` in the kernel build directory.

Expected: Compiles successfully.

- [ ] **Step 3: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-23): wire PopulateMeshData into HandleCreateBox"
```

---

### Task 1.3: Wire `PopulateMeshData` into remaining primitive handlers

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp` — `HandleCreateCylinder`, `HandleCreateSphere`, `HandleCreateCone`, `HandleCreateTorus`, `HandleCreateWedge`, `HandleCreatePyramid`

- [ ] **Step 1: Add mesh population to HandleCreateCylinder**

After the `ComputeShapeMetrics` call in `HandleCreateCylinder`, add the same mesh population block (pattern identical to Task 1.2, using `op.deflection()`).

- [ ] **Step 2: Add mesh population to HandleCreateSphere**

Same pattern.

- [ ] **Step 3: Add mesh population to HandleCreateCone**

Same pattern.

- [ ] **Step 4: Add mesh population to HandleCreateTorus**

Same pattern.

- [ ] **Step 5: Add mesh population to HandleCreateWedge**

Same pattern.

- [ ] **Step 6: Add mesh population to HandleCreatePyramid**

Same pattern.

- [ ] **Step 7: Verify C++ compilation**

Run: `ninja kernel_worker -j4` in the kernel build directory.

Expected: Compiles successfully.

- [ ] **Step 8: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-23): wire PopulateMeshData into primitive handlers"
```

---

### Task 1.4: Wire `PopulateMeshData` into polyhedron/convex hull handlers

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp` — `HandleCreatePolyhedron`, `HandleCreateConvexHull`

- [ ] **Step 1: Add mesh population to HandleCreatePolyhedron**

- [ ] **Step 2: Add mesh population to HandleCreateConvexHull**

- [ ] **Step 3: Verify C++ compilation**

Run: `ninja kernel_worker -j4` in the kernel build directory.

Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-23): wire PopulateMeshData into polyhedron/hull handlers"
```

---

### Task 1.5: Wire `PopulateMeshData` into extrude/revolve/compound/boolean handlers

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp` — `HandleCreateExtrude`, `HandleCreateRevolve`, `HandleCreateCompound`, `HandleCreateBoolean`

- [ ] **Step 1: Add mesh population to HandleCreateExtrude**

- [ ] **Step 2: Add mesh population to HandleCreateRevolve**

- [ ] **Step 3: Add mesh population to HandleCreateCompound**

- [ ] **Step 4: Add mesh population to HandleCreateBoolean**

- [ ] **Step 5: Verify C++ compilation**

Run: `ninja kernel_worker -j4` in the kernel build directory.

Expected: Compiles successfully.

- [ ] **Step 6: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-23): wire PopulateMeshData into extrude/revolve/compound/boolean handlers"
```

---

### Task 1.6: Wire `PopulateMeshData` into sweep/loft handlers

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp` — `HandleCreateSweep`, `HandleCreateLoft`

- [ ] **Step 1: Add mesh population to HandleCreateSweep**

- [ ] **Step 2: Add mesh population to HandleCreateLoft**

- [ ] **Step 3: Verify C++ compilation**

Run: `ninja kernel_worker -j4` in the kernel build directory.

Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-23): wire PopulateMeshData into sweep/loft handlers"
```

---

### Task 1.7: Wire `PopulateMeshData` into transform handlers

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp` — `HandleMultMatrixShape`, `HandleTransformShape`, `HandleRotateShape`, `HandleMirrorShape`, `HandleScaleShape`

- [ ] **Step 1: Add mesh population to HandleMultMatrixShape**

These handlers use `request->deflection()` (not `op.deflection()`) since deflection is on the top-level request.

- [ ] **Step 2: Add mesh population to HandleTransformShape**

- [ ] **Step 3: Add mesh population to HandleRotateShape**

- [ ] **Step 4: Add mesh population to HandleMirrorShape**

- [ ] **Step 5: Add mesh population to HandleScaleShape**

- [ ] **Step 6: Verify C++ compilation**

Run: `ninja kernel_worker -j4` in the kernel build directory.

Expected: Compiles successfully.

- [ ] **Step 7: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-23): wire PopulateMeshData into transform handlers"
```

---

### Task 1.8: Wire `PopulateMeshData` into fillet/chamfer/thick/draft handlers

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp` — `HandleFilletSolid`, `HandleChamferSolid`, `HandleFilletSolidFace`, `HandleChamferSolidFace`, `HandleMakeThickSolid`, `HandleDraftSolidFaces`

- [ ] **Step 1: Add mesh population to HandleFilletSolid**

- [ ] **Step 2: Add mesh population to HandleChamferSolid**

- [ ] **Step 3: Add mesh population to HandleFilletSolidFace**

- [ ] **Step 4: Add mesh population to HandleChamferSolidFace**

- [ ] **Step 5: Add mesh population to HandleMakeThickSolid**

- [ ] **Step 6: Add mesh population to HandleDraftSolidFaces**

- [ ] **Step 7: Verify C++ compilation**

Run: `ninja kernel_worker -j4` in the kernel build directory.

Expected: Compiles successfully.

- [ ] **Step 8: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-23): wire PopulateMeshData into fillet/chamfer/thick/draft handlers"
```

---

## Chunk 2: TypeScript — NativeKernelAdapter mesh support

### Task 2.1: Add `includeBrep` option to `NativeKernelAdapter`

**Files:**
- Modify: `src/core/harness/native-kernel-adapter.ts`

- [ ] **Step 1: Add `includeBrep` parameter to `executeStep`**

Modify `buildExecuteRequest` to accept an optional `includeBrep` flag:

```typescript
private buildExecuteRequest(step: { name: string; parameters: Record<string, unknown> },
                            options?: { includeBrep?: boolean }): any {
  ...
  const request: any = { header, include_brep: options?.includeBrep ?? false };
  ...
}
```

And update `execute` to pass options through.

- [ ] **Step 2: Parse `mesh` field in `parseExecuteResponse`**

Add mesh parsing to `KernelResult`:

```typescript
const mesh = response.mesh;
if (mesh) {
  result.mesh = {
    positions: mesh.positions ? new Uint8Array(mesh.positions) : new Uint8Array(0),
    indices: mesh.indices ? new Uint8Array(mesh.indices) : new Uint8Array(0),
    face_mapping: mesh.face_mapping ? new Uint8Array(mesh.face_mapping) : new Uint8Array(0),
    edge_offsets: mesh.edge_offsets ? new Uint8Array(mesh.edge_offsets) : new Uint8Array(0),
    edge_lines: mesh.edge_lines ? new Uint8Array(mesh.edge_lines) : new Uint8Array(0),
  };
}
```

Also add `mesh` to the `KernelResult` type in `kernel-adapter.ts` if needed.

- [ ] **Step 3: Run TypeScript typecheck**

Run: `npm run typecheck`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/harness/native-kernel-adapter.ts
git commit -m "feat(wc-ec-23): add includeBrep option and mesh parsing to NativeKernelAdapter"
```

---

## Chunk 3: C++ Unit Tests

### Task 3.1: Write `MeshDataFromBox` unit test

**Files:**
- Create: `tests/codec_test.cpp` (add new test case)

- [ ] **Step 1: Write `MeshDataFromBox` test**

Add to `tests/codec_test.cpp`:

```cpp
TEST(CodecTest, MeshDataFromBox) {
  // Create a box directly via OpCreateBox
  auto r = OpCreateBox(0, 0, 0, 2, 2, 2, 0.1, "test_box");
  ASSERT_TRUE(r.ok) << "OpCreateBox failed: " << r.message;

  auto it = g_shapeCache.find(r.shapeId);
  ASSERT_NE(it, g_shapeCache.end());

  webcad::engine::v1::MeshData mesh;
  PopulateMeshData(it->second, 0.1, &mesh);

  // Positions: non-empty, divisible by 3 (xyz triplets)
  ASSERT_GT(mesh.positions().size(), 0);
  EXPECT_EQ(mesh.positions().size() % (3 * sizeof(float)), 0);

  // Indices: non-empty, divisible by 3 (triangle indices)
  ASSERT_GT(mesh.indices().size(), 0);
  EXPECT_EQ(mesh.indices().size() % (3 * sizeof(uint32_t)), 0);

  // All indices reference valid vertices
  const uint32_t* idx = reinterpret_cast<const uint32_t*>(mesh.indices().data());
  const size_t numIndices = mesh.indices().size() / sizeof(uint32_t);
  const size_t numVertices = mesh.positions().size() / (3 * sizeof(float));
  for (size_t i = 0; i < numIndices; ++i) {
    EXPECT_LT(idx[i], numVertices) << "Index " << i << "=" << idx[i] << " >= vertex count " << numVertices;
  }

  // Face mapping: one int32 per triangle
  EXPECT_EQ(mesh.face_mapping().size(), numIndices * sizeof(int32_t));

  // Edge offsets: N+1 entries for N edges
  ASSERT_GT(mesh.edge_offsets().size(), 0);
  EXPECT_EQ(mesh.edge_offsets().size() % sizeof(uint32_t), 0);
  const uint32_t* offsets = reinterpret_cast<const uint32_t*>(mesh.edge_offsets().data());
  const size_t numOffsets = mesh.edge_offsets().size() / sizeof(uint32_t);
  EXPECT_EQ(offsets[0], 0u);
  EXPECT_EQ(offsets[numOffsets - 1], mesh.edge_lines().size() / sizeof(float));

  // Edge lines: packed floats
  EXPECT_GT(mesh.edge_lines().size(), 0);
  EXPECT_EQ(mesh.edge_lines().size() % sizeof(float), 0);
}
```

- [ ] **Step 2: Run the test**

Run: `./tests/codec_test --gtest_filter="CodecTest.MeshDataFromBox"` (from kernel build directory)

Expected: PASS — box produces valid MeshData.

- [ ] **Step 3: Commit**

```bash
git add tests/codec_test.cpp
git commit -m "test(wc-ec-23): add MeshDataFromBox unit test"
```

---

## Chunk 4: TypeScript Integration Tests

### Task 4.1: Add mesh integration tests

**Files:**
- Modify: `tests/oracle/native-oracle.integration.test.ts`

- [ ] **Step 1: Add `mesh_data_returned_for_box` test**

```typescript
it('mesh_data_returned_for_box', async () => {
  await adapter.init();
  const result = await adapter.execute({
    name: 'mesh_data_box',
    tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
    steps: [
      {
        name: 'create_box',
        parameters: {
          x: 0, y: 0, z: 0,
          dx: 2, dy: 2, dz: 2,
          deflection: 0.1,
          entity_id: 'mesh_box',
        },
      },
    ],
  }, { includeBrep: true });

  expect(result[0].success).toBe(true);
  expect(result[0].mesh).toBeDefined();
  expect(result[0].mesh!.positions.length).toBeGreaterThan(0);
  expect(result[0].mesh!.indices.length).toBeGreaterThan(0);
  expect(result[0].mesh!.face_mapping.length).toBeGreaterThan(0);

  // Decode positions as Float32LE
  const positions = new Float32Array(result[0].mesh!.positions.buffer);
  expect(positions.length % 3).toBe(0);
  for (let i = 0; i < positions.length; i++) {
    expect(Number.isFinite(positions[i])).toBe(true);
  }

  // Decode indices as Uint32LE
  const indices = new Uint32Array(result[0].mesh!.indices.buffer);
  expect(indices.length % 3).toBe(0);
  const vertexCount = positions.length / 3;
  for (let i = 0; i < indices.length; i++) {
    expect(indices[i]).toBeLessThan(vertexCount);
  }
}, 60000);
```

- [ ] **Step 2: Add `mesh_data_deterministic` test**

```typescript
it('mesh_data_deterministic', async () => {
  await adapter.init();
  const run1 = await adapter.execute(
    { name: 'det1', tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 2, dy: 2, dz: 2, deflection: 0.1, entity_id: 'det_box' } }] },
    { includeBrep: true }
  );
  const run2 = await adapter.execute(
    { name: 'det2', tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 2, dy: 2, dz: 2, deflection: 0.1, entity_id: 'det_box' } }] },
    { includeBrep: true }
  );

  expect(run1[0].mesh).toBeDefined();
  expect(run2[0].mesh).toBeDefined();

  // Byte-identical across runs
  expect(run1[0].mesh!.positions).toEqual(run2[0].mesh!.positions);
  expect(run1[0].mesh!.indices).toEqual(run2[0].mesh!.indices);
  expect(run1[0].mesh!.face_mapping).toEqual(run2[0].mesh!.face_mapping);
  expect(run1[0].mesh!.edge_offsets).toEqual(run2[0].mesh!.edge_offsets);
  expect(run1[0].mesh!.edge_lines).toEqual(run2[0].mesh!.edge_lines);
}, 60000);
```

Note: `adapter.execute` needs to accept a second options parameter — update its signature in Task 2.1.

- [ ] **Step 3: Run integration tests**

Run: `npm test -- tests/oracle/native-oracle.integration.test.ts` (requires kernel running on localhost:50051)

Expected: All tests pass (mesh data returned, deterministic).

- [ ] **Step 4: Commit**

```bash
git add tests/oracle/native-oracle.integration.test.ts
git commit -m "test(wc-ec-23): add mesh integration tests"
```

---

## Chunk 5: Documentation & Verification

### Task 5.1: Update epic tracking

**Files:**
- Modify: `docs/epics/WEBCAD-EPIC-EC-v5.md`

- [ ] **Step 1: Mark WC-EC-23 as done**

Update the epic doc to mark WC-EC-23 status as complete.

- [ ] **Step 2: Commit**

```bash
git add docs/epics/WEBCAD-EPIC-EC-v5.md
git commit -m "docs(wc-ec-23): mark tessellation epic as done"
```

---

### Task 5.2: Run full verification

- [ ] **Step 1: TypeScript typecheck**

Run: `npm run typecheck`

Expected: 0 errors.

- [ ] **Step 2: ESLint**

Run: `npm run lint`

Expected: 0 warnings/errors.

- [ ] **Step 3: Vitest unit tests**

Run: `npm test`

Expected: 0 failures.

- [ ] **Step 4: Buf lint**

Run: `npm run buf:lint`

Expected: Pass (no proto changes, but verify).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(wc-ec-23): complete tessellation to binary buffers"
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-11-21-wc-ec-23-tessellation-implementation-plan.md`. Ready to execute?**