# WC-EC-15 Implementation Plan: Port Polyhedron and Convex Hull

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `createPolyhedron` and `createConvexHull` from the WASM kernel (`OCCWorker.ts`) to the native C++ OCCT kernel behind the gRPC `Kernel.Execute` protocol, with oracle-based verification.

**Architecture:** Two C++ ops (`OpCreatePolyhedron`, `OpCreateConvexHull`) plus a `computeConvexHull3D` helper ported from WASM's incremental 3D convex hull algorithm. `OpCreateConvexHull` delegates to `OpCreatePolyhedron` after computing hull faces. Both attach `ShapeMetrics` via `ComputeShapeMetrics`. Proto gets `PolyhedronFace` + `faces` field (ADR 004).

**Tech Stack:** OCCT 7.9.3 (C++), protobuf/gRPC, TypeScript, Vitest, Docker container `webcad-kernel-test` on `localhost:50051`.

---

## Files

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `docs/superpowers/plans/2026-11-22-wc-ec-15-implementation-plan.md` | This plan |
| Create | `tests/fixtures/oracle/tetrahedron.json` | Oracle reference part: 4-point hull |
| Create | `tests/fixtures/oracle/cube_from_hull.json` | Oracle reference part: 8 cube corners → hull |
| Create | `tests/fixtures/oracle/irregular_polyhedron.json` | Oracle reference part: direct polyhedron |
| Modify | `proto/webcad/engine/v1/engine.proto` | Add `PolyhedronFace` + `faces` field |
| Modify | `src/core/gateway/kernel-worker.cpp` | Add ops, hull algo, handlers, CLI mode |
| Modify | `src/core/harness/native-kernel-adapter.ts` | Add opMap entries + param normalization |
| Modify | `tests/oracle/native-oracle.integration.test.ts` | Add 3 new reference parts to corpus |
| Modify | `docs/epics/WEBCAD-EPIC-EC-v5.md` | Mark WC-EC-15 tasks complete |

---

## Chunk 1: Proto Schema Change + Regeneration

### Task 1.1: Add `PolyhedronFace` + `faces` to `CreatePolyhedronOp`

**Files:**
- Modify: `proto/webcad/engine/v1/engine.proto`

**Step 1: Edit proto**

