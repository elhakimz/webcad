# WC-EC-16 Design: Port Transforms (matrix, translate, rotate, mirror, scale)

**Ticket**: WC-EC-16 — Port: transforms (matrix, translate, rotate, mirror, scale)
**Priority**: high · **Agent Suitability**: A · **Phase**: 2
**Depends on**: WC-EC-14 (native primitives), WC-EC-15 (polyhedron & convex hull)
**ADR**: none required (proto fields already defined)

---

## 1. Objective

Port 5 transform operations from the WASM kernel (`OCCWorker.ts`) to the native C++ OCCT kernel behind the gRPC `Kernel.Execute` protocol:

| Op | Proto field | WASM type | Description |
|----|-----------|-----------|-------------|
| `multMatrixShape` | 26 | `MultMatrixShapeOp` | Apply arbitrary 4x4 transformation matrix (gp_GTrsf / BRepBuilderAPI_GTransform) |
| `transformShape` | 27 | `TransformShapeOp` | Apply translation (gp_Trsf.SetTranslation) |
| `rotateShape` | 28 | `RotateShapeOp` | Apply Euler rotation (rx, ry, rz) about center (cx, cy, cz) |
| `mirrorShape` | 29 | `MirrorShapeOp` | Mirror across a plane defined by p1, p2, or normal |
| `scaleShape` | 30 | `ScaleShapeOp` | Scale about a center point (uniform or non-uniform via gp_GTrsf) |

Result types already exist in `ExecuteSuccess` oneof (fields 18-22): `multMatrixShape`, `transformShape`, `rotateShape`, `mirrorShape`, `scaleShape`. No proto changes needed.

The WASM handler is the behavioral reference; the oracle suite (WC-EC-13) provides verification via analytic expected metrics.

---

## 2. Architecture

### 2.1 Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `OpTransformMatrix` | `kernel-worker.cpp` | Build `gp_Trsf` from 16 double matrix values, apply `BRepBuilderAPI_Transform` |
| `OpTransformTranslate` | `kernel-worker.cpp` | Build `gp_Trsf` with `SetTranslation`, apply `BRepBuilderAPI_Transform` |
| `OpTransformRotate` | `kernel-worker.cpp` | Build `gp_Trsf` with `SetRotation(axis, angle)`, apply `BRepBuilderAPI_Transform` |
| `OpTransformMirror` | `kernel-worker.cpp` | Build `gp_Trsf` with `SetMirror(gp_Ax2)`, apply `BRepBuilderAPI_Transform` |
| `OpTransformScale` | `kernel-worker.cpp` | Build `gp_Trsf` with `SetScaleValue(center, scale)`, apply `BRepBuilderAPI_Transform` |
| `ApplyTransform` (helper) | `kernel-worker.cpp` | Common: `BRepBuilderAPI_Transform/GTransform(shape, trsf, true)` + validity check + `EnsurePositiveVolume` + `OpCreateAndCache` |
| `HandleTransformMatrix` | `kernel-worker.cpp` | gRPC handler: parse `MultMatrixShapeOp`, call `OpTransformMatrix`, attach `ShapeMetrics` |
| `HandleTransformTranslate` | `kernel-worker.cpp` | gRPC handler: parse `TransformShapeOp`, call `OpTransformTranslate` |
| `HandleTransformRotate` | `kernel-worker.cpp` | gRPC handler: parse `RotateShapeOp`, call `OpTransformRotate` |
| `HandleTransformMirror` | `kernel-worker.cpp` | gRPC handler: parse `MirrorShapeOp`, call `OpTransformMirror` |
| `HandleTransformScale` | `kernel-worker.cpp` | gRPC handler: parse `ScaleShapeOp`, call `OpTransformScale` |
| 5 `case ExecuteRequest::k*` | `kernel-worker.cpp` | Switch dispatch to handlers |

`native-kernel-adapter.ts` `opMap` needs 5 entries added (see §4).

### 2.2 Data Flow

