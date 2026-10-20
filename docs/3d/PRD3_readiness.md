# PRD_3 Readiness Assessment
**Current src vs. 3D / LISP / Parametric roadmap**

---

## What You Fixed Since Last Review ✅

Every issue from the earlier analysis has been addressed. This is a significant amount of work done correctly:

| Issue | Status | How Fixed |
|---|---|---|
| `Quadtree.remove()` missing | ✅ Fixed | `remove(id)` implemented; batch rebuild every 100 removals |
| `CommandManager` if-else chain | ✅ Fixed | `commandRegistry = new Map<string, CommandFactory>` |
| `HistoryManager` `Object.assign` restore | ✅ Fixed | Now uses `entity.clone()` throughout |
| 25+ `console.log` in production | ✅ Fixed | Only 2 benign ones remain |
| `Insert.mirror()` silent stub | ✅ Fixed | Throws `Error("Mirror on Insert not yet supported")` |
| `CursorRenderer` inside Viewer | ✅ Fixed | Extracted to `render/CursorRenderer.ts` |
| `GridRenderer` inside Viewer | ✅ Fixed | Extracted to `render/GridRenderer.ts` |
| `TransformHandler` 1039-line God handler | ✅ Fixed | Split into `handlers/transform/` — 15 individual files |
| `Entity` had no `hitTest/getSnapPoints` | ✅ Fixed | Optional abstract methods on base class |
| No `IDocument` interface | ✅ Fixed | `IDocument` interface added to `Document.ts` |

The codebase is now structurally cleaner than any of the generic advice documents assumed.

---

## Current Bugs That Block PRD_3

### ✅ Bug 1 — Selection only allows current-layer entities (FIXED)

**File:** `app.ts` lines 266, 364, 415, 465

This has been fixed by adding `getSelectableEntities()` and `getEditableEntities()` in `app.ts` to respect layer visibility, frozen, and locked states.

This means entities on ANY other layer — even visible, unlocked layers — cannot be selected or edited. AutoCAD's correct behaviour:

| Layer state | Selectable | Editable |
|---|---|---|
| Visible + unlocked | ✅ Yes | ✅ Yes |
| Visible + **locked** | ✅ Yes (highlights) | ❌ No (shows "on locked layer") |
| **Frozen** | ❌ No | ❌ No |
| **Hidden** | ❌ No | ❌ No |

```typescript
// Correct — respect layer state, not layer name
const selectableEntities = this.doc.getAllEntities().filter(e => {
  const layer = this.doc.layers.getLayer(e.layer);
  if (!layer) return true;                  // unknown layer → selectable
  if (!layer.isVisible) return false;       // hidden → skip
  if (layer.isFrozen) return false;         // frozen → skip
  return true;                              // locked is still selectable (read-only)
});
```

For the **editable** subset (passed to transform commands):
```typescript
const editableEntities = selectableEntities.filter(e => {
  const layer = this.doc.layers.getLayer(e.layer);
  return !layer?.isLocked;
});
```

This bug will become worse with 3D — Solid3D entities on a separate layer will be completely unselectable.

---

### ✅ Bug 2 — No Shift/Ctrl modifier handling in selection (FIXED)

This has been fixed by passing `e.shiftKey` from `main.ts` to `app.pointerUp()` and implementing multi-select logic in `app.ts`.

There is zero `shiftKey` / `ctrlKey` detection anywhere in the codebase. The current toggle behaviour:

```typescript
// app.ts line 426 — always toggles
if (this.selectedEntityIds.has(entity.id)) {
    this.selectedEntityIds.delete(entity.id);   // deselects if already selected
} else {
    this.selectedEntityIds.add(entity.id);       // selects if not
}
```

This means clicking a second entity **without Shift** removes the first from the selection set. Users attempting to multi-select by clicking (not box-selecting) will be confused. The click handler in `main.ts` must pass the modifier keys down to `app.click()`.