Add `PolyhedronFace` message before `CreatePolyhedronOp`, and add `repeated PolyhedronFace faces = 5;` field.

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
```

**Step 2: Run buf lint and generate**

Run: `npm run buf:lint && npm run buf:generate`

Expected: No lint errors; TS+C++ stubs regenerated.

### Task 1.2: Commit proto change

**Files:**
- Modified: `proto/webcad/engine/v1/engine.proto`
- Modified: `src/generated/proto/webcad/engine/v1/` (regenerated)

Run:
```
git add proto/ src/generated/proto/
git commit -m "feat(WC-EC-15): add PolyhedronFace + faces to CreatePolyhedronOp (ADR 004)"
```

---

## Chunk 2: C++ Kernel — OpCreatePolyhedron

### Task 2.1: Implement OpCreatePolyhedron

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

**Step 1: Add OpCreatePolyhedron function** (after `OpCreatePyramid`, before `OpImportBRep`)

```cpp
static OpResult OpCreatePolyhedron(
    const std::vector<gp_Pnt>& points,
    const std::vector<std::vector<int>>& faces,
    double deflection,
    const std::string& entityId) {
  OpResult r;
  if (faces.empty()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "Polyhedron: requires at least one face";
    return r;
  }
  if (deflection <= 0.0) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "Polyhedron: deflection must be positive";
    return r;
  }

  BRepBuilderAPI_Sewing sewing(1e-4);

  for (const auto& faceIdxs : faces) {
    // Filter adjacent duplicate/coincident vertices
    std::vector<int> uniqueIdxs;
    for (int idx : faceIdxs) {
      if (uniqueIdxs.empty()) {
        uniqueIdxs.push_back(idx);
      } else {
        const gp_Pnt& pLast = points[uniqueIdxs.back()];
        const gp_Pnt& pCurr = points[idx];
        if (pLast.Distance(pCurr) >= 1e-7) {
          uniqueIdxs.push_back(idx);
        }
      }
    }
    // Check closing edge (last -> first)
    if (uniqueIdxs.size() >= 2) {
      const gp_Pnt& pFirst = points[uniqueIdxs[0]];
      const gp_Pnt& pLast = points[uniqueIdxs.back()];
      if (pFirst.Distance(pLast) < 1e-7) {
        uniqueIdxs.pop_back();
      }
    }
    if (uniqueIdxs.size() < 3) continue;

    BRepBuilderAPI_MakeWire wire;
    for (size_t j = 0; j < uniqueIdxs.size(); ++j) {
      const gp_Pnt& p1 = points[uniqueIdxs[j]];
      const gp_Pnt& p2 = points[uniqueIdxs[(j + 1) % uniqueIdxs.size()]];
      BRepBuilderAPI_MakeEdge edge(p1, p2);
      if (edge.IsDone()) {
        wire.Add(edge.Edge());
      } else {
        r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
        r.message = "Polyhedron: failed to build face edge";
        return r;
      }
    }
    if (!wire.IsDone()) {
      r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      r.message = "Polyhedron: failed to build face wire";
      return r;
    }

    BRepBuilderAPI_MakeFace face(wire.Wire(), false);
    if (!face.IsDone()) {
      r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      r.message = "Polyhedron: failed to build face";
      return r;
    }
    sewing.Add(face.Face());
  }

  sewing.Perform();
  TopoDS_Shape sewed = sewing.SewedShape();

  BRepBuilderAPI_MakeSolid makeSolid;
  if (sewed.ShapeType() == TopAbs_SHELL) {
    makeSolid.Add(TopoDS::Shell(sewed));
  } else {
    for (TopExp_Explorer exp(sewed, TopAbs_SHELL); exp.More(); exp.Next()) {
      makeSolid.Add(TopoDS::Shell(TopoDS::Shell(exp.Current())));
    }
  }

  TopoDS_Shape shape;
  if (makeSolid.IsDone()) {
    shape = makeSolid.Solid();
  } else {
    shape = sewed;
  }

  // Mesh + cache (no translation — points are world-space)
  BRepMesh_IncrementalMesh mesh(shape, deflection);
  if (!mesh.IsDone()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "Polyhedron: meshing failed";
    return r;
  }

  std::string shapeId = entityId.empty() ? "shape_" + std::to_string(g_shapeCache.size()) : entityId;
  g_shapeCache[shapeId] = shape;
  r.ok = true;
  r.shapeId = shapeId;
  return r;
}
```

**Step 2: Verify syntax**

Run: `npx tsc --noEmit` (TypeScript unaffected — this is C++, but verify no unrelated breakage)

---

### Task 2.2: Implement computeConvexHull3D (C++ port)

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

**Step 1: Add computeConvexHull3D function** (after `OpCreatePolyhedron`)

```cpp
struct Point3D_Cpp { double x, y, z; };

