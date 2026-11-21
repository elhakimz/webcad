# WC-EC-20: Port shell (makeThickSolid) and draft

**Status:** Draft  
**Ticket:** WC-EC-20 | Port: shell (makeThickSolid) and draft | high | B | Phase 2  
**Date:** 2026-11-21  
**Branch:** dev

## 1. Overview

Port shell/makeThickSolid and draft operations to the native OCCT C++ kernel (`kernel-worker.cpp`). The proto `MakeThickSolidOp` (field 35: `entity_id`, `face_indices[]`, `thickness`, `remove_faces`) and `DraftSolidFacesOp` (field 36: `entity_id`, `face_indices[]`, `neutral_face_index`, `angle_rad`) messages already exist — no proto change required. Both operations operate on an existing cached shape and return a new `shape_id`.

- Shell: `BRepOffsetAPI_MakeOffset` — offsets faces by `thickness`, optionally removing selected faces
- Draft: `BRepOffsetAPI_DraftAngle` — drafts selected faces around a neutral face at `angle_rad`

No ADR required (no proto change).

## 2. Scope

**In scope:**
- C++ `OpCreateMakeThickSolid` / `OpCreateDraftSolidFaces` in `kernel-worker.cpp`
- `HandleMakeThickSolid` / `HandleDraftSolidFaces` handlers + 2 `switch` cases
- `BRepOffsetAPI_MakeOffset.hxx` include (DraftAngle header already present)
- `native-kernel-adapter.ts` opMap entries + parameter normalization
- Oracle fixtures: `make_thick_solid.json`, `draft_solid_faces.json`
- Integration test cases in `native-oracle.integration.test.ts` with deterministic metric assertions
- End-to-end gRPC test scripts producing STEP files in `doc/results/`:
  - `doc/results/cube_thick_solid.stp`
  - `doc/results/cube_draft_solid.stp`

**Out of scope:**
- Geometric face matching by visual coordinates (initial implementation uses `face_indices[]` only)
- Variable thickness per face (single `thickness` applied to all selected faces)
- Multiple neutral faces (single `neutral_face_index` only)

## 3. Design

### 3.1 Kernel — op functions

```cpp
// Shell / makeThickSolid
OpResult OpCreateMakeThickSolid(
    const TopoDS_Shape& shape,
    const std::vector<int32_t>& faceIndices,
    double thickness,
    bool removeFaces,
    double deflection,
    const std::string& entityId
);

// Draft
OpResult OpCreateDraftSolidFaces(
    const TopoDS_Shape& shape,
    const std::vector<int32_t>& faceIndices,
    int32_t neutralFaceIndex,
    double angleRad,
    double deflection,
    const std::string& entityId
);
```

**Behavior (shared):**
1. Select target face(s) by `face_indices[]` via `TopExp::MapShapes(shape, TopAbs_FACE, faceMap)` — deduplicated, 0-indexed, matching `metrics.face_count` (consistent with WC-EC-19 fillet/chamfer edge deduplication fix).
2. Validate each face index in range; `INVALID_ARGUMENT` if out of range.
3. **Shell:** Construct `BRepOffsetAPI_MakeOffset offset(shape)`, call `offset.Add(face, thickness)` per selected face, set `offset.RemoveFaces(removeFaces)` if true, then `offset.Build()`.
4. **Draft:** Construct `BRepOffsetAPI_DraftAngle draft(shape)`, call `draft.Add(face, angle)` per selected face, set `draft.SetNeutralFace(neutralFace)` if `neutral_face_index >= 0`, then `draft.Build()`.
5. Verify `builder.IsDone()` and `!builder.Shape().IsNull()`.
6. `OpCreateAndCache(newShape, deflection, entityId)` — updates `g_shapeCache[entityId]` in place, returns `shape_id: entityId`.
7. On any `Standard_Failure` or `std::exception`: return `OpResult` with `KERNEL_ERROR` and the exception message.

### 3.2 Handler — shared pattern

```cpp
Status HandleMakeThickSolid(const ExecuteRequest* request, ExecuteResponse* response);
Status HandleDraftSolidFaces(const ExecuteRequest* request, ExecuteResponse* response);
```

**Behavior:**
1. Read the op from `request`: `thickness` / `angle_rad`, `deflection`, `entity_id`, `face_indices[]`, `remove_faces` / `neutral_face_index`.
2. Fetch `g_shapeCache[entityId]`; `NOT_FOUND` if missing.
3. Call the corresponding `OpCreate*` function.
4. On success:
   - `success->set_shape_id(r.shapeId)`
   - `success->mutable_make_thick_solid()->set_shape_id(r.shapeId)` (or draft variant)
   - Compute metrics if shape in cache (`ComputeShapeMetrics`)
   - If `request->include_brep()`: `PopulateMeshData(shape, deflection, response->mutable_mesh())`
