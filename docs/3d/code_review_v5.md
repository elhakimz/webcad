# Code Review — src v5
# Focus: OCCWorker memory, new 3D operations, Gizmo, Selection3D, undo correctness

---

## Progress Since Last Review ✅

All previously reported issues are resolved:

| Issue | Status |
|---|---|
| `brepTransform.delete()` missing in `applyRotation` | ✅ Fixed — line 99 |
| Inline `gp_Ax1_2` / `gp_Dir_4` never deleted | ✅ Fixed — stored in variables, deleted lines 54–69 |
| `BRepAlgoAPI_Fuse_4` wrong constructor in extrude | ✅ Fixed |
| `HistoryManager` Solid3D undo desync | ✅ Partially addressed — `onSolidTransform` callback added |
| 25+ `console.log` in transform handlers | ✅ Cleaned — only 3 remain in handlers |
| `isSelectionStep` duplicated | ✅ Extracted to `isInSelectionStep()` |

---

---

## 🟢 Resolved in v6 (Current)

| Issue | Status | Fix Details |
|---|---|---|
| Bug 1 — `tri.Node(i)` leaks | ✅ Fixed | Added `p.delete()` in both loops in `OCCWorker.ts`. |
| Bug 2 — `TopLoc_Location_1` leaks | ✅ Fixed | Added `loc.delete()` and `face.delete()` in `OCCWorker.ts`. |
| Bug 3 — `faceCutter` leak | ✅ Fixed | Added `faceCutter.delete()` in prism loop. |
| Bug 4 — Solid3D undo desync | ✅ Fixed | Implemented `onSolidBRepRestore` callback in `HistoryManager` and BRep re-import in `app.ts`. |
| Issue 5 — production logs in `app.ts` | ✅ Fixed | Removed all 9 `console.log` calls. |
| Issue 6 — `LoftHandler` log | ✅ Fixed | Removed `console.log`. |
| Issue 8 — Double-render in Handlers | ✅ Fixed | Removed redundant `syncFromDocument()` calls. |
| Issue 9 — Shared raycaster singleton | ✅ Fixed | Moved to static class member in `Selection3DEngine`. |
| Issue 10 — Intermediate shape leaks | ✅ Fixed | Added intermediate shape deletion in `makeThickSolid`. |
| Issue 11 — Shadowed `loc` variable | ✅ Fixed | Renamed to `innerLoc`. |

---

## 🔴 Critical Bugs (Remaining)

None.

---

## 🟡 Significant Issues

---

### Issue 5 — `app.ts` has 9 active `console.log` calls in production interaction paths

**File:** `app.ts` lines 746, 943, 964, 997, 1010, 1011, 1012, 1019, 1022

All are in the new face/edge selection and gizmo attachment paths — clearly left from development:

```typescript
console.log(`[app.pointerDown] Active grip set:`, this.activeGrip);
console.log("Gizmo attachment - entity id:", id, "found obj:", obj);
console.log(`[app.click] getSubEntityAtSmart result:`, subEntity);
console.log(`[app.click] Selected faces:`, this.selectedFaces);
console.log(`[app.click] Found shared edge: ${sharedEdgeResult.edgeIndex}`);
// ... 4 more
```

These fire on every face/edge click and gizmo interaction. Remove all 9.

---

### Issue 6 — `LoftHandler` has an active `console.log`

**File:** `core/engine/handlers/transform/LoftHandler.ts` line 29

```typescript
console.log(`[LoftHandler] Released shapes from worker:`, deleteIds);
```

Remove it.

---

### Issue 7 — `makeThickSolid` shell approach produces non-uniform wall thickness for non-cubic solids

**File:** `core/io/OCCWorker.ts` lines 424–438

The shell is created by scaling the solid by `(maxSize - 2*thickness) / maxSize` and then boolean-cutting. This produces exactly correct wall thickness only on the largest axis. For a cylinder with radius 10 and height 50:

- `maxSize = 50` (height)
- `scaleFactor = (50 - 2*5) / 50 = 0.8`
- Radial thickness: `10 * (1 - 0.8) = 2mm` ← wrong (should be 5mm)
- Axial thickness: `50 * (1 - 0.8) / 2 = 5mm` ← correct

The fallback comment `// Fallback to 5% shell if thickness is too large` at line 427 also silently changes the wall thickness without informing the user.

For a proper fix, `BRepOffsetAPI_MakeThickSolid` is the OCC class for uniform offset shells. If it's unavailable in v1.1.4, at minimum warn the user that the thickness is approximate for non-box shapes.

---

### Issue 8 — `SFilletHandler` / `ShellHandler` replace the entity but keep the same ID — `syncFromDocument` double-renders

**File:** `core/engine/handlers/transform/SFilletHandler.ts` lines 44–55

```typescript
doc.recordTransform(entity, newSolid);
doc.removeEntity(entityId);
viewer.removeObject(entityId);
addEntity(newSolid, true, false);
context.syncFromDocument();    // ← re-adds all entities including newSolid
```

`addEntity(newSolid, ...)` already adds `newSolid` to the viewer. Then `context.syncFromDocument()` re-syncs the entire document to the viewer, which re-adds `newSolid` again. This causes the mesh to be rendered twice until the next viewer clear/regen.

The `context.syncFromDocument()` call is redundant here. Either use it exclusively (remove `addEntity`) or remove the sync.

---

