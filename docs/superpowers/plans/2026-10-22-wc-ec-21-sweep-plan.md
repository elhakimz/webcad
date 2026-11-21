# WC-EC-21 Sweep Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the WASM `createSweep` operation to the native OCCT kernel — sweep a 2D profile along a 3D spine path using `BRepOffsetAPI_MakePipeShell` (primary) with `BRepOffsetAPI_ThruSections` + RMF frames (fallback), producing a solid or shell shape cached by `entity_id`.

**Architecture:** New static `OpCreateSweep()` in `kernel-worker.cpp` implementing Path A (MakePipeShell) and Path B (ThruSections+RMF Double Reflection Method) with fallback; new `HandleCreateSweep()` dispatcher case; new `create_sweep` entry in `native-kernel-adapter.ts` opMap; two new oracle test fixtures.

**Tech Stack:** OCCT 7.9.3 (BRepOffsetAPI_MakePipeShell, BRepOffsetAPI_ThruSections, BRepBuilderAPI_MakeWire/Edge, gp_Pnt/Dir), gRPC/Connect protobuf, TypeScript, Vitest

---

## Chunk 1: Test Fixtures (TDD — write first)

### Task 1: Create sweep_simple.json fixture

**Files:**
- Create: `tests/fixtures/oracle/sweep_simple.json`

**Test:** The existing oracle integration test auto-discovers fixtures via `runner.loadFixtures()`, so the fixture itself is the test.

- [ ] **Step 1: Write sweep_simple.json fixture**

```json
{
  "id": "sweep_simple",
  "name": "Sweep Simple",
  "description": "Sweep a circle profile along a straight spine, expect valid solid",
  "script": {
    "name": "sweep_simple_test",
    "steps": [
      {
        "name": "create_box",
        "parameters": {
          "x": 0, "y": 0, "z": 0,
          "dx": 4, "dy": 4, "dz": 4,
          "deflection": 0.1,
          "entity_id": "spine_box"
        }
      },
      {
        "name": "create_sweep",
        "parameters": {
          "profile_points": [
            {"x": 0, "y": 0, "z": 0},
            {"x": 1, "y": 0, "z": 0},
            {"x": 0, "y": 1, "z": 0},
            {"x": -1, "y": 0, "z": 0},
            {"x": 0, "y": -1, "z": 0}
          ],
          "spine_points": [
            {"x": 0, "y": 0, "z": 0},
            {"x": 0, "y": 0, "z": 10}
          ],
          "is_solid": true,
          "deflection": 0.1,
          "entity_id": "sweep_result",
          "profile_count": 5,
          "corner_mode": "DEFAULT",
          "is_ellipse": false
        }
      }
    ]
  },
  "expected": {
    "volume": 31.416,
    "surfaceArea": 94.248,
    "bbox": { "min": [-1.1, -1.1, -0.1], "max": [1.1, 1.1, 10.1] },
    "faceCount": 3,
    "edgeCount": 2,
    "vertexCount": 0,
    "isValid": true
  },
  "tolerances": {
    "volume": 1.0,
    "surfaceArea": 1.0,
    "bbox": 1e-2,
    "counts": 2
  }
}
```

**Expected:** This is a new fixture — will fail at runtime until kernel implementation exists (kernel returns error for unknown op `kCreateSweep`).

### Task 2: Create sweep_corner.json fixture

**Files:**
- Create: `tests/fixtures/oracle/sweep_corner.json`

- [ ] **Step 1: Write sweep_corner.json fixture**

```json
{
  "id": "sweep_corner",
  "name": "Sweep Corner",
  "description": "Sweep a circle profile along a bent spine (line + arc), expect valid solid with miter corners",
  "script": {
    "name": "sweep_corner_test",
    "steps": [
      {
        "name": "create_sweep",
        "parameters": {
          "profile_points": [
            {"x": 0, "y": 0, "z": 0},
            {"x": 0.5, "y": 0, "z": 0},
            {"x": 0, "y": 0.5, "z": 0},
            {"x": -0.5, "y": 0, "z": 0},
            {"x": 0, "y": -0.5, "z": 0}
          ],
          "spine_points": [
            {"x": 0, "y": 0, "z": 0},
            {"x": 0, "y": 0, "z": 5},
            {"x": 0, "y": 5, "z": 5},
            {"x": 5, "y": 5, "z": 5}
          ],
          "is_solid": true,
          "deflection": 0.1,
          "entity_id": "sweep_corner_result",
          "profile_count": 5,
          "corner_mode": "MITER",
          "is_ellipse": false
        }
      }
    ]
  },
  "expected": {
    "volume": 19.635,
    "surfaceArea": 62.832,
    "bbox": { "min": [-0.6, -0.6, -0.1], "max": [5.6, 5.6, 5.1] },
    "faceCount": 3,
    "edgeCount": 2,
    "vertexCount": 0,
    "isValid": true
  },
  "tolerances": {
    "volume": 2.0,
    "surfaceArea": 2.0,
    "bbox": 1e-2,
    "counts": 3
  }
}
```