```
Client script (mult_matrix / transform / rotate / mirror / scale)
        │
        ▼
NativeKernelAdapter.buildExecuteRequest()
  → request[opField] = { ...params, entity_id: <ref to existing shape> }
        │
        ▼
Kernel.Execute (gRPC) → HandleTransformXxx
        │
        ├─▶ Look up input shape from g_shapeCache[entity_id]
        │
        ├─▶ ApplyTransform(shape, trsf) → TopoDS_Shape
                │     ├─▶ Build gp_Trsf/gp_GTrsf from op parameters
                │     ├─▶ BRepBuilderAPI_Transform/GTransform(shape, trsf, true)
        │     ├─▶ Check IsDone() / !IsNull()
                │     ├─▶ EnsurePositiveVolume(result) — fixes mirror/negative det orientation
                │     └─▶ OpCreateAndCache(transformed, deflection, resultId)
                │     │   where resultId = target_entity_id if non-empty, else entity_id
        │
        ├─▶ ComputeShapeMetrics(shape, response->mutable_metrics())
        │
        ▼
ExecuteResponse { success.xxx { shape_id }, metrics }
```

### 2.3 Proto Schema (no changes)

Transform ops already defined in `engine.proto` fields 26-30. Result types in `ExecuteSuccess` oneof fields 18-22. Each op has `entity_id` referencing the input shape in the kernel cache.

### 2.4 gRPC Handler Registration

Add 5 new `case ExecuteRequest::kTransformXxx` entries to the `switch (request->op_case())` in `Execute()`, each dispatching to a `HandleTransformXxx` function following the exact pattern of `HandleCreateBox` etc.

---

## 3. C++ Implementation Details

### 3.1 ApplyTransform Helper (shared)

```cpp
static OpResult ApplyTransform(
    const TopoDS_Shape& shape,
    const gp_Trsf& trsf,
    double deflection,
    const std::string& resultEntityId);

static OpResult ApplyTransform(
    const TopoDS_Shape& shape,
    const gp_GTrsf& gtrsf,
    double deflection,
    const std::string& resultEntityId);
```

1. Validate: `!shape.IsNull()`.
2. `BRepBuilderAPI_Transform transformBuilder(shape, trsf, true);` — `true` = preserve entities. Or `BRepBuilderAPI_GTransform(shape, gtrsf, true)` for non-uniform scale.
3. Check `transformBuilder.IsDone()`.
4. `TopoDS_Shape result = transformBuilder.Shape();`
5. Check `!result.IsNull()`.
6. `EnsurePositiveVolume(result)` — mirroring has determinant -1 and inverts face orientation; this restores positive volume in ShapeMetrics.
7. Return `OpCreateAndCache(result, deflection, resultEntityId)` where `resultEntityId = target_entity_id` if non-empty, else `entity_id`.

### 3.2 OpTransformMatrix (multMatrixShape)

**Proto `MultMatrixShapeOp`**: `entity_id` (1), `target_entity_id` (2), `deflection` (3), matrix values as repeated double `matrix` (4, 16 values row-major).

1. Build `gp_GTrsf gtrsf;` set from 16 matrix values.
2. Call `ApplyTransform(inputShape, gtrsf, deflection, resultEntityId)`.
3. On null/missing input shape → `MISSING_ENTITY` / `INVALID_PARAMETER`.

### 3.3 OpTransformTranslate (transformShape)

**Proto `TransformShapeOp`**: `entity_id` (1), `target_entity_id` (2), `dx` (3), `dy` (4), `dz` (5), `deflection` (6).

1. `gp_Trsf trsf; trsf.SetTranslation(gp_Vec(dx, dy, dz));`
2. Call `ApplyTransform(inputShape, trsf, deflection, resultEntityId)`.

### 3.4 OpTransformRotate (rotateShape)

**Proto `RotateShapeOp`**: `entity_id` (1), `target_entity_id` (2), `rx` (3), `ry` (4), `rz` (5), `cx` (6), `cy` (7), `cz` (8), `deflection` (9).

`rx, ry, rz` are Euler rotation angles (radians). Port of WASM `applyRotation` (OCCWorker.ts lines 80–140):