static std::vector<std::array<int, 3>> computeConvexHull3D(
    const std::vector<gp_Pnt>& points) {
  if (points.size() < 4) {
    throw std::runtime_error("Convex hull requires at least 4 points");
  }

  // Deterministic micro-jitter (replaces WASM's Math.random() * 1e-7)
  std::vector<gp_Pnt> jittered;
  jittered.reserve(points.size());
  for (size_t i = 0; i < points.size(); ++i) {
    double j = static_cast<double>(i) * 1e-8;
    jittered.emplace_back(points[i].X() + j, points[i].Y() + j, points[i].Z() + j);
  }

  auto getSignedDistance = [&](const gp_Pnt& normal, double offset, const gp_Pnt& p) {
    return normal.X() * p.X() + normal.Y() * p.Y() + normal.Z() * p.Z() - offset;
  };

  auto makePlane = [&](size_t i0, size_t i1, size_t i2) -> std::pair<gp_Pnt, double> {
    const gp_Pnt& p0 = jittered[i0];
    const gp_Pnt& p1 = jittered[i1];
    const gp_Pnt& p2 = jittered[i2];
    gp_Vec u(p1.X() - p0.X(), p1.Y() - p0.Y(), p1.Z() - p0.Z());
    gp_Vec v(p2.X() - p0.X(), p2.Y() - p0.Y(), p2.Z() - p0.Z());
    gp_Vec n = u.Crossed(v);
    n.Normalize();
    return {gp_Pnt(n.X(), n.Y(), n.Z()), n.X() * p0.X() + n.Y() * p0.Y() + n.Z() * p0.Z()};
  };

  // i0 = leftmost
  size_t i0 = 0;
  for (size_t i = 1; i < jittered.size(); ++i) {
    if (jittered[i].X() < jittered[i0].X()) i0 = i;
  }

  // i1 = farthest from i0
  size_t i1 = 0;
  double maxDistSq = -1;
  for (size_t i = 0; i < jittered.size(); ++i) {
    if (i == i0) continue;
    double dx = jittered[i].X() - jittered[i0].X();
    double dy = jittered[i].Y() - jittered[i0].Y();
    double dz = jittered[i].Z() - jittered[i0].Z();
    double dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxDistSq) { maxDistSq = dSq; i1 = i; }
  }

  // i2 = farthest from line (i0, i1)
  size_t i2 = static_cast<size_t>(-1);
  double maxLineDistSq = -1;
  const gp_Pnt& p0 = jittered[i0];
  const gp_Pnt& p1 = jittered[i1];
  gp_Vec u(p1.X() - p0.X(), p1.Y() - p0.Y(), p1.Z() - p0.Z());
  double uLenSq = u.X() * u.X() + u.Y() * u.Y() + u.Z() * u.Z();
  for (size_t i = 0; i < jittered.size(); ++i) {
    if (i == i0 || i == i1) continue;
    double px = jittered[i].X() - p0.X();
    double py = jittered[i].Y() - p0.Y();
    double pz = jittered[i].Z() - p0.Z();
    double t = (px * u.X() + py * u.Y() + pz * u.Z()) / uLenSq;
    double dx = px - t * u.X();
    double dy = py - t * u.Y();
    double dz = pz - t * u.Z();
    double dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxLineDistSq) { maxLineDistSq = dSq; i2 = i; }
  }

  // i3 = farthest from plane (i0, i1, i2)
  size_t i3 = static_cast<size_t>(-1);
  double maxPlaneDist = -1;
  auto basePlane = makePlane(i0, i1, i2);
  for (size_t i = 0; i < jittered.size(); ++i) {
    if (i == i0 || i == i1 || i == i2) continue;
    double dist = std::abs(getSignedDistance(basePlane.first, basePlane.second, jittered[i]));
    if (dist > maxPlaneDist) { maxPlaneDist = dist; i3 = i; }
  }

  if (i2 == static_cast<size_t>(-1) || i3 == static_cast<size_t>(-1) || maxPlaneDist < 1e-9) {
    throw std::runtime_error("Points are collinear or coplanar; cannot build 3D hull");
  }

  double cx = (jittered[i0].X() + jittered[i1].X() + jittered[i2].X() + jittered[i3].X()) / 4.0;
  double cy = (jittered[i0].Y() + jittered[i1].Y() + jittered[i2].Y() + jittered[i3].Y()) / 4.0;
  double cz = (jittered[i0].Z() + jittered[i1].Z() + jittered[i2].Z() + jittered[i3].Z()) / 4.0;
  gp_Pnt center(cx, cy, cz);

  struct Face { std::array<int, 3> v; gp_Pnt normal; double offset; };
  std::vector<Face> faces;

  auto createFace = [&](size_t v0, size_t v1, size_t v2) -> Face {
    auto [normal, offset] = makePlane(v0, v1, v2);
    if (getSignedDistance(normal, offset, center) > 0) {
      normal = gp_Pnt(-normal.X(), -normal.Y(), -normal.Z());
      offset = -offset;
      return {{static_cast<int>(v2), static_cast<int>(v1), static_cast<int>(v0)}, normal, offset};
    }
    return {{static_cast<int>(v0), static_cast<int>(v1), static_cast<int>(v2)}, normal, offset};
  };

  faces.push_back(createFace(i0, i1, i2));
  faces.push_back(createFace(i0, i2, i3));
  faces.push_back(createFace(i0, i3, i1));
  faces.push_back(createFace(i1, i3, i2));

  std::set<size_t> processed = {i0, i1, i2, i3};
  for (size_t i = 0; i < jittered.size(); ++i) {
    if (processed.count(i)) continue;
    const gp_Pnt& pt = jittered[i];

    std::vector<size_t> visible;
    for (size_t f = 0; f < faces.size(); ++f) {
      if (getSignedDistance(faces[f].normal, faces[f].offset, pt) > 1e-9) {
        visible.push_back(f);
      }
    }
    if (visible.empty()) continue;

    // Horizon edges
    std::vector<std::pair<int, int>> horizon;
    for (size_t fIdx : visible) {
      const Face& f = faces[fIdx];
      for (int j = 0; j < 3; ++j) {
        int v1 = f.v[j];
        int v2 = f.v[(j + 1) % 3];
        bool found = false;
        for (auto& h : horizon) {
          if ((h.first == v2 && h.second == v1)) {
            // edge appears twice -> internal, remove
            h = {-1, -1};
            found = true;
            break;
          }
        }
        if (!found) {
          horizon.push_back({v1, v2});
        }
      }
    }

    // Remove marked edges
    horizon.erase(std::remove_if(horizon.begin(), horizon.end(),
        [](const auto& h) { return h.first == -1; }), horizon.end());

    // Remove visible faces
    for (auto it = visible.rbegin(); it != visible.rend(); ++it) {
      faces.erase(faces.begin() + static_cast<ptrdiff_t>(*it));
    }

    // Add new faces from horizon
    for (const auto& h : horizon) {
      faces.push_back(createFace(static_cast<size_t>(h.first), static_cast<size_t>(h.second), i));
    }
    processed.insert(i);
  }

  std::vector<std::array<int, 3>> result;
  for (const auto& f : faces) {
    result.push_back(f.v);
  }
  return result;
}
```

**Step 2: Verify syntax** — C++ compilation will happen in Chunk 6 (container build).

---

### Task 2.3: Implement OpCreateConvexHull

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

**Step 1: Add OpCreateConvexHull function**

```cpp
static OpResult OpCreateConvexHull(
    const std::vector<gp_Pnt>& points,
    double deflection,
    const std::string& entityId) {
  OpResult r;
  if (points.size() < 4) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "Convex hull: requires at least 4 points";
    return r;
  }
  if (deflection <= 0.0) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "Convex hull: deflection must be positive";
    return r;
  }

  std::vector<std::array<int, 3>> hullFaces;
  try {
    hullFaces = computeConvexHull3D(points);
  } catch (const std::runtime_error& e) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "Convex hull: " + std::string(e.what());
    return r;
  }

  std::vector<std::vector<int>> faces;
  faces.reserve(hullFaces.size());
  for (const auto& tri : hullFaces) {
    faces.push_back({tri[0], tri[1], tri[2]});
  }

  return OpCreatePolyhedron(points, faces, deflection, entityId);
}
```

---

## Chunk 3: gRPC Handlers + Execute Switch + CLI Mode

### Task 3.1: Add HandleCreatePolyhedron + HandleCreateConvexHull

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

**Step 1: Add HandleCreatePolyhedron** (after HandleCreatePyramid)

```cpp
Status HandleCreatePolyhedron(const ExecuteRequest* request, ExecuteResponse* response) {
  const auto& op = request->create_polyhedron();

  std::vector<gp_Pnt> points;
  points.reserve(op.points_inline_size());
  for (const auto& p : op.points_inline()) {
    points.emplace_back(p.x(), p.y(), p.z());
  }

  std::vector<std::vector<int>> faces;
  faces.reserve(op.faces_size());
  for (const auto& f : op.faces()) {
    std::vector<int> faceIdxs;
    faceIdxs.reserve(f.vertex_indices_size());
    for (int idx : f.vertex_indices()) {
      faceIdxs.push_back(idx);
    }
    faces.push_back(std::move(faceIdxs));
  }

  auto r = OpCreatePolyhedron(points, faces, op.deflection(), op.entity_id());
  if (!r.ok) {
    return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
  }

  auto* success = response->mutable_success();
  success->set_shape_id(r.shapeId);
  auto* polyResult = success->mutable_polyhedron();
  polyResult->set_shape_id(r.shapeId);

  auto it = g_shapeCache.find(r.shapeId);
  if (it != g_shapeCache.end()) {
    ComputeShapeMetrics(it->second, response->mutable_metrics());
  }

  return Status::OK;
}
```

**Step 2: Add HandleCreateConvexHull**

```cpp
Status HandleCreateConvexHull(const ExecuteRequest* request, ExecuteResponse* response) {
  const auto& op = request->create_convex_hull();

  std::vector<gp_Pnt> points;
  points.reserve(op.points_inline_size());
  for (const auto& p : op.points_inline()) {
    points.emplace_back(p.x(), p.y(), p.z());
  }

  // Merge points from existing shape_ids (face triangulation)
  for (const auto& shapeId : op.shape_ids()) {
    auto it = g_shapeCache.find(shapeId);
    if (it == g_shapeCache.end()) {
      return SetFailure(response,
        ExecutionFailureCode::EXECUTION_FAILURE_CODE_MISSING_ENTITY,
        "Shape not found in cache: " + shapeId);
    }
    TopLoc_Location loc;
    for (TopExp_Explorer exp(it->second, TopAbs_FACE); exp.More(); exp.Next()) {
      Handle(Poly_Triangulation) tri = BRep_Tool::Triangulation(TopoDS::Face(exp.Current()), loc);
      if (!tri.IsNull()) {
        gp_Trsf trsf = loc.Transformation();
        for (Standard_Integer i = 1; i <= tri->NbNodes(); ++i) {
          gp_Pnt node = tri->Node(i).Transformed(trsf);
          points.emplace_back(node.X(), node.Y(), node.Z());
        }
      }
    }
  }

  auto r = OpCreateConvexHull(points, op.deflection(), op.entity_id());
  if (!r.ok) {
    return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
  }

  auto* success = response->mutable_success();
  success->set_shape_id(r.shapeId);
  auto* hullResult = success->mutable_convex_hull();
  hullResult->set_shape_id(r.shapeId);

  auto it = g_shapeCache.find(r.shapeId);
  if (it != g_shapeCache.end()) {
    ComputeShapeMetrics(it->second, response->mutable_metrics());
  }

  return Status::OK;
}
```

**Step 3: Add cases to Execute switch**

Add before `case ExecuteRequest::kImportBrep:`:
```cpp
case ExecuteRequest::kCreatePolyhedron:
  return HandleCreatePolyhedron(request, response);