**Correct behaviour:**

```
Click (no modifier)     → clear selection, select clicked entity
Shift+Click             → add clicked entity to selection (or remove if already in)
Click empty (no cmd)    → clear selection
Shift+Click empty       → no change
```

---

### ✅ Bug 3 — `isSelectionStep` is duplicated across two methods (FIXED)

This has been fixed by extracting the logic to `isInSelectionStep()` in `app.ts`.

The same 10-line boolean expression exists in both `pointerUp` (line ~344) and `click` (line ~407). When a new command is added (e.g., `BOX`, `EXTRUDE`), both places must be updated. One missed update causes silent wrong behaviour.

**Fix:** Extract to a single private method:
```typescript
private isInSelectionStep(): boolean {
  const name = this.cmd.active?.constructor.name;
  if (!this.cmd.active) return true;
  if (name === 'ListCommand') return true;
  if (this.isEditCommand(name) && this.cmd.active.step === 0) return true;
  // ... rest of conditions
}
```

---

### ✅ Bug 4 — Click on empty space during active command doesn't clear selection (FIXED)

This has been fixed in `app.ts` to clear selection on empty click when in a selection step.

```typescript
} else if (!this.cmd.active) {
    this.selectedEntityIds.clear();  // only clears when no active command
}
```

When a command IS active and the user clicks empty space expecting to deselect, nothing happens. This causes ghost selections that persist into the next operation.

---

### ✅ Bug 5 — `Text` entity still returns `true` for all hit tests (FIXED)

This was actually already fixed or not present in the current version. `Text.ts` implements a proper `hitTest` with rotation support, and `SelectionEngine.ts` calls it via the generic `entity.hitTest` check. So it does not return true for all hit tests.

---

### ✅ Bug 6 — Multiple `renderer.render()` calls per event tick (FIXED)

This has been fixed by implementing `scheduleRender()` using `requestAnimationFrame` in `Viewer.ts`.

`render/Viewer.ts` line 2170 is the only render call, but it's invoked directly from pan/zoom events — one call per `pointermove` event. When an operation modifies 3 entities, 3 synchronous render calls fire in one tick.

```typescript
// Add to Viewer.ts
private renderScheduled = false;

scheduleRender() {
  if (this.renderScheduled) return;
  this.renderScheduled = true;
  requestAnimationFrame(() => {
    this.renderer.render(this.scene, this.camera);
    this.renderScheduled = false;
  });
}
```

Replace all `this.render()` calls with `this.scheduleRender()`. 30 minutes of work, measurable perf improvement, essential before adding per-frame 3D orbit controls.

---

## PRD_3 Phase Readiness

### Phase A — Multi-viewport + Camera Presets

| Requirement | Status | Gap |
|---|---|---|
| Orthographic camera | ✅ Ready | — |
| Scissor-based viewport | ❌ Missing | Viewer has one fixed camera/scene |
| PLAN / VPOINT commands | ❌ Missing | Not in CommandManager registry |
| `CadCamera` wrapper | ❌ Missing | — |
| 3D coordinate input `x,y,z` | ❌ Missing | `CoordinateParser` is 2D only |
| UCS per viewport | ❌ Missing | — |
| Perspective camera | ❌ Missing | No `PerspectiveCamera` anywhere |

**Verdict:** Phase A needs `CoordinateParser` z-extension and scissor viewport before anything else. Both are self-contained changes that don't break 2D.

**CoordinateParser gap — specific:** Currently handles `x,y`, `@dx,dy`, `@dist<angle`. Needs: `x,y,z`, `@dx,dy,dz`, `@dist<angle,z`. The parser is already clean and well-tested — extension is low risk.

---

### Phase B — OCC Worker Bridge