1. `gp_Trsf trsf;`
2. `trsf.SetTranslation(gp_Vec(-cx, -cy, -cz));` — translate to origin
3. `gp_Trsf rotX; rotX.SetRotation(gp_Ax1(gp_Pnt(0,0,0), gp_Dir(1,0,0)), rx);`
4. `gp_Trsf rotY; rotY.SetRotation(gp_Ax1(gp_Pnt(0,0,0), gp_Dir(0,1,0)), ry);`
5. `gp_Trsf rotZ; rotZ.SetRotation(gp_Ax1(gp_Pnt(0,0,0), gp_Dir(0,0,1)), rz);`
6. `trsf.Multiply(rotZ); trsf.Multiply(rotY); trsf.Multiply(rotX);` — compose rotations
7. `trsf.SetTranslationPart(gp_Vec(cx, cy, cz), true);` — translate back
8. Call `ApplyTransform(inputShape, trsf, deflection, resultEntityId)`.

### 3.5 OpTransformMirror (mirrorShape)

**Proto `MirrorShapeOp`**: `entity_id` (1), `target_entity_id` (2), `p1` (3, Point3D), `p2` (4, Point3D), `normal` (6, Point3D), `deflection` (5).

Port of WASM `mirrorShape` (OCCWorker.ts lines 4138–4189):

1. If `normal` is provided:
   - Plane point = `p1` (default origin if not set)
   - Plane normal = `normal`
   - `gp_Ax2 mirrorPlane(gp_Pnt(p1.x, p1.y, p1.z), gp_Dir(normal.x, normal.y, normal.z));`
2. If `normal` omitted:
   - 2D line in XY plane from `p1` to `p2`
   - Normal = `(p2.y - p1.y, -(p2.x - p1.x), 0)` → `gp_Dir(dy, -dx, 0)`
   - `gp_Ax2 mirrorPlane(gp_Pnt(p1.x, p1.y, p1.z), gp_Dir(dy, -dx, 0));`
3. `gp_Trsf trsf; trsf.SetMirror(mirrorPlane);`
4. Call `ApplyTransform(inputShape, trsf, deflection, resultEntityId)`.

### 3.6 OpTransformScale (scaleShape)

**Proto `ScaleShapeOp`**: `entity_id` (1), `target_entity_id` (2), `cx` (3), `cy` (4), `cz` (5), `factor_x` (6), `factor_y` (7), `factor_z` (8), `deflection` (9).

OCCT C++ uses `gp_Trsf::SetScale(gp_Pnt, factor)` for uniform scale, or `gp_GTrsf` + `BRepBuilderAPI_GTransform` for non-uniform.

1. If `factor_x == factor_y == factor_z` (uniform):
   - `gp_Trsf trsf; trsf.SetScale(gp_Pnt(cx, cy, cz), factor_x);`
   - Call `ApplyTransform(inputShape, trsf, deflection, resultEntityId)`.
2. If non-uniform:
   - Build `gp_GTrsf gtrsf;` with scale values `(cx, cy, cz, factor_x, factor_y, factor_z)`.
   - Call `ApplyTransform(inputShape, gtrsf, deflection, resultEntityId)`.
3. Any factor <= 0 → `INVALID_PARAMETER`.

---

### 3.7 NativeKernelAdapter `opMap` entries

Add to `opMap` in `src/core/harness/native-kernel-adapter.ts`:

```typescript
mult_matrix_shape: 'mult_matrix_shape',
transform_shape: 'transform_shape',
rotate_shape: 'rotate_shape',
mirror_shape: 'mirror_shape',
scale_shape: 'scale_shape',
```

Ensure `step.parameters.entity_id` and `step.parameters.target_entity_id` are passed through to the protobuf request.

---

## 4. Testing

### 4.1 Oracle Reference Parts (`tests/fixtures/oracle/`)

Add 5 new transform fixtures, each building a base primitive then transforming it:

1. **`transform_translate.json`**: Box at origin → translate by (5, 3, 2).
   - Expected: volume unchanged (125), surfaceArea unchanged (150), bbox shifted, counts unchanged.

2. **`transform_rotate.json`**: Box at origin → rotate 90° about Z axis.
   - Expected: volume unchanged, surfaceArea unchanged, bbox swapped, counts unchanged.

3. **`transform_mirror.json`**: Box at origin → mirror across XY plane (z → -z).
   - Expected: volume unchanged, surfaceArea unchanged, bbox reflected, counts unchanged.

4. **`transform_scale.json`**: Unit cube → scale by 2 about center.
   - Expected: volume = 8× original, surfaceArea = 4× original, bbox scaled, counts unchanged.

5. **`transform_matrix.json`**: Unit cube → apply composite matrix (translate + rotate).
   - Expected: volume unchanged, surfaceArea unchanged, metrics match composition result.

### 4.2 Tolerances

Reuse existing defaults: volume 1e-4, surfaceArea 1e-4, bbox 1e-3, counts 0.
Expected metrics computed analytically per fixture.

### 4.3 Live Integration

Add 5 new reference parts to `tests/oracle/native-oracle.integration.test.ts` corpus (total: 12). Run against `localhost:50051`, assert `passedParts === totalParts` and `failedParts === 0`.

---

## 5. Error Handling

| Condition | Failure Code | Message |
|-----------|-------------|---------|
| `entity_id` not in shape cache | `MISSING_ENTITY` | "Shape not found in cache: ..." |
| Null input shape | `INVALID_PARAMETER` | "Input shape is null" |
| `BRepBuilderAPI_Transform::IsDone()` false | `OPERATION_FAILED` | "Transform: BRepBuilderAPI_Transform failed" |
| Transformed shape is null | `OPERATION_FAILED` | "Transform: result shape is null" |
| Any scale factor <= 0 (scaleShape) | `INVALID_PARAMETER` | "Scale factor must be positive" |
| Invalid rotation axis (zero vector) | `INVALID_PARAMETER` | "Rotation axis cannot be zero" |
| Mirror with invalid plane (zero normal) | `INVALID_PARAMETER` | "Mirror plane normal cannot be zero" |

---

## 6. Definition of Done

- [ ] Design doc written and committed to `docs/superpowers/specs/2026-11-22-wc-ec-16-transforms-design.md`
- [ ] `OpTransformMatrix`, `OpTransformTranslate`, `OpTransformRotate`, `OpTransformMirror`, `OpTransformScale` + `ApplyTransform` helper (gp_Trsf + gp_GTrsf overloads) implemented in `kernel-worker.cpp`
- [ ] 5 `HandleTransformXxx` gRPC handlers added to `kernel-worker.cpp`
- [ ] 5 `case ExecuteRequest::kTransformXxx` entries added to `Execute()` switch
- [ ] OCCT includes added: `gp_Trsf.hxx`, `gp_GTrsf.hxx`, `gp_Vec.hxx`, `gp_Pnt.hxx`, `gp_Dir.hxx`, `gp_Ax1.hxx`, `gp_Ax2.hxx`, `BRepBuilderAPI_Transform.hxx`, `BRepBuilderAPI_GTransform.hxx` (verify already present)
- [ ] `native-kernel-adapter.ts` `opMap` entries added for all 5 transform ops
- [ ] `kernel_worker` recompiled in container (~8s Ninja build) and atomically swapped/restarted
- [ ] 5 new oracle fixtures added to `tests/fixtures/oracle/`
- [ ] `tests/oracle/native-oracle.integration.test.ts` updated (total: 12 parts)
- [ ] `npx tsc --noEmit` passes (0 new errors)
- [ ] `npx eslint` passes on changed files
- [ ] `npx vitest run tests/oracle tests/harness` passes (100%)
- [ ] Live integration test passes against `localhost:50051`
- [ ] `npm run buf:lint` passes
- [ ] `WEBCAD-EPIC-EC-v5.md` updated: WC-EC-16 tasks marked done
- [ ] All commits pushed to `dev`