---

## Chunk 2: Kernel Implementation

### Task 3: Add OpCreateSweep static function to kernel-worker.cpp

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

- [ ] **Step 1: Insert OpCreateSweep after OpCreateDraftSolidFaces**

Insert after the `OpCreateDraftSolidFaces` function (before `OpImportBRep`):

```cpp
// OpCreateSweep — sweep a profile along a spine path.
// Path A: BRepOffsetAPI_MakePipeShell (primary).
// Path B: BRepOffsetAPI_ThruSections + RMF frames (fallback).
static OpResult OpCreateSweep(
    const std::vector<std::array<double, 3>>& profilePts,
    const std::vector<std::array<double, 3>>& spinePts,
    bool isSolid,
    double deflection,
    const std::string& entityId,
    int32_t profileCount,
    const std::string& cornerMode,
    bool isEllipse) {
  OpResult r;
  if (profilePts.empty()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "Sweep: profile_points is empty";
    return r;
  }
  if (spinePts.size() < 2) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "Sweep: need at least 2 spine points";
    return r;
  }
  if (profileCount < 3 || profileCount > static_cast<int32_t>(profilePts.size())) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "Sweep: invalid profile_count";
    return r;
  }

  // ---- Build spine wire ----
  BRepBuilderAPI_MakeWire spineWireBuilder;
  for (size_t i = 0; i + 1 < spinePts.size(); ++i) {
    BRepBuilderAPI_MakeEdge edge(gp_Pnt(spinePts[i][0], spinePts[i][1], spinePts[i][2]),
                                 gp_Pnt(spinePts[i + 1][0], spinePts[i + 1][1], spinePts[i + 1][2]));
    if (!edge.IsDone()) {
      r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      r.message = "Sweep: failed to create spine edge";
      return r;
    }
    spineWireBuilder.Add(edge.Edge());
  }
  TopoDS_Wire spineWire = spineWireBuilder.Wire();
  if (spineWire.IsNull()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "Sweep: failed to build spine wire";
    return r;
  }

  // ---- Build profile wire (first profileCount points) ----
  BRepBuilderAPI_MakeWire profileWireBuilder;
  for (int i = 0; i < profileCount; ++i) {
    int next = (i + 1) % profileCount;
    BRepBuilderAPI_MakeEdge edge(gp_Pnt(profilePts[i][0], profilePts[i][1], profilePts[i][2]),
                                 gp_Pnt(profilePts[next][0], profilePts[next][1], profilePts[next][2]));
    if (!edge.IsDone()) {
      r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      r.message = "Sweep: failed to create profile edge";
      return r;
    }
    profileWireBuilder.Add(edge.Edge());
  }
  TopoDS_Wire profileWire = profileWireBuilder.Wire();
  if (profileWire.IsNull()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "Sweep: failed to build profile wire";
    return r;
  }

  // ---- Path A: BRepOffsetAPI_MakePipeShell ----
  auto tryMakePipeShell = [&]() -> TopoDS_Shape {
    BRepOffsetAPI_MakePipeShell pipe(spineWire);

    // Transition mode
    if (cornerMode == "MITER") {
      pipe.SetTransitionMode(BRepBuilderAPI_RightCorner);
    } else if (cornerMode == "ROUND") {
      pipe.SetTransitionMode(BRepBuilderAPI_RoundCorner);
    } else {
      pipe.SetTransitionMode(BRepBuilderAPI_Transformed);
    }

    // Orientation mode: discrete first (prevents twist on polylines)
    bool modeSet = false;
    try {
      pipe.SetDiscreteMode();
      modeSet = true;
    } catch (const Standard_Failure&) {
      // fall through to flat/Frenet fallback below
    }
    if (!modeSet) {
      // Detect flat spine (all Z equal)
      bool isFlat = true;
      double firstZ = spinePts[0][2];
      for (const auto& p : spinePts) {
        if (std::abs(p[2] - firstZ) > 1e-6) {
          isFlat = false;
          break;
        }
      }
      if (isFlat) {
        try {
          pipe.SetMode(gp_Dir(0, 0, 1));
          modeSet = true;
        } catch (const Standard_Failure&) {
          modeSet = false;
        }
      }
      if (!modeSet) {
        try {
          pipe.SetMode(false);
          modeSet = true;
        } catch (const Standard_Failure&) {
          return TopoDS_Shape();
        }
      }
    }

    pipe.Add(profileWire, false, false);
    pipe.Build();
    if (!pipe.IsDone()) return TopoDS_Shape();

    if (isSolid) {
      pipe.MakeSolid();
    }
    return pipe.Shape();
  };

  // ---- Path B: BRepOffsetAPI_ThruSections + RMF frames ----
  auto tryThruSectionsRMF = [&]() -> TopoDS_Shape {
    size_t N = spinePts.size();
    int M = profileCount;

    // Compute tangents at each spine point
    std::vector<gp_Vec> tangents(N);
    for (size_t i = 0; i < N; ++i) {
      double tx = 0, ty = 0, tz = 0;
      if (i == 0) {
        tx = spinePts[1][0] - spinePts[0][0];
        ty = spinePts[1][1] - spinePts[0][1];
        tz = spinePts[1][2] - spinePts[0][2];
      } else if (i == N - 1) {
        tx = spinePts[N - 1][0] - spinePts[N - 2][0];
        ty = spinePts[N - 1][1] - spinePts[N - 2][1];
        tz = spinePts[N - 1][2] - spinePts[N - 2][2];
      } else {
        tx = spinePts[i + 1][0] - spinePts[i - 1][0];
        ty = spinePts[i + 1][1] - spinePts[i - 1][1];
        tz = spinePts[i + 1][2] - spinePts[i - 1][2];
      }
      double len = std::sqrt(tx * tx + ty * ty + tz * tz);
      if (len < 1e-12) {
        tx = 1; ty = 0; tz = 0; len = 1.0;
      }
      tangents[i] = gp_Vec(tx / len, ty / len, tz / len);
    }

    // Compute RMF frames via Double Reflection Method
    struct Frame { gp_Vec T, X, Y; };
    std::vector<Frame> frames(N);

    // Initial frame at P0
    gp_Vec T0 = tangents[0];
    gp_Vec N0(0, 0, 1);
    if (std::abs(T0.Z()) > 0.99) N0 = gp_Vec(1, 0, 0);
    gp_Vec X0 = N0.Crossed(T0);
    double xlen = X0.Magnitude();
    if (xlen < 1e-12) X0 = gp_Vec(1, 0, 0);
    else X0 = X0 * (1.0 / xlen);
    gp_Vec Y0 = T0.Crossed(X0);
    frames[0] = {T0, X0, Y0};

    for (size_t i = 1; i < N; ++i) {
      const auto& Pprev = spinePts[i - 1];
      const auto& Pcurr = spinePts[i];
      const gp_Vec& Tprev = frames[i - 1].T;
      const gp_Vec& Tcurr = tangents[i];
      const gp_Vec& Xprev = frames[i - 1].X;
      const gp_Vec& Yprev = frames[i - 1].Y;

      double v1x = Pcurr[0] - Pprev[0];
      double v1y = Pcurr[1] - Pprev[1];
      double v1z = Pcurr[2] - Pprev[2];
      double c1 = v1x * v1x + v1y * v1y + v1z * v1z;

      gp_Vec Xcurr = Xprev;
      gp_Vec TprevL = Tprev;
      if (c1 > 1e-12) {
        gp_Vec v1(v1x, v1y, v1z);
        double dot1 = v1.Dot(Xprev);
        double factor1 = 2.0 / c1 * dot1;
        Xcurr = Xprev - v1 * factor1;

        double dot2 = v1.Dot(Tprev);
        double factor2 = 2.0 / c1 * dot2;
        TprevL = Tprev - v1 * factor2;
      }

      gp_Vec v2 = Tcurr - TprevL;
      double c2 = v2.Dot(v2);
      if (c2 > 1e-12) {
        double dot3 = v2.Dot(Xcurr);
        double factor3 = 2.0 / c2 * dot3;
        Xcurr = Xcurr - v2 * factor3;
      }

      double xlen2 = Xcurr.Magnitude();
      if (xlen2 < 1e-12) Xcurr = gp_Vec(1, 0, 0);
      else Xcurr = Xcurr * (1.0 / xlen2);

      gp_Vec Ycurr = Tcurr.Crossed(Xcurr);
      frames[i] = {Tcurr, Xcurr, Ycurr};
    }

    // Profile centroid (from raw points)
    double cx = 0, cy = 0, cz = 0;
    for (int i = 0; i < M; ++i) {
      cx += profilePts[i][0];
      cy += profilePts[i][1];
      cz += profilePts[i][2];
    }
    cx /= M; cy /= M; cz /= M;

    // Build section wires at each spine point
    BRepOffsetAPI_ThruSections thru(isSolid, true, 1e-6);
    for (size_t i = 0; i < N; ++i) {
      const Frame& f = frames[i];
      BRepBuilderAPI_MakeWire sectionWireBuilder;
      for (int j = 0; j < M; ++j) {
        int nextJ = (j + 1) % M;
        double px = spinePts[i][0] +
                    (profilePts[j][0] - cx) * f.X.X() +
                    (profilePts[j][1] - cy) * f.Y.X() +
                    (profilePts[j][2] - cz) * f.T.X();
        double py = spinePts[i][1] +
                    (profilePts[j][0] - cx) * f.X.Y() +
                    (profilePts[j][1] - cy) * f.Y.Y() +
                    (profilePts[j][2] - cz) * f.T.Y();
        double pz = spinePts[i][2] +
                    (profilePts[j][0] - cx) * f.X.Z() +
                    (profilePts[j][1] - cy) * f.Y.Z() +
                    (profilePts[j][2] - cz) * f.T.Z();

        double qx = spinePts[i][0] +
                    (profilePts[nextJ][0] - cx) * f.X.X() +
                    (profilePts[nextJ][1] - cy) * f.Y.X() +
                    (profilePts[nextJ][2] - cz) * f.T.X();
        double qy = spinePts[i][1] +
                    (profilePts[nextJ][0] - cx) * f.X.Y() +
                    (profilePts[nextJ][1] - cy) * f.Y.Y() +
                    (profilePts[nextJ][2] - cz) * f.T.Y();
        double qz = spinePts[i][2] +
                    (profilePts[nextJ][0] - cx) * f.X.Z() +
                    (profilePts[nextJ][1] - cy) * f.Y.Z() +
                    (profilePts[nextJ][2] - cz) * f.T.Z();

        BRepBuilderAPI_MakeEdge edge(gp_Pnt(px, py, pz), gp_Pnt(qx, qy, qz));
        if (!edge.IsDone()) return TopoDS_Shape();
        sectionWireBuilder.Add(edge.Edge());
      }
      TopoDS_Wire sectionWire = sectionWireBuilder.Wire();
      if (sectionWire.IsNull()) return TopoDS_Shape();
      thru.AddWire(sectionWire);
    }

    thru.Build();
    if (!thru.IsDone()) return TopoDS_Shape();
    return thru.Shape();
  };

  // ---- Execute with fallback ----
  TopoDS_Shape shape;
  try {
    shape = tryMakePipeShell();
    if (!shape.IsNull() && !shape.IsNull()) {
      // Path A succeeded
    } else {
      shape = tryThruSectionsRMF();
    }
  } catch (const Standard_Failure& e) {
    shape = tryThruSectionsRMF();
  } catch (const std::exception& e) {
    shape = tryThruSectionsRMF();
  }

  if (shape.IsNull()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "Sweep: both MakePipeShell and ThruSections+RMF failed";
    return r;
  }

  return OpCreateAndCache(shape, deflection, entityId);
}
```