5. On failure: `SetFailure` with appropriate `ExecutionFailureCode`.

Add two cases to the `switch (request->op_case())` block: `kMakeThickSolid` and `kDraftSolidFaces`.

### 3.3 Adapter — `native-kernel-adapter.ts`

**opMap entries:**
```typescript
make_thick_solid: 'make_thick_solid',
draft_solid_faces: 'draft_solid_faces',
```

**Parameter normalization in `buildExecuteRequest`:**
- `entity_id`: passthrough string
- `face_indices`: passthrough `number[]`
- `thickness`: passthrough number
- `remove_faces`: passthrough boolean
- `neutral_face_index`: passthrough number
- `angle_rad`: passthrough number
- `deflection`: passthrough number (default 0.1 in kernel if <= 0)

### 3.4 Data Flow

```
Client make_thick_solid request
  → native-kernel-adapter.buildExecuteRequest()
    → MakeThickSolidOp proto (face_indices[], thickness, remove_faces, entity_id, deflection)
    → gRPC Execute RPC
    → kernel-worker.cpp switch → HandleMakeThickSolid
      → g_shapeCache[entity_id]
      → OpCreateMakeThickSolid: BRepOffsetAPI_MakeOffset + Add(face, thickness) per face
      → OpCreateAndCache → shape_id: entity_id (updated in place)
      → response.success.make_thick_solid.shape_id + metrics (+ optional mesh)
    → gateway → client
```

Same flow for draft_solid_faces (DraftSolidFacesOp proto: face_indices[], neutral_face_index, angle_rad).

## 4. Error Handling

| Condition | Code | Message |
|---|---|---|
| `entity_id` not in cache | `NOT_FOUND` | "shape not found for entity: {id}" |
| `face_index` out of range | `INVALID_ARGUMENT` | "face index {n} not found in shape" |
| `neutral_face_index` out of range | `INVALID_ARGUMENT` | "neutral face index {n} not found in shape" |
| OCCT `Standard_Failure` | `KERNEL_ERROR` | "MakeThickSolid/DraftSolidFaces failed: {message}" |
| `Build()` not done / null shape | `KERNEL_ERROR` | "MakeThickSolid/DraftSolidFaces produced null shape" |

## 5. Testing

### 5.1 Oracle fixtures (`tests/fixtures/oracle/`)

| Fixture | Operation | Target | Expected metrics |
|---|---|---|---|
| `make_thick_solid.json` | shell | face_indices on cube | volume, surfaceArea, faceCount, edgeCount, vertexCount |
| `draft_solid_faces.json` | draft | face_indices on cube | volume, surfaceArea, faceCount, edgeCount, vertexCount |

### 5.2 Integration test

Add cases to `native-oracle.integration.test.ts` for both variants — each asserting `valid: true` and expected metric values.

### 5.3 End-to-end STEP verification

gRPC test scripts creating a 10×10×10 cube, applying each op, exporting STEP to `doc/results/`:
- `cube_thick_solid.stp` — shell with thickness, valid ISO-10303-21
- `cube_draft_solid.stp` — draft with angle_rad, valid ISO-10303-21

Deterministic metric assertions printed to stdout.

## 6. Files Changed

- `src/core/gateway/kernel-worker.cpp` — 2 `OpCreate*` functions, 2 `Handle*` handlers, 2 switch cases, `#include <opencascade/BRepOffsetAPI_MakeOffset.hxx>`
- `src/core/harness/native-kernel-adapter.ts` — opMap entries + param normalization
- `tests/fixtures/oracle/make_thick_solid.json` — new fixture
- `tests/fixtures/oracle/draft_solid_faces.json` — new fixture
- `tests/oracle/native-oracle.integration.test.ts` — 2 test cases
- `doc/results/cube_thick_solid.stp` — shell STEP output
- `doc/results/cube_draft_solid.stp` — draft STEP output
- `docs/epics/WEBCAD-EPIC-EC-v5.md` — mark WC-EC-20 done

## 7. Self-Review

- [x] No proto change needed (fields 35-36 already exist)
- [x] No ADR required (no proto change)
- [x] Follows existing WC-EC-19 handler pattern
- [x] Memory safety: OCCT `Handle_*` ref-counted, `BRepOffsetAPI_*` stack-allocated
- [x] `Standard_Failure` wrapped in try/catch per leak-prevention principles
- [x] `builder.Build()` verified; `IsDone()` and non-null `Shape()` checked
- [x] Face selection via `TopExp::MapShapes` for deduplication (consistent with WC-EC-19 fix)
- [x] Minimal diff — no geometric matching, no variable thickness per face

---

**Spec written to `docs/superpowers/specs/2026-11-21-wc-ec-20-shell-draft-design.md`.** Please review it and let me know if you want any changes before we start writing out the implementation plan.