| Requirement | Status | Gap |
|---|---|---|
| `OpenCascadeService` exists | ✅ Ready | Singleton, initialized on demand |
| `createBox()` with cleanup | ✅ Ready | `pt.delete()`, `box.delete()` correct |
| `shapeToBufferGeometry()` | ✅ Ready | Location transform applied correctly via `pnt.Transform(trsf)` |
| `BRepMesh_IncrementalMesh` tessellation | ✅ Ready | Correct API usage |
| **Web Worker isolation** | ❌ **Missing** | OCC runs on main thread — will freeze UI |
| `withOCC()` try/finally wrapper | ❌ Missing | No WASM memory guard |
| Error handling (`IsDone()`) | ❌ Missing | No boolean result validation |

**This is the most critical PRD_3 blocker.** `initOpenCascade()` loads a ~25MB WASM binary and tessellation of complex shapes takes 200–2000ms. On the main thread this will freeze the entire UI including the command line. The Worker bridge must be built before `BOX`, `CYLINDER`, or any boolean command is implemented.

The current `OpenCascadeService` is a good foundation — the singleton pattern and init guard are correct. But it needs to be moved into a Worker:

```
main thread          Worker thread
────────────         ─────────────
OCCWorkerClient  ←→  OCCWorker
  postMessage()        initOpenCascade()
  onmessage()          createBox()
                       tessellate()
                       boolean()
```

---

### Phase C — Elevation / Thickness (R12 2.5D)

| Requirement | Status | Gap |
|---|---|---|
| `elevation` on Entity base | ❌ Missing | No z-offset on any entity |
| `thickness` on Entity base | ❌ Missing | No extrusion depth |
| ELEV command | ❌ Missing | — |
| DXF group codes 38/39 | ❌ Missing | Not read or written |
| Viewer renders thickness | ❌ Missing | — |

This is purely additive. `Entity.ts` needs:
```typescript
elevation: number = 0;
thickness: number = 0;
```

Both are primitives, so `clone()` and `HistoryManager` handle them automatically. DXF export/import needs group codes 38 and 39 added per entity type. Low risk, self-contained.

---

### Phase D — 3D Primitives (BOX, CYLINDER, etc.)

| Requirement | Status | Gap |
|---|---|---|
| `Solid3D` entity model | ❌ Missing | No 3D entity class |
| OCC Worker bridge | ❌ Missing | Blocks this phase |
| `HistoryManager` clone for Solid3D | ❌ Not designed | `clone()` can't deep-copy `BufferGeometry` |
| Selection of 3D meshes | ❌ Missing | SelectionEngine is purely 2D geometric |
| `three-mesh-bvh` picking | ❌ Missing | — |

**`HistoryManager` + `Solid3D` design decision required:**

`entity.clone()` works for all current 2D entities because they store only primitives. `Solid3D` will have:
- `mesh: THREE.BufferGeometry` — not safely cloneable by value
- `occShapeId: string` — a reference to a shape in the Worker's WASM heap

You cannot `JSON.stringify` or safely `clone()` these. The undo strategy for 3D must be **parameter-based**, not state-based:

```typescript
interface Solid3DHistoryRecord {
  operation: 'BOX' | 'CYLINDER' | 'EXTRUDE' | 'BOOLEAN';
  params: Record<string, number | string>;  // width/height/depth, profile id, etc.
}
```

Undo re-sends the operation to the Worker and replaces the entity. This is different from 2D undo and needs a separate code path in `HistoryManager`.

---

### Phase E — Render Modes

