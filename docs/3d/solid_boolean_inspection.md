# Inspection Report — Solid Geometry & Boolean Ops
# Focus: OCCWorker.ts, BooleanCommand, BooleanHandler, Solid3D, OpenCascadeService

---

## What's Working Well ✅

- Worker architecture is solid — `OCCWorkerClient` promise/id pattern is clean
- `shapeToBufferGeometryData()` correctly applies face location transforms (`pnt.Transform(trsf)`) — fixes the broken geometry bug from earlier analysis
- `BRepCheck_Analyzer` validation attempt on boolean results is the right idea
- `ShapeCacheDB` + `PersistenceService` BRep persistence via SQLite/OPFS is well-designed
- `MoveHandler` correctly calls both `move3D()` on the entity AND `transformShape()` on the Worker — the mesh and OCC cache stay in sync for translate operations
- `BooleanHandler` correctly releases input shapes from Worker after consuming them
- `Solid3D.clone()` deep-copies positions/indices — HistoryManager snapshot is safe for 2D transforms

---

## Critical Bugs

---

### 🔴 Bug 1 — `BRepAlgoAPI_Fuse_4` called with 2 args in extrude thickness path

**File:** `core/io/OCCWorker.ts` line 354

```typescript
// WRONG — _4 is the 3-argument constructor (S1, S2, ProgressRange)
const fuse = new oc.BRepAlgoAPI_Fuse_4(resultShape, shapes[i]);
```

`_4` maps to `BRepAlgoAPI_Fuse(S1, S2, ProgressRange)`. Calling it with 2 args passes `undefined` as the progress range — which will either crash the Worker or produce a corrupted shape silently.

The boolean operation in `createBoolean` correctly uses `_3`:
```typescript
boolBuilder = new oc.BRepAlgoAPI_Fuse_3(shapeA, shapeB); // _3 = classic (S1, S2)
```

**Fix:**
```typescript
// Line 354 — use _3 consistently
const fuse = new oc.BRepAlgoAPI_Fuse_3(resultShape, shapes[i]);
```

---

### 🔴 Bug 2 — `brepTransform` never deleted in `applyRotation` — WASM heap leak

**File:** `core/io/OCCWorker.ts` lines 59–72

Every call to `applyRotation` creates a `BRepBuilderAPI_Transform_2` object that is never freed:

```typescript
const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
const newShape = brepTransform.Shape();

// Cleanup block — brepTransform is MISSING
vecToOrigin.delete();
toOrigin.delete();
// ... other deletes
transform.delete();
// brepTransform.delete() ← NOT CALLED
```

Called on every boolean operation. In a session with dozens of booleans, this accumulates in the WASM heap and eventually causes allocation failures.

**Fix:**
```typescript
const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
const newShape = brepTransform.Shape();

vecToOrigin.delete();
toOrigin.delete();
originPnt.delete();
rotX.delete();
rotY.delete();
rotZ.delete();
rotTrsf.delete();
vecToBack.delete();
toBack.delete();
transform.delete();
brepTransform.delete();   // ← ADD THIS
```

---

### 🔴 Bug 3 — Temporary `gp_Ax1_2` and `gp_Dir_4` objects never deleted in `applyRotation`

**File:** `core/io/OCCWorker.ts` lines 37–43

Six anonymous WASM objects created inline and never freed:

```typescript
rotX.SetRotation_1(new oc.gp_Ax1_2(originPnt, new oc.gp_Dir_4(1,0,0)), rot.x);
rotY.SetRotation_1(new oc.gp_Ax1_2(originPnt, new oc.gp_Dir_4(0,1,0)), rot.y);
rotZ.SetRotation_1(new oc.gp_Ax1_2(originPnt, new oc.gp_Dir_4(0,0,1)), rot.z);
```

Each `new oc.gp_Ax1_2()` and `new oc.gp_Dir_4()` allocates on the WASM heap. 6 objects × every boolean call = steady heap growth.

**Fix:**
```typescript
const dirX = new oc.gp_Dir_4(1, 0, 0);
const axX  = new oc.gp_Ax1_2(originPnt, dirX);
rotX.SetRotation_1(axX, rot.x);
axX.delete();
dirX.delete();

const dirY = new oc.gp_Dir_4(0, 1, 0);
const axY  = new oc.gp_Ax1_2(originPnt, dirY);
rotY.SetRotation_1(axY, rot.y);
axY.delete();
dirY.delete();

const dirZ = new oc.gp_Dir_4(0, 0, 1);
const axZ  = new oc.gp_Ax1_2(originPnt, dirZ);
rotZ.SetRotation_1(axZ, rot.z);
axZ.delete();
dirZ.delete();
```