### Issue 9 — `Selection3DEngine` module-level singleton `raycaster` creates shared state

**File:** `core/engine/Selection3DEngine.ts` line 7

```typescript
const raycaster = new THREE.Raycaster();
```

A module-level singleton is fine for a single-threaded environment (no true concurrency in browser JS), but it means that if `getSolid3DAt` and `getSubEntityAt` are called in the same tick (which could happen via `Promise.resolve`), they share the same raycaster instance and whichever sets it last wins.

Better to instantiate per-method call or per-class instantiation:

```typescript
export class Selection3DEngine {
  private static raycaster = new THREE.Raycaster();
  // or: new THREE.Raycaster() inside each method
}
```

---

### Issue 10 — `makeThickSolid` intermediate `newShape` values not freed in face-opening loop

When `newShape = faceCutter.Shape()` replaces the previous `newShape`, the shape from the previous iteration becomes unreferenced without deletion. For N face openings, N-1 intermediate shapes leak.

```typescript
// After the first iteration:
let newShape = cutter.Shape();   // shape A
// Second face opening:
newShape = faceCutter.Shape();   // shape B — shape A is now leaked
// Third face opening:
newShape = faceCutter.Shape();   // shape C — shape B is now leaked
```

Fix: save the previous value and delete it:
```typescript
if (faceCutter.IsDone()) {
  const prevShape = newShape;
  newShape = faceCutter.Shape();
  // Only delete intermediate shapes, not the initial cutter.Shape() 
  // which is managed by cutter.delete() in the cleanup block
  if (prevShape !== cutter.Shape()) prevShape.delete();
}
```

---

## 🟠 Minor Issues

---

### Issue 11 — `makeThickSolid` has a shadowed `loc` variable declaration

Lines 388 and 473 both declare `const loc = new oc.TopLoc_Location_1()` in nested scopes within the same function. TypeScript doesn't flag this since they're in different block scopes, but it causes confusion when reading and is easy to fix by renaming the inner one to `innerLoc`.

---

### Issue 12 — `GizmoController.setupTranslateDragPlane` ignores the handle's axis direction for the plane normal

**File:** `core/engine/GizmoController.ts` lines 63–70

```typescript
private setupTranslateDragPlane(...) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  this.dragPlaneNormal.copy(dir).negate();   // always camera-facing
}
```

Using a camera-facing plane means translating along the X-axis will also drift in Y if the user moves the mouse diagonally. The correct approach for axis-constrained translation is to use a plane whose normal is **perpendicular to the drag axis but as close to camera-facing as possible**:

```typescript
// For X-axis drag: plane normal = cross(X_axis, camera_up) 
// (or the complement plane if X is near-parallel to camera)
const axisDir = handle.dir!.clone().applyQuaternion(target.quaternion);
const camDir  = new THREE.Vector3().copy(camera.position).sub(target.position).normalize();
let planeNormal = new THREE.Vector3().crossVectors(axisDir, camDir);
if (planeNormal.length() < 0.001) {
  // axis nearly parallel to camera ray — use fallback plane
  planeNormal.set(0, 0, 1);
}
planeNormal.normalize();
this.dragPlaneNormal.copy(planeNormal);
```

The current implementation still works because the axis projection in `applyTranslate` (`delta.dot(axisDir)`) discards the off-axis component — the camera-facing plane approach is a pragmatic simplification that works at the cost of requiring larger mouse movement for low-angle axis drags. Document this trade-off or fix it.

---

### Issue 13 — `FacetresCommand` mutates `doc.facetres` directly without history record

**File:** `core/commands/FacetresCommand.ts`

```typescript
doc.facetres = facetres;
```

Direct mutation without `doc.recordTransform` or similar. The `facetres` change cannot be undone. This is acceptable for a system variable (AutoCAD FACETRES is also not undoable), but the `regen` action that follows should use the updated value — verify that `doc.facetres` is read by `shapeToBufferGeometryData` in the Worker (it appears to be passed as `deflection` in existing calls).

---

## Summary

| Category | Count | Severity |
|---|---|---|
| WASM memory leaks (`p`, `loc`, `faceCutter`, intermediate shapes) | 4 bugs | 🔴 Critical |
| OCC Worker / undo BRep desync after fillet/shell/chamfer | 1 bug | 🔴 Critical |
| Production `console.log` calls (9 in app.ts + 1 in LoftHandler) | 10 instances | 🟡 Significant |
| Double-render in SFilletHandler / ShellHandler | 1 bug | 🟡 Significant |
| Non-uniform shell thickness for non-box solids | 1 issue | 🟡 Significant |
| Shared raycaster singleton | 1 issue | 🟡 Significant |
| Intermediate shape leaks in face-opening loop | 1 bug | 🟡 Significant |
| Shadowed `loc` variable | 1 | 🟠 Minor |
| Gizmo drag plane normal trade-off | 1 | 🟠 Minor |
| `facetres` not tracked in history | 1 | 🟠 Minor |

**Immediate fix priority:**
```
1. p.delete() after tri.Node(i) — both loops    (Bug 1)
2. loc.delete() + face.delete() in face loops   (Bug 2)
3. faceCutter.delete() in prism loop            (Bug 3)
4. Remove all 10 console.log calls              (Issue 5, 6)
5. Remove redundant syncFromDocument in Handlers (Issue 8)
6. BRep re-import on undo for fillet/shell results (Bug 4)
```