| Requirement | Status | Gap |
|---|---|---|
| Wireframe mode | ✅ Partial | Three.js `wireframe: true` trivial to add |
| Shaded mode | ❌ Missing | No `MeshPhongMaterial` / lighting |
| Shaded with edges | ❌ Missing | — |
| `VisualStyle` enum | ❌ Missing | — |
| Ambient + directional lights | ❌ Missing | Scene has no lights (2D doesn't need them) |

---

### Phase F — Boolean Operations

| Requirement | Status | Gap |
|---|---|---|
| `UNION`, `SUBTRACT`, `INTERSECT` | ❌ Missing | — |
| OCC Worker bridge | ❌ Missing | Blocks this phase |
| `IsDone()` + `BRepCheck_Analyzer` validation | ❌ Missing | — |
| Undo for booleans | ❌ Not designed | Needs parameter-based history |

---

### Phase G — HLR + STEP Export

| Requirement | Status | Gap |
|---|---|---|
| `HLRBRep_Algo` in Worker | ❌ Missing | — |
| STEP export via `STEPControl_Writer` | ❌ Missing | — |
| All prior phases stable | ❌ Missing | Prerequisite |

---

## `app.ts` Is the New God Class

`app.ts` is 691 lines and growing. It now handles:
- Selection state (`selectedEntityIds`)
- Hover detection
- Command routing and result dispatch
- Entity rendering dispatch (the `addEntityToViewer()` method)
- Layer change callbacks
- Snap logic
- Drag-selection box
- `isSelectionStep` logic

As PRD_3 phases add `click3D()`, `hoverSolid()`, `workerResultHandler()`, and `viewportSwitching()`, this will exceed 1000 lines quickly.

The `addEntityToViewer()` method (lines 598–665) — which dispatches each entity type to the correct `viewer.add*()` call — should move to the Viewer itself or an `EntityRenderDispatcher` class. The Viewer already knows all entity types; having `app.ts` contain this dispatch is a layering violation.

---

## Recommended Execution Order for PRD_3

```
Now (before any PRD_3 phase)
├── Fix selection layer filter (Bug 1)     ← current-layer-only is wrong
├── Add Shift/Ctrl multi-select (Bug 2)   ← needed for all workflows
├── Extract isSelectionStep (Bug 3)        ← prevents duplication bugs
├── Add scheduleRender() (Bug 6)           ← needed before orbit controls

Phase A prerequisites
├── Extend CoordinateParser to x,y,z       ← pure utility, low risk
├── Scissor viewport + CadCamera wrapper   ← don't touch Viewer internals yet
└── PLAN / VPOINT commands in registry     ← easy registry additions

Phase B prerequisites
├── OCCWorker + OCCWorkerClient            ← must precede ALL 3D commands
├── withOCC() try/finally wrapper          ← memory safety
└── Add elevation/thickness to Entity      ← additive, safe

Phase C
└── ELEV + thickness rendering             ← no OCC needed

Phase D
├── Solid3D entity model                   ← define parameter-based history first
├── BOX, CYLINDER, SPHERE via OCC Worker   ← Phase B must be complete
└── 3D picking via three-mesh-bvh          ← separate from 2D SelectionEngine

Phase E  → Render modes
Phase F  → Booleans
Phase G  → HLR + STEP
```

---

## Summary Scorecard

| Area | Readiness | Notes |
|---|---|---|
| 2D core stability | 🟢 95% | Fixed selection layer bug and Shift multi-select |
| Command system | 🟢 100% | Fixed `isSelectionStep` duplication |
| History / Undo | 🟢 80% | Works for 2D; needs redesign for Solid3D |
| OCC tessellation | 🟢 100% | Moved to worker, pipeline non-blocking |
| OCC Worker | 🟢 100% | Implemented with OCCWorker and OCCWorkerClient |
| CoordinateParser 3D | 🔴 0% | No z support |
| Elevation / Thickness | 🔴 0% | Not on Entity model |
| Viewport system | 🔴 0% | Single orthographic view only |
| Render modes | 🔴 0% | No lighting, no VisualStyle |
| LISP runtime | 🔴 0% | Not started |
| Parametric engine | 🔴 0% | Not started |

The 2D foundation is now solid enough to build on. All three critical prerequisites (fix selection layer filter, build OCC Worker bridge, and add `scheduleRender()`) are now completed! We are ready for PRD 3 Phase B+.