---

### 🔴 Bug 4 — Intermediate fusion shapes in extrude thickness loop never deleted

**File:** `core/io/OCCWorker.ts` lines 350–364

```typescript
resultShape = shapes[0];
for (let i = 1; i < shapes.length; i++) {
  const fuse = new oc.BRepAlgoAPI_Fuse_4(resultShape, shapes[i]);
  fuse.Build();
  if (fuse.IsDone()) {
    resultShape = fuse.Shape();  // previous resultShape is now orphaned
  }
  fuse.delete();
}
```

When `resultShape` is reassigned on each iteration, the previous shape value is abandoned without deletion. For an extrude with N segments, N-2 intermediate shapes leak.

Also `shapes[1]` through `shapes[N-1]` are never deleted.

**Fix:**
```typescript
resultShape = shapes[0];
for (let i = 1; i < shapes.length; i++) {
  const prevResult = resultShape;
  const fuse = new oc.BRepAlgoAPI_Fuse_3(resultShape, shapes[i]); // _3 not _4
  fuse.Build();
  if (fuse.IsDone()) {
    resultShape = fuse.Shape();
    if (i > 1) prevResult.delete();  // free previous intermediate (not shapes[0])
  }
  shapes[i].delete();  // free this segment shape
  fuse.delete();
}
// shapes[0] is now either resultShape (if N=1) or was freed in the loop
```

---

### 🔴 Bug 5 — Undo of Solid3D transforms does NOT resync the Worker shape cache

**File:** `core/model/HistoryManager.ts`

When undo restores a `TRANSFORM` on a `Solid3D`, it calls `entity.clone()` which restores `positions[]` to the pre-move state. The visual mesh is correct again.

But the Worker's `shapeCache` still holds the post-move OCC shape. If the user then does a BOOLEAN on this solid, the Worker operates on the moved shape while the visual shows the unmoved one — geometry mismatch.

The HistoryManager has no reference to the OCC Worker. The fix requires undo to call `transformShape` with the reverse delta, or re-import the BRep snapshot.

**Cleanest fix — store reverse delta in history record:**

In `MoveHandler` when recording the transform:
```typescript
// Record both the forward and reverse delta
doc.recordTransform(entity, { dx: -action.dx!, dy: -action.dy!, dz: -(action.dz ?? 0) });
```

Then HistoryManager undo/redo calls:
```typescript
// After restoring clone — resync Worker
if (entity instanceof Solid3D && record.reverseDelta) {
  await OpenCascadeService.getInstance().transformShape(
    entity.id,
    record.reverseDelta.dx,
    record.reverseDelta.dy,
    record.reverseDelta.dz
  );
}
```

---

## Significant Issues

---

### 🟡 Issue 6 — `BooleanCommand.onPoint()` ignores all clicks — ID-typing only

```typescript
onPoint(x, y, id, units, doc): CommandResponse {
  return this.getPrompt();  // click is completely ignored
}
```

Same problem in `ExtrudeCommand` and `RevolveCommand`. Users must type the entity ID in the command line to select a solid — there is no click-to-select. This is the most user-facing gap in the 3D workflow.

The fix is in `app.ts` — when `BooleanCommand` (or any command with a "selection step") is active, a click on a Solid3D entity should feed the entity ID to `onInput()`:

```typescript
// In app.ts click handler — after Selection3DEngine.getSolid3DAt():
if (entity3D && this.cmd.active) {
  const resp = this.cmd.active.onInput(entity3D.id, newId, doc.units, worldPt, doc);
  if (resp) await this.handleResult(resp);
  return;
}
```

This pattern already works for 2D commands (TRIM, FILLET etc.). Solid3D needs the same routing.

---

### 🟡 Issue 7 — `Solid3D.rotation` is never set — `applyRotation` in boolean is dead code

`Solid3D` has a `rotation: { x, y, z }` field initialized to `{ 0, 0, 0 }`. No command or handler ever modifies it. `applyRotation` returns immediately via the early-exit guard:

```typescript
if (!rot || (rot.x === 0 && rot.y === 0 && rot.z === 0)) return shape;
```

