# WebCAD Tasks

## Current Task: Implement Text and MText Hit Test
- [x] Add `hitTest` method to `Text.ts` <!-- id: 900 -->
- [x] Fix `getBoundingBox()` in `MText.ts` <!-- id: 903 -->
- [x] Add `hitTest` method to `MText.ts` <!-- id: 904 -->
- [x] Remove `if (entity instanceof Text) return true;` from `SelectionEngine.ts` <!-- id: 901 -->
- [x] Verify with tests <!-- id: 902 -->

## Current Task: Refactor TransformHandler.ts (Phase 1: FilletHandler)
- [x] Create `src/core/engine/handlers/transform/` directory <!-- id: 890 -->
- [x] Create `FilletHandler.ts` <!-- id: 891 -->
- [x] Update `TransformHandler.ts` to remove fillet <!-- id: 892 -->
- [x] Update `app.ts` to register `FilletHandler` <!-- id: 893 -->
- [x] Verify with tests <!-- id: 894 -->

## Current Task: Refactor Viewer.ts (Phase 1: GridRenderer)
- [x] Create `GridRenderer.ts` <!-- id: 880 -->
- [x] Update `Viewer.ts` to use `GridRenderer` <!-- id: 881 -->
- [x] Verify with tests <!-- id: 882 -->

## Current Task: Remove legacy selection methods
- [x] Update `NoteCommand.ts` <!-- id: 860 -->
- [x] Mark legacy methods as `@deprecated` in `SelectionEngine.ts` <!-- id: 862 -->
- [x] Verify with tests <!-- id: 863 -->

## Current Task: Remove dead API surface in Document
- [x] Remove `recordModify` and `recordBatch` from `Document.ts` <!-- id: 850 -->
- [x] Verify with tests <!-- id: 851 -->

## Current Task: Fix doc type in CommandManager
- [x] Update `CommandManager.ts` <!-- id: 840 -->
- [x] Verify with tests <!-- id: 841 -->

## Current Task: Remove debug console.log calls
- [x] Remove `console.log` from `SelectionEngine.ts` <!-- id: 830 -->
- [x] Remove `console.log` from `TransformHandler.ts` <!-- id: 831 -->
- [x] Remove `console.log` from `TrimCommand.ts` <!-- id: 832 -->
- [x] Remove `console.log` from `HatchCommand.ts` <!-- id: 833 -->
- [x] Verify with tests <!-- id: 834 -->

## Current Task: Fix Insert.mirror() stub
- [x] Update `Insert.ts` <!-- id: 820 -->
- [x] Verify with tests <!-- id: 821 -->

## Current Task: Fix HistoryManager.TRANSFORM using clones
- [x] Update `HistoryManager.ts` <!-- id: 810 -->
- [x] Add `HistoryManager.test.ts` <!-- id: 811 -->
- [x] Verify with tests <!-- id: 812 -->

## Current Task: Optimize Quadtree Removal
- [x] Add `remove` method to `Quadtree.ts` <!-- id: 800 -->
- [x] Update `removeEntity` in `Document.ts` <!-- id: 801 -->
- [x] Add `Quadtree.test.ts` <!-- id: 802 -->
- [x] Verify with tests <!-- id: 803 -->

## Current Task: Implement Units & Measurement Features
- [x] Support unit suffixes in `CoordinateParser.ts` <!-- id: 610 -->
- [x] Pass units to `CoordinateParser` in `CommandManager.ts` <!-- id: 611 -->
- [x] Use `FormatUtils` in `Viewer.ts` for dimensions <!-- id: 612 -->
- [x] Add unit tests for coordinate parser with suffixes <!-- id: 613 -->

## Current Task: Preserve Polygon ID Prefix on DXF Reload
- [x] Add XData to Polyline in `dxfExport.ts` if ID starts with `PG` <!-- id: 600 -->
- [x] Read XData in `dxfImport.ts` and use `PG` prefix if found <!-- id: 601 -->
- [ ] Verify by creating, saving, and reloading a polygon <!-- id: 602 -->

## Current Task: Fix Failing Tests for Baseline
- [x] Fix failing tests <!-- id: 700 -->
  - [x] Fix `DimRadiusCommand` tests <!-- id: 701 -->
  - [x] Fix `Offset` tests <!-- id: 702 -->
  - [x] Fix `TransformHandler` tests <!-- id: 703 -->
  - [x] Verify all tests pass <!-- id: 704 -->