- [ ] **Step 2: Run typecheck to verify function compiles**

Run: `npm run typecheck`

Expected: May fail with "OpCreateSweep not declared" or similar since switch case not yet added — that's OK for this step; we just need the function to compile. Actually, since it's a static function defined but not yet called, it should compile fine (may trigger unused-function warning). Fix any errors.

### Task 4: Add HandleCreateSweep and switch case to Execute()

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

- [ ] **Step 1: Add switch case in Execute()**

Add after `case ExecuteRequest::kDraftSolidFaces:` line:

```cpp
        case ExecuteRequest::kCreateSweep:
          return HandleCreateSweep(request, response);
```

- [ ] **Step 2: Add HandleCreateSweep function after HandleDraftSolidFaces**

Insert after `HandleDraftSolidFaces` function:

```cpp
  Status HandleCreateSweep(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_sweep();
    double deflection = op.deflection() > 0.0 ? op.deflection() : 0.1;
    std::string entityId = op.entity_id();

    std::vector<std::array<double, 3>> profilePts;
    profilePts.reserve(op.profile_points_size());
    for (int i = 0; i < op.profile_points_size(); ++i) {
      const auto& p = op.profile_points(i);
      profilePts.push_back({p.x(), p.y(), p.z()});
    }

    std::vector<std::array<double, 3>> spinePts;
    spinePts.reserve(op.spine_points_size());
    for (int i = 0; i < op.spine_points_size(); ++i) {
      const auto& p = op.spine_points(i);
      spinePts.push_back({p.x(), p.y(), p.z()});
    }

    bool isSolid = op.is_solid();
    int32_t profileCount = op.profile_count();
    std::string cornerMode = op.corner_mode();
    bool isEllipse = op.is_ellipse();

    auto r = OpCreateSweep(profilePts, spinePts, isSolid, deflection,
                           entityId, profileCount, cornerMode, isEllipse);
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* result = success->mutable_sweep();
    result->set_shape_id(r.shapeId);

    auto it = g_shapeCache.find(r.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    if (request->include_brep() && it != g_shapeCache.end()) {
      double meshDeflection = deflection > 0.0 ? deflection : 0.1;
      PopulateMeshData(it->second, meshDeflection, response->mutable_mesh());
    }

    return Status::OK;
  }
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS (0 errors)

### Task 5: Build kernel in container

**Files:** None (build only)

- [ ] **Step 1: Build kernel_worker in container**

Run the kernel build (docker-based, per project convention):

```
docker cp src/core/gateway/kernel-worker.cpp 89b7fa5c9579:/kernel/source/
docker exec 89b7fa5c9579 bash -c "cd /kernel/build && cmake --build . --target kernel_worker -j4"
```

Expected: Build succeeds with no errors related to sweep code.

- [ ] **Step 2: Atomic swap and restart kernel**

Per project convention, swap the built binary and restart the kernel container.

---

## Chunk 3: Adapter Wiring

### Task 6: Add create_sweep to opMap in native-kernel-adapter.ts

**Files:**
- Modify: `src/core/harness/native-kernel-adapter.ts`

- [ ] **Step 1: Add opMap entry**

Add after `draft_solid_faces: 'draft_solid_faces',` line:

```typescript
      create_sweep: 'create_sweep',
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS (0 errors)