So the rotation application in `createBoolean` never executes. Either:
- The gizmo should set `Solid3D.rotation` AND the Worker cache should track rotation separately (not baked into positions), OR
- The `rotation` field and `applyRotation` should be removed until GizmoController is implemented

If the gizmo bakes the rotation into `positions[]` AND calls `transformShape()` on the Worker (which bakes it into the cached shape too), then `applyRotation` in `createBoolean` would cause double-rotation. Needs a clear decision.

---

### 🟡 Issue 8 — Worker shape cache is lost on Worker restart — no re-hydration path

If the OCC Worker is terminated and restarted (e.g., browser tab resumes, memory pressure), `shapeCache` is empty. Attempting any boolean on an existing solid will throw:

```
"Shape not cached for solid A (id: xxx). Ensure solid was created in this session."
```

`PersistenceService` saves BRep data for boolean results (solids without `creationParams`). For primitives with `creationParams`, it could re-run the create command. Neither path is triggered on Worker restart.

**Fix outline:**
```typescript
// In OpenCascadeService, after Worker restart:
async rehydrateShapes(doc: Document): Promise<void> {
  for (const entity of doc.getAllEntities()) {
    if (!(entity instanceof Solid3D)) continue;

    if (entity.creationParams) {
      // Re-create from params
      await this.recreateFromParams(entity.id, entity.creationParams);
    } else {
      // Re-import from BRep cache
      const brepBytes = await ShapeCacheDB.loadBRep(entity.id, projectId);
      if (brepBytes) await this.importBRep(entity.id, brepBytes);
    }
  }
}
```

---

### 🟡 Issue 9 — `BRepCheck_Analyzer` silently skipped when unavailable

```typescript
if (oc.BRepCheck_Analyzer) {
  // validate
}
// else: invalid shapes silently pass through to tessellation
```

If `BRepCheck_Analyzer` is not in the v1.1.4 build, an invalid boolean result will pass through and either produce garbage geometry or crash `shapeToBufferGeometryData`. A safer approach:

```typescript
// Add post-boolean empty-shell check regardless of BRepCheck availability
const exp = new oc.TopExp_Explorer_2(resultShape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
const hasFaces = exp.More();
exp.delete();
if (!hasFaces) {
  boolBuilder.delete();
  throw new Error(`Boolean ${operation} produced a shape with no faces — shapes may not intersect`);
}
```

---

## Minor Issues

---

### 🟠 Issue 10 — 3 debug `console.log` calls in `BooleanCommand`

```typescript
console.log(`[BooleanCommand] Detected Solid A: ${val}`);
console.log(`[BooleanCommand] Detected Solid B: ${val}`);
console.log(`[BooleanCommand] Executing ${this.operation} on A: ${this.idA}, B: ${this.idB}`);
```

Fire on every boolean operation. Remove.

---

### 🟠 Issue 11 — `instanceof Solid3D` vs `(entity as any).type === "Solid3D"` inconsistency

`BooleanCommand` checks both:
```typescript
entity instanceof Solid3D || (entity as any).type === "Solid3D"
```

The double-check suggests distrust in `instanceof` — likely a module resolution issue at some point. If `Solid3D` is imported consistently from the same path everywhere, `instanceof` alone is sufficient. Consolidate to one check.

---

## Fix Priority

| # | File | Change | Risk |
|---|---|---|---|
| 1 | `OCCWorker.ts:354` | `Fuse_4` → `Fuse_3` | Low — 1 line |
| 2 | `OCCWorker.ts:59–72` | Add `brepTransform.delete()` | Low — 1 line |
| 3 | `OCCWorker.ts:37–43` | Store and delete `gp_Ax1_2`/`gp_Dir_4` temps | Low — 9 lines |
| 4 | `OCCWorker.ts:350–364` | Delete intermediate shapes in fuse loop | Medium — 6 lines |
| 5 | `HistoryManager.ts` + `MoveHandler.ts` | Worker resync on undo | Medium |
| 6 | `app.ts` | Route clicked Solid3D ID to active command | Medium |
| 7 | `Solid3D.ts` / `GizmoController.ts` | Decide rotation strategy — baked vs field | Design decision |
| 8 | `OpenCascadeService.ts` | `rehydrateShapes()` on Worker restart | Medium |
| 9 | `OCCWorker.ts:600` | Face-count fallback check for boolean validation | Low |
| 10 | `BooleanCommand.ts` | Remove 3 `console.log` calls | Low |