## Current Task: Create DataTable Component (Base)
- [x] Create `src/ui/DataTable.ts` (Base class) <!-- id: 300 -->
- [x] Add styles for `DataTable` in `src/style.css` <!-- id: 301 -->
- [x] Implement row selection and data population logic <!-- id: 302 -->

## Current Task: Create Layer Tool Window
- [x] Create `src/ui/LayerDataTable.ts` inheriting from `DataTable` <!-- id: 312 -->
- [x] Create `src/ui/LayerWindow.ts` or implement in `main.ts` <!-- id: 308 -->
- [x] Add toolbar and filter input to Layer Window <!-- id: 309 -->
- [x] Use `LayerDataTable` to list layers with status icons <!-- id: 310 -->
- [ ] Handle layer selection and state toggles <!-- id: 311 -->

## Current Task: Create ColorSelectList Component
- [ ] Create `src/ui/ColorSelectList.ts` <!-- id: 304 -->
- [ ] Add styles for `ColorSelectList` in `src/style.css` <!-- id: 305 -->
- [ ] Implement color items and selection logic <!-- id: 306 -->
- [ ] Verify component by creating a dummy instance <!-- id: 307 -->

## Current Task: Implement Layer Table Right-Click Toggles
- [x] Add `onVisibilityToggle` and `onFreezeToggle` to `LayerDataTable` <!-- id: 502 -->
- [x] Add `contextmenu` listeners to `visIcon` and `freezeIcon` in `LayerDataTable` <!-- id: 503 -->
- [x] Add callbacks to `LayerWindow` constructor for visibility and freeze <!-- id: 504 -->
- [x] Wire callbacks in `LayerWindow` to `LayerDataTable` <!-- id: 505 -->
- [x] Pass command execution callbacks in `main.ts` <!-- id: 506 -->
- [x] Verify behavior by right-clicking in UI (or unit tests) <!-- id: 507 -->
- [x] Reset layer list to only Layer 0 on New drawing <!-- id: 508 -->

## Current Task: Make Layer Window Filter and Buttons Functional
- [x] Store `filterInput` as class property in `LayerWindow` <!-- id: 509 -->
- [x] Implement filtering in `LayerWindow.refresh()` <!-- id: 510 -->
- [x] Add `input` event listener to `filterInput` <!-- id: 511 -->
- [x] Add click handlers to toolbar buttons in `LayerWindow` <!-- id: 512 -->
- [x] Implement popup input for "New Layer" button <!-- id: 513 -->
- [x] Verify functionality by filtering and creating layers <!-- id: 514 -->

## Current Task: Docking Pane and Dockable Windows
- [x] Update layout and add styles for docking pane in `src/style.css` <!-- id: 107 -->
- [x] Create `src/ui/DockingManager.ts` <!-- id: 108 -->
- [x] Make `Menu` dockable and place in docking pane <!-- id: 109 -->
- [x] Make `FloatingToolbar` dockable <!-- id: 110 -->
- [x] Integrate `DockingManager` in `src/main.ts` <!-- id: 111 -->

## Current Task: Floating Toolbar for DRAW Commands
- [x] Create `public/icons/black_blue` and copy needed icons <!-- id: 103 -->
- [x] Create `src/ui/FloatingToolbar.ts` <!-- id: 104 -->
- [x] Add styles for floating toolbar in `src/style.css` <!-- id: 105 -->
- [x] Integrate `FloatingToolbar` in `src/main.ts` or `App.ts` <!-- id: 106 -->

## Current Task: UI Theme Reform
- [x] Research and extract color tokens from `DESIGN.md` <!-- id: 100 -->
- [x] Update `src/style.css` with new variables and styles <!-- id: 101 -->
- [/] Verify UI changes in browser <!-- id: 102 -->

## Todo (Phase 7 — Engineering Drafting & Annotation)

### Phase A (Critical Engineering Foundation)
- [ ] Implement DIMLINEAR command (Linear dimensions) <!-- id: 21 -->
- [ ] Implement DIMALIGNED command (Aligned dimensions) <!-- id: 22 -->
- [ ] Implement Intersection and Perpendicular snaps <!-- id: 25 -->
- [ ] Support unit suffixes in coordinate parser (e.g., "10mm", "5'") <!-- id: 26 -->

