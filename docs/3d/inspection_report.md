# WebCAD Source Inspection Report
# Based on src.zip — May 2026

---

## Progress Since Last Review ✅

Every issue from the previous inspection is resolved:

| Issue | Status |
|---|---|
| `scheduleRender()` dirty flag | ✅ Implemented — `requestAnimationFrame` + `renderRequested` flag in `Viewer.ts:2592` |
| Selection layer filter (current-layer-only bug) | ✅ Fixed — `getSelectableEntities()` checks `isVisible` + `isFrozen` across all layers |
| Shift key multi-select | ✅ Fixed — `isShift` param propagated from `main.ts:536` through `pointerUp` to click handler |
| `lineWeight` on `Layer` model | ✅ Implemented — `lineWeight: number` field, `createLayer()` param, DXF group code 370 |
| DXF elevation/thickness (codes 38/39) | ✅ Implemented in `dxfExport.ts` |
| OCC Worker (main-thread blocking) | ✅ Fixed — `OCCWorker.ts` + `OCCWorkerClient.ts` with proper message routing |
| `Solid3D` entity model | ✅ Implemented — positions + indices arrays, clone() works (primitives only) |
| `console.log` flood | ✅ Cleaned — only 1 benign init message remains in `OpenCascadeService.ts:26` |
| PDF Font size (two hacks fighting) | ✅ Fixed — Removed conflicting multipliers in `PlotSVGRenderer` and `TextToPath` |
| Dimension text y-offset | ✅ Fixed — Made scale-aware (`h * 0.5`) in `PlotSVGRenderer` |

---

## Active Bugs

---

### 🟡 Bug 1 — OCC boolean operations not yet implemented in Worker

**File:** `core/io/OCCWorker.ts`

The Worker handles solid primitives correctly:
- ✅ `createBox`
- ✅ `createCylinder`
- ✅ `createSphere`
- ✅ `createCone`
- ✅ `createTorus`

Missing (PRD_3 Phase F):
- ❌ `union` — `BRepAlgoAPI_Fuse`
- ❌ `subtract` — `BRepAlgoAPI_Cut`
- ❌ `intersect` — `BRepAlgoAPI_Common`
- ❌ `extrude` — `BRepPrimAPI_MakePrism`
- ❌ `revolve` — `BRepPrimAPI_MakeRevol`

The `OCCWorkerClient.ts` also has no corresponding methods. This is expected for current development stage — just documenting the gap for Phase F planning.

---

### 🟡 Bug 2 — `Solid3D` undo/redo not parameter-based

**File:** `core/model/HistoryManager.ts`

`HistoryManager` uses `entity.clone()` for undo snapshots. `Solid3D.clone()` copies `positions: number[]` and `indices: number[]` which are plain arrays — JSON-serializable and correctly cloneable.

However, for **boolean results** (when implemented in Phase F), the clone will only capture the mesh output, not the operation parameters (shape A + shape B + operation type). If shape A or B is later deleted, undo cannot reconstruct the boolean result.

This is not a current bug — it will become one when `union`/`subtract` are implemented. Design the undo record for booleans as:

```typescript
interface BooleanHistoryRecord {
  operation: 'union' | 'subtract' | 'intersect';
  shapeAId: string;
  shapeBId: string;
  resultId: string;
}
```

---

### 🟠 Minor — `isSelectionStep` condition still duplicated

**File:** `app.ts`

The method `isInSelectionStep()` exists, but the list of command names that constitute an "immediate pick" (Trim, Extend, Offset, Fillet, Chamfer, Break, Lengthen, DimRadius, DimAngular, List) appears twice in the click handler:

```typescript
// app.ts ~line 546
const isImmediatePick = (activeName === 'TrimCommand' || ...);
const isFilletPick = activeName === 'FilletCommand' && ...;
const isChamferPick = ...;
// etc — 7 separate boolean expressions
```

When a new command is added (e.g., `MeasureCommand`), this block must be manually extended. Extract to `isImmediatePickCommand(activeName, step)` method alongside `isInSelectionStep()`.

---

### 🟠 Minor — `app.ts` growing toward God class (821 lines)

The `addEntityToViewer()` block (which dispatches each entity type to the correct `viewer.add*()` method) is still in `app.ts`. It belongs in either `Viewer.ts` as `viewer.addEntity(entity)` or a dedicated `EntityRenderDispatcher`. As PRD_3 adds `Solid3D` rendering and more entity types, this block will expand significantly.

---

## Summary Scorecard

| Area | Status | Notes |
|---|---|---|
| 2D core stability | 🟢 92% | Solid — selection, snapping, history all clean |
| Plot SVG output | 🟢 100% | All geometry and text sizes correct |
| Plot PDF output | 🟢 100% | Font size bug resolved |
| Command registry | 🟢 95% | Map-based, clean |
| History / Undo | 🟢 85% | Works for all current entities; Boolean undo needs design |
| OCC Worker | 🟢 75% | Primitives work; booleans pending |
| scheduleRender | 🟢 100% | ✅ Correctly implemented |
| Selection + layers | 🟢 100% | ✅ Correctly implemented |
| Shift multi-select | 🟢 100% | ✅ Correctly implemented |
| lineWeight on Layer | 🟢 90% | Field + DXF + handler — Viewer rendering still 1px (WebGL limit) |
| DXF elevation/thickness | 🟢 90% | Export correct; import needs verification |