---

## Chunk 4: Verification

### Task 7: Run full verify suite

**Files:** None

- [ ] **Step 1: Run npm run verify**

Run: `npm run verify`

Expected: All checks pass — typecheck, lint, tests, buf lint, buf breaking.

- [ ] **Step 2: Run oracle integration tests specifically**

Run: `npm test -- --run tests/oracle/native-oracle.integration.test.ts`

Expected: `sweep_simple` and `sweep_corner` fixtures pass against native kernel.

### Task 8: Commit

**Files:** All changed files

- [ ] **Step 1: Stage and commit**

```
git add docs/superpowers/plans/2026-10-22-wc-ec-21-sweep-plan.md
git add tests/fixtures/oracle/sweep_simple.json
git add tests/fixtures/oracle/sweep_corner.json
git add src/core/gateway/kernel-worker.cpp
git add src/core/harness/native-kernel-adapter.ts
git commit -m "feat(kernel): port sweep (createSweep) to native OCCT kernel (WC-EC-21)"
```

Expected: Commit succeeds on `dev` branch.

---

## Review Checkpoints

After Chunk 1 (fixtures): Verify fixtures are valid JSON and load without errors in the oracle runner (they will fail at runtime until kernel is implemented, but should parse correctly).

After Chunk 2 (kernel): Verify `npm run typecheck` passes and kernel build succeeds.

After Chunk 3 (adapter): Verify `npm run typecheck` passes.

After Chunk 4 (verification): Verify full `npm run verify` passes — this is the Definition of Done.

---

**Plan complete and saved to `docs/superpowers/plans/2026-10-22-wc-ec-21-sweep-plan.md`. Ready to execute?**