### Phase B (Advanced Drafting & Refinement)
- [ ] Implement CHAMFER command <!-- id: 20 -->
- [x] Implement DIMRADIUS and DIMANGULAR commands <!-- id: 27 -->
- [ ] Implement RECTANG command (wrapper for Polyline) <!-- id: 28 -->
- [ ] Implement DONUT command <!-- id: 23 -->
- [ ] Implement BREAK and JOIN commands <!-- id: 29 -->

### Phase C (Polish & Specialized Tools)
- [ ] Implement Annotation Styles (DimStyle) <!-- id: 30 -->
- [ ] Implement ELLIPSE command <!-- id: 24 -->
- [ ] Implement LENGTHEN command <!-- id: 31 -->
- [ ] Implement Tangent and Nearest snaps <!-- id: 32 -->

## Ongoing
- [ ] Phase 7: Functional parity with AutoCAD 2.6 drafting capabilities.


## Done
- [x] Fix Polyline offset to handle arcs and global side <!-- id: 401 -->
- [x] Convert `#main-area` to flexbox to fix animation issue <!-- id: 214 -->
- [x] Move `#docking-pane` to initial HTML to prevent load animation <!-- id: 212 -->
- [x] Position `FloatingToolbar` (DRAW) at the right of screen by default <!-- id: 213 -->
- [x] Add minimize button to `#command-area` in `CommandLine.ts` <!-- id: 209 -->
- [x] Add click handler to toggle minimized state in `CommandLine.ts` <!-- id: 210 -->
- [x] Update styles in `src/style.css` to handle minimized state <!-- id: 211 -->
- [x] Update `#main-area` layout in `src/style.css` to support left sidebar <!-- id: 205 -->
- [x] Instantiate `ToolWindowBar` and `ToolWindow` in `src/main.ts` <!-- id: 206 -->
- [x] Add "Layers" window to the bar with dummy content <!-- id: 207 -->
- [x] Style the `ToolWindowBar` and `ToolWindow` in `src/style.css` <!-- id: 208 -->
- [x] Create `src/ui/ToolWindow.ts` (Base component) <!-- id: 203 -->
- [x] Create `src/ui/ToolWindowBar.ts` <!-- id: 204 -->
- [x] Rename folder `tech_docs` to `Documents` <!-- id: 201 -->
- [x] Update `.gitignore` to replace `tech_docs/` with `Documents/` <!-- id: 202 -->
- [x] Untrack `tech_docs` from git <!-- id: 200 -->
- [x] Implement GRID snap and toggle (F7) <!-- id: 11 -->
- [x] Implement ORTHO mode and toggle (F8) <!-- id: 12 -->
- [x] Implement TRIM and EXTEND commands <!-- id: 10 -->
- [x] Implement OFFSET command <!-- id: 4 -->
- [x] Implement ARRAY command <!-- id: 5 -->
- [x] Implement ASCII DXF R12 Export <!-- id: 2 -->
- [x] Implement DXF Import parser <!-- id: 13 -->
- [x] Implement LineType (LTYPE) support for layers and rendering <!-- id: 17 -->
- [x] Add direct layer management commands (New, Set, On/Off, etc.) to the `LAYERS` side menu <!-- id: 16 -->
- [x] Implement Snap Engine (Endpoint, Midpoint, Center) <!-- id: 1 -->
- [x] Restore solid technical text rendering with `osifont` <!-- id: 14 -->
- [x] Use `osifont.ttf` (ISO 3098) as default technical font <!-- id: 15 -->
- [x] Fix failing `PolylineCommand` test (AssertionError in `getPreview`) <!-- id: 0 -->
- [x] Fix "always green" entity bug by correcting `setHighlight` and `aciToRgb` mapping <!-- id: 8 -->
- [x] Constrain EDIT commands to current layer in `App.ts` <!-- id: 9 -->
- [x] Implement ROTATE and SCALE commands <!-- id: 6 -->
- [x] Standardize dynamic prompts <!-- id: 7 -->
- [x] Implement MIRROR command <!-- id: 3 -->
- [x] Implement DIMRADIUS and DIMANGULAR commands <!-- id: 27 -->
- [x] Fix layer data table initialization when loading a drawing <!-- id: 501 -->

## Review: Fix Layer Table Initialization
- Problem: Layer table UI did not refresh when loading a DXF drawing or starting a new drawing.
- Fix: Added `onLayersChange()` calls in `IOHandler.ts` for `load` and `new` actions. Also reset layers to default on `new`.
- Verification: Added `IOHandler.test.ts` and verified with Vitest. Tests passed.