case ExecuteRequest::kCreateConvexHull:
  return HandleCreateConvexHull(request, response);
```

**Step 4: Add CLI mode branches**

Add after `create_pyramid` branch in CLI mode:
```cpp
} else if (op == "create_polyhedron") {
  // Parse JSON: points array, faces array, deflection, entity_id
  // ... (minimal JSON parsing consistent with existing CLI style)
} else if (op == "create_convex_hull") {
  // Parse JSON: points array, optional shape_ids, deflection, entity_id
}
```

---

## Chunk 4: NativeKernelAdapter opMap + Param Normalization

### Task 4.1: Add opMap entries

**Files:**
- Modify: `src/core/harness/native-kernel-adapter.ts`

**Step 1: Add to opMap**

```typescript
create_polyhedron: 'create_polyhedron',
create_convex_hull: 'create_convex_hull',
```

**Step 2: Add param normalization in buildExecuteRequest**

```typescript
if (step.name === 'create_polyhedron') {
  req.create_polyhedron = {
    points_inline: (step.parameters.points as [number, number, number][]).map(([x, y, z]) => ({ x, y, z })),
    faces: (step.parameters.faces as number[][]).map(face => ({ vertex_indices: face })),
    deflection: step.parameters.deflection ?? 0.1,
    entity_id: step.parameters.entity_id ?? '',
  };
} else if (step.name === 'create_convex_hull') {
  req.create_convex_hull = {
    points_inline: (step.parameters.points as [number, number, number][]).map(([x, y, z]) => ({ x, y, z })),
    shape_ids: (step.parameters.shape_ids ?? []) as string[],
    deflection: step.parameters.deflection ?? 0.1,
    entity_id: step.parameters.entity_id ?? '',
  };
}
```

---

## Chunk 5: Oracle Reference Parts (TDD - write fixtures first)

### Task 5.1: Create tetrahedron.json

**Files:**
- Create: `tests/fixtures/oracle/tetrahedron.json`

```json
{
  "id": "tetrahedron",
  "name": "Tetrahedron (4 points)",
  "description": "Convex hull of 4 non-coplanar points forming a tetrahedron",
  "script": {
    "name": "create_tetrahedron_hull",
    "steps": [
      {
        "name": "create_convex_hull",
        "parameters": {
          "points": [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
          "deflection": 0.1,
          "entity_id": "tetra_hull"
        }
      }
    ]
  },
  "expected": {
    "volume": 0.166667,
    "surfaceArea": 2.366025,
    "bbox": { "min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 1.0] },
    "faceCount": 4,
    "edgeCount": 6,
    "vertexCount": 4,
    "isValid": true
  },
  "tolerances": {
    "volume": 1e-3,
    "surfaceArea": 1e-3,
    "bbox": 1e-3,
    "counts": 0
  }
}
```

### Task 5.2: Create cube_from_hull.json

**Files:**
- Create: `tests/fixtures/oracle/cube_from_hull.json`

```json
{
  "id": "cube_from_hull",
  "name": "Cube from 8 corner points (convex hull)",
  "description": "Convex hull of the 8 corners of a unit cube",
  "script": {
    "name": "create_cube_from_hull",
    "steps": [
      {
        "name": "create_convex_hull",
        "parameters": {
          "points": [
            [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
            [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
          ],
          "deflection": 0.1,
          "entity_id": "cube_hull"
        }
      }
    ]
  },
  "expected": {
    "volume": 1.0,
    "surfaceArea": 6.0,
    "bbox": { "min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 1.0] },
    "faceCount": 6,
    "edgeCount": 12,
    "vertexCount": 8,
    "isValid": true
  },
  "tolerances": {
    "volume": 1e-3,
    "surfaceArea": 1e-3,
    "bbox": 1e-3,
    "counts": 0
  }
}
```

### Task 5.3: Create irregular_polyhedron.json

**Files:**
- Create: `tests/fixtures/oracle/irregular_polyhedron.json`

```json
{
  "id": "irregular_polyhedron",
  "name": "Irregular Polyhedron",
  "description": "Direct polyhedron creation with custom points and faces",
  "script": {
    "name": "create_irregular_polyhedron",
    "steps": [
      {
        "name": "create_polyhedron",
        "parameters": {
          "points": [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
          "faces": [[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],
          "deflection": 0.1,
          "entity_id": "irregular_poly"
        }
      }
    ]
  },
  "expected": {
    "volume": 1.0,
    "surfaceArea": 6.0,
    "bbox": { "min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 1.0] },
    "faceCount": 6,
    "edgeCount": 12,
    "vertexCount": 8,
    "isValid": true
  },
  "tolerances": {
    "volume": 1e-3,
    "surfaceArea": 1e-3,
    "bbox": 1e-3,
    "counts": 0
  }
}
```

---

## Chunk 6: Build & Deploy to Container

### Task 6.1: Compile kernel_worker in container

Run:
```
docker exec webcad-kernel-test bash -c "cd /kernel/build && ninja kernel_worker && cp kernel_worker /kernel/kernel_worker"
docker restart webcad-kernel-test
```

Wait for container to be ready (~10s), then test with `curl` or health check.

### Task 6.2: Verify kernel responds

Run health check against `localhost:50051` via the test bridge or gRPC client.

---

## Chunk 7: Update Integration Test Corpus

### Task 7.1: Add new reference parts to native-oracle.integration.test.ts

**Files:**
- Modify: `tests/oracle/native-oracle.integration.test.ts`

**Step 1: Update fixture loading** to include the 3 new reference parts (total: 7 parts).

**Step 2: Update assertion** from `expect(report.totalParts).toBe(4)` to `expect(report.totalParts).toBe(7)`.

---

## Chunk 8: Verify & Commit

### Task 8.1: Run full verification

Run:
```
npx tsc --noEmit
npx vitest run tests/oracle
```

Expected: All tests pass, including 7 reference parts against live kernel.

### Task 8.2: Commit all changes

Run:
```
git add proto/ src/core/gateway/kernel-worker.cpp src/core/harness/native-kernel-adapter.ts tests/fixtures/oracle/ tests/oracle/ docs/epics/WEBCAD-EPIC-EC-v5.md
git commit -m "feat(WC-EC-15): port createPolyhedron + createConvexHull to native kernel"
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-11-22-wc-ec-15-implementation-plan.md`. Ready to execute?**
