# 3D Selection — Pseudocode
# Extends existing 2D SelectionEngine with 3D raycasting for Solid3D entities.
# Covers: single click, multi-select (Shift), box window, crossing, deselect.
#
# Key constraint: Solid3D uses THREE.Mesh — cannot use 2D geometric hit tests.
# Solution: THREE.Raycaster for click; projected XY bbox for box/crossing.
# three-mesh-bvh is optional acceleration for large tessellated meshes.

═══════════════════════════════════════════════════════════════
## 1. WHY TWO CODE PATHS ARE NEEDED
═══════════════════════════════════════════════════════════════

// 2D entities:  Quadtree → geometric distance (point-to-line, point-to-arc…)
//               Works in drawing-unit (world) space.
//               Already implemented in SelectionEngine.

// 3D entities:  THREE.Raycaster → triangle intersection
//               Works in screen space (NDC) → 3D ray in world space.
//               Cannot be approximated by 2D distance — a 3D solid occupies
//               a volume; its screen silhouette changes with camera angle.
//
// Box/Crossing: Solid3D.getBoundingBox() returns the XY projection (min/max X,Y
//               across all vertices). For orthographic top-down view this is
//               correct — the XY footprint IS the screen footprint.
//               The existing Quadtree already indexes Solid3D by this bbox.
//               So box/crossing works for Solid3D already — only click needs fixing.

// Current bugs in SelectionEngine for Solid3D:
//   isPointNearEntity(Solid3D) → falls through all instanceof → return false
//   isEntityIntersectingBox(Solid3D) → falls through → return true  ← WRONG

═══════════════════════════════════════════════════════════════
## 2. Solid3D MODEL UPDATES
═══════════════════════════════════════════════════════════════

// File: core/model/Solid3D.ts

CLASS Solid3D EXTENDS Entity:
  positions: number[]   // flat [x0,y0,z0, x1,y1,z1, ...] from OCC tessellation
  indices:   number[]   // triangle indices

  // Add bvhBuilt flag to avoid re-building on every frame
  bvhBuilt: boolean = false

  // ── Add hitTest — delegates to raycaster, always returns false ──
  // 2D hit testing is meaningless for a 3D mesh.
  // Returning false ensures SelectionEngine skips this entity,
  // and the 3D raycaster in app.ts handles it instead.
  hitTest(px: number, py: number, tolerance: number): boolean
    RETURN false   // signal: use 3D raycaster, not 2D geometric test

  // ── 3D bounding box (all 3 axes) ────────────────────────────────
  // Used for BVH and frustum tests. Different from getBoundingBox() which
  // returns only XY for the Quadtree.
  getBoundingBox3D(): Box3
    minX = minY = minZ = Infinity
    maxX = maxY = maxZ = -Infinity
    FOR i = 0 TO positions.length STEP 3:
      x = positions[i], y = positions[i+1], z = positions[i+2]
      minX = min(minX, x);  maxX = max(maxX, x)
      minY = min(minY, y);  maxY = max(maxY, y)
      minZ = min(minZ, z);  maxZ = max(maxZ, z)
    RETURN new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ)
    )

  // Override getBoundingBox() — keep XY projection for Quadtree
  getBoundingBox(): BoundingBox
    // ... unchanged — min/max of x,y components only

═══════════════════════════════════════════════════════════════
## 3. FIX EXISTING SelectionEngine BUGS FOR Solid3D
═══════════════════════════════════════════════════════════════

// File: core/engine/SelectionEngine.ts
// These two fixes prevent incorrect behavior for Solid3D in the 2D engine.

─── Fix A: isPointNearEntity ───────────────────────────────────

PRIVATE static isPointNearEntity(px, py, entity, tolerance): boolean

  IF entity.hitTest:
    RETURN entity.hitTest(px, py, tolerance)
    // Solid3D.hitTest() returns false → falls through to 3D path in app.ts
    // All other entities return their geometric result

  // ... rest of instanceof chain unchanged

─── Fix B: isEntityIntersectingBox (crossing selection) ────────

PRIVATE static isEntityIntersectingBox(entity, minX, minY, maxX, maxY): boolean

  // Solid3D — use XY bounding box overlap (correct for orthographic view)
  IF entity instanceof Solid3D:
    box = entity.getBoundingBox()   // XY projection
    // Overlap test: two boxes overlap if neither is fully outside the other
    RETURN NOT (box.maxX < minX OR box.minX > maxX OR
                box.maxY < minY OR box.minY > maxY)

  // ... rest of instanceof chain unchanged (Line, Circle, etc.)

═══════════════════════════════════════════════════════════════
## 4. BVH SETUP IN VIEWER (optional — accelerates large meshes)
═══════════════════════════════════════════════════════════════

// File: render/Viewer.ts
// Install: npm install three-mesh-bvh
// Import:  import { computeBoundsTree, disposeBoundsTree,
//                   acceleratedRaycast } from 'three-mesh-bvh'
//          THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
//          THREE.BufferGeometry.prototype.disposeBoundsTree  = disposeBoundsTree
//          THREE.Mesh.prototype.raycast = acceleratedRaycast

// Add this once at module level (after THREE imports):
FUNCTION setupBVHExtension():
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
  THREE.Mesh.prototype.raycast = acceleratedRaycast

// In addSolid3D() — build BVH after creating mesh:
addSolid3D(entity: Solid3D, layer?, color?, isVisible = true):
  obj = this.createSolid3DObject(entity, color || 7)
  obj.name = entity.id

  // Build BVH for fast raycasting (replaces default O(n triangles) test)
  IF obj instanceof THREE.Mesh:
    obj.geometry.computeBoundsTree()   // three-mesh-bvh extension
    entity.bvhBuilt = true

  obj.userData = { ...obj.userData, layer, entityType: 'Solid3D' }
  obj.visible = isVisible
  this.scene.add(obj)

// In removeObject() — dispose BVH when mesh is removed:
removeObject(id: string):
  obj = this.scene.getObjectByName(id)
  IF obj instanceof THREE.Mesh AND obj.geometry.boundsTree:
    obj.geometry.disposeBoundsTree()
  // ... rest unchanged

═══════════════════════════════════════════════════════════════
## 5. Selection3DEngine — NEW CLASS
═══════════════════════════════════════════════════════════════

// File: core/engine/Selection3DEngine.ts

import * as THREE from 'three'
import { Solid3D } from '../model/Solid3D'
import { Entity } from '../model/Entity'
import { IDocument } from '../model/Document'

CONST raycaster = new THREE.Raycaster()
raycaster.params.Mesh.threshold = 0   // exact triangle intersection only

─── 5A. NDC conversion helper ──────────────────────────────────

// Convert world-space point to Normalised Device Coordinates (-1 to +1)
// for THREE.Raycaster. Works with OrthographicCamera.
//
// IMPORTANT: app.ts already converts screen → world via viewer.screenToWorld().
// We go back from world → NDC so the raycaster can work correctly.
// Alternative: store raw screen coords and convert directly — but world coords
// are already available at the call site in app.ts.

PRIVATE static worldToNDC(
  worldX: number,
  worldY: number,
  camera: THREE.OrthographicCamera,
): THREE.Vector2

  // Project world point through camera
  vec = new THREE.Vector3(worldX, worldY, 0)
  vec.project(camera)   // modifies vec.x,vec.y to NDC (-1 to 1)
  RETURN new THREE.Vector2(vec.x, vec.y)

─── 5B. Get all Solid3D meshes from scene ──────────────────────

PRIVATE static getSolid3DMeshes(
  scene: THREE.Scene,
  selectableEntities: Entity[],
  doc: IDocument,
): THREE.Mesh[]

  result: THREE.Mesh[] = []
  selectableIds = new Set(selectableEntities.map(e => e.id))

  scene.traverse(obj =>
    IF obj instanceof THREE.Mesh AND
       obj.userData.entityType === 'Solid3D' AND
       obj.name AND
       selectableIds.has(obj.name):
      result.push(obj)
  )
  RETURN result

─── 5C. Single click — get Solid3D at screen point ─────────────

// Returns the front-most Solid3D under the screen point.
// Uses raycaster — works correctly for all camera angles.

static getSolid3DAt(
  worldX: number,
  worldY: number,
  camera: THREE.OrthographicCamera,
  scene: THREE.Scene,
  doc: IDocument,
  selectableEntities: Entity[],
): Solid3D | null

  ndc = this.worldToNDC(worldX, worldY, camera)
  raycaster.setFromCamera(ndc, camera)

  meshes = this.getSolid3DMeshes(scene, selectableEntities, doc)
  IF meshes.length === 0: RETURN null

  // intersectObjects returns sorted by distance (closest first)
  intersects = raycaster.intersectObjects(meshes, false)
  IF intersects.length === 0: RETURN null

  // Front-most hit
  hit = intersects[0]
  entityId = hit.object.name
  entity = doc.getEntity(entityId)

  IF entity instanceof Solid3D: RETURN entity
  RETURN null

─── 5D. Click cycle — cycle through stacked Solid3Ds ───────────

// When multiple Solid3Ds overlap at screen point (e.g., a box sitting on a
// plate), repeated clicks cycle through them — same as AutoCAD's Tab key.
// lastClickedId tracks which entity was selected last at this screen position.

static lastClickedId: string | null = null
static lastClickWorldX: number = Infinity
static lastClickWorldY: number = Infinity
static CLICK_SAME_POS_TOLERANCE = 5  // drawing units

static getSolid3DAtCycling(
  worldX: number,
  worldY: number,
  camera: THREE.OrthographicCamera,
  scene: THREE.Scene,
  doc: IDocument,
  selectableEntities: Entity[],
): Solid3D | null

  ndc = this.worldToNDC(worldX, worldY, camera)
  raycaster.setFromCamera(ndc, camera)

  meshes = this.getSolid3DMeshes(scene, selectableEntities, doc)
  IF meshes.length === 0:
    this.lastClickedId = null
    RETURN null

  intersects = raycaster.intersectObjects(meshes, false)
  IF intersects.length === 0:
    this.lastClickedId = null
    RETURN null

  // Check if click is near same position as last click
  distSinceLastClick = sqrt((worldX - lastClickWorldX)^2 + (worldY - lastClickWorldY)^2)
  isSamePosition = distSinceLastClick < CLICK_SAME_POS_TOLERANCE

  IF isSamePosition AND lastClickedId !== null:
    // Find the index of the last-selected entity in the hit list
    ids = intersects.map(i => i.object.name)
    lastIdx = ids.indexOf(lastClickedId)
    // Advance to the next one in the stack (wraps around)
    nextIdx = (lastIdx + 1) % intersects.length
    hit = intersects[nextIdx]
  ELSE:
    // New click position — take the front-most
    hit = intersects[0]

  this.lastClickedId = hit.object.name
  this.lastClickWorldX = worldX
  this.lastClickWorldY = worldY

  entity = doc.getEntity(hit.object.name)
  IF entity instanceof Solid3D: RETURN entity
  RETURN null

─── 5E. Box window — Solid3Ds fully inside selection box ────────

// For orthographic view: check if the 3D solid's entire XY footprint
// is contained within the selection rectangle.
// The getBoundingBox() XY projection is correct for top-down orthographic.
// For tilted camera views (future), use frustum containment instead.

static getSolid3DsInWindow(
  x1: number, y1: number,
  x2: number, y2: number,
  doc: IDocument,
  selectableEntities: Entity[],
): Solid3D[]

  minX = min(x1, x2);  maxX = max(x1, x2)
  minY = min(y1, y2);  maxY = max(y1, y2)

  selectableIds = new Set(selectableEntities.map(e => e.id))

  RETURN selectableEntities
    .filter(e => e instanceof Solid3D)
    .filter(e => selectableIds.has(e.id))
    .filter(solid3D => {
      box = solid3D.getBoundingBox()   // XY projection
      // ALL corners of bbox must be inside window
      RETURN box.minX >= minX AND box.maxX <= maxX AND
             box.minY >= minY AND box.maxY <= maxY
    })

─── 5F. Crossing selection — Solid3Ds overlapping selection box ─

static getSolid3DsInCrossing(
  x1: number, y1: number,
  x2: number, y2: number,
  doc: IDocument,
  selectableEntities: Entity[],
): Solid3D[]

  minX = min(x1, x2);  maxX = max(x1, x2)
  minY = min(y1, y2);  maxY = max(y1, y2)

  RETURN selectableEntities
    .filter(e => e instanceof Solid3D)
    .filter(solid3D => {
      box = solid3D.getBoundingBox()   // XY projection
      // ANY overlap — bbox doesn't fully lie outside the window
      RETURN NOT (box.maxX < minX OR box.minX > maxX OR
                  box.maxY < minY OR box.minY > maxY)
    })

─── 5G. Hover highlight — mouse move ──────────────────────────

// Used for hover preview (cursor change, pre-highlight) without committing
// to selection. Runs on every mousemove.

static getHoveredSolid3D(
  worldX: number,
  worldY: number,
  camera: THREE.OrthographicCamera,
  scene: THREE.Scene,
  doc: IDocument,
  selectableEntities: Entity[],
): Solid3D | null

  // Same as getSolid3DAt but uses a wider tolerance for hover feedback
  RETURN this.getSolid3DAt(worldX, worldY, camera, scene, doc, selectableEntities)

═══════════════════════════════════════════════════════════════
## 6. APP.TS INTEGRATION
═══════════════════════════════════════════════════════════════

// File: app.ts
// Import at top:
// import { Selection3DEngine } from './core/engine/Selection3DEngine'

─── 6A. getSelectableEntities — unchanged (works for Solid3D too)

// Already filters: isVisible=true, isFrozen=false
// Solid3D entities pass through correctly

─── 6B. getSolid3DSelectables — subset helper ──────────────────

PRIVATE getSolid3DSelectables(): Solid3D[]
  RETURN this.getSelectableEntities()
    .filter(e => e instanceof Solid3D) as Solid3D[]

─── 6C. Single click — update pointerUp/click handler ─────────

// CURRENT (2D only):
const entity = SelectionEngine.getEntityAtSpatial(
  worldPt.x, worldPt.y, tolerance, this.doc, selectableEntities
)

// NEW (2D + 3D):
// Step 1: Try 2D first (faster, Quadtree-accelerated)
let entity: Entity | null = SelectionEngine.getEntityAtSpatial(
  worldPt.x, worldPt.y, tolerance, this.doc, selectableEntities
)

// Step 2: If no 2D entity found, try 3D raycast
IF entity === null:
  solid3D = Selection3DEngine.getSolid3DAtCycling(
    worldPt.x, worldPt.y,
    this.viewer.camera,
    this.viewer.scene,
    this.doc,
    this.getSolid3DSelectables()
  )
  IF solid3D: entity = solid3D

// Step 3: Apply selection modifiers (unchanged)
IF entity:
  IF isShift:
    IF this.selectedEntityIds.has(entity.id):
      this.selectedEntityIds.delete(entity.id)  // Shift+click = deselect
    ELSE:
      this.selectedEntityIds.add(entity.id)      // Shift+click = add to set
  ELSE:
    // No shift — clear all, select only this one
    this.selectedEntityIds.clear()
    this.selectedEntityIds.add(entity.id)

  this.viewer.setHighlight(Array.from(this.selectedEntityIds))

ELSE IF NOT isShift:
  // Click on empty space without shift — deselect all
  this.selectedEntityIds.clear()
  this.viewer.setHighlight([])

─── 6D. Box/Crossing selection — update drag handler ───────────

// CURRENT:
IF isCrossing:
  found = SelectionEngine.getEntitiesInCrossingSpatial(x1, y1, x2, y2, doc, selectableEntities)
ELSE:
  found = SelectionEngine.getEntitiesInWindowSpatial(x1, y1, x2, y2, doc, selectableEntities)

// NEW — merge 2D and 3D results:
IF isCrossing:
  entities2D = SelectionEngine.getEntitiesInCrossingSpatial(
    x1, y1, x2, y2, this.doc, selectableEntities
  )
  entities3D = Selection3DEngine.getSolid3DsInCrossing(
    x1, y1, x2, y2, this.doc, this.getSolid3DSelectables()
  )
ELSE:
  entities2D = SelectionEngine.getEntitiesInWindowSpatial(
    x1, y1, x2, y2, this.doc, selectableEntities
  )
  entities3D = Selection3DEngine.getSolid3DsInWindow(
    x1, y1, x2, y2, this.doc, this.getSolid3DSelectables()
  )

// Deduplicate (a Solid3D won't appear in both, but defensive)
found = [...entities2D, ...entities3D]
  .filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i)

// Apply modifier
IF isShift:
  // Add to existing selection (don't clear first)
  found.forEach(e => this.selectedEntityIds.add(e.id))
ELSE:
  // Replace selection
  this.selectedEntityIds = new Set(found.map(e => e.id))

this.viewer.setHighlight(Array.from(this.selectedEntityIds))

─── 6E. Mousemove hover — update hover handler ─────────────────

// CURRENT:
const hoveredEntity = SelectionEngine.getEntityAtSpatial(
  worldPt.x, worldPt.y, tolerance, this.doc, selectableEntities
)

// NEW:
let hoveredEntity: Entity | null = SelectionEngine.getEntityAtSpatial(
  worldPt.x, worldPt.y, tolerance, this.doc, selectableEntities
)

IF hoveredEntity === null:
  hoveredEntity = Selection3DEngine.getHoveredSolid3D(
    worldPt.x, worldPt.y,
    this.viewer.camera,
    this.viewer.scene,
    this.doc,
    this.getSolid3DSelectables()
  )

// Update cursor and pre-highlight unchanged

─── 6F. Shift+click behavior summary ──────────────────────────

// All three cases handled by the same logic above:

// Case 1: Click on 3D solid (nothing selected)
//   → Select solid (yellow highlight)

// Case 2: Shift+Click on a second 3D solid
//   → Add to selection (both highlighted yellow)

// Case 3: Shift+Click on already-selected 3D solid
//   → Remove from selection (returns to original color)

// Case 4: Click on empty space (no Shift)
//   → Clear all selections (all return to original color)

// Case 5: Shift+Click on empty space
//   → Do nothing (preserve existing selection)

// Case 6: Shift+Click on 2D entity while 3D entities selected
//   → Add 2D entity to selection (mixed 2D+3D selection)
//   → setHighlight() handles both entity types

// Case 7: Drag box (no Shift)
//   → Select all 2D+3D inside/crossing window, clear previous

// Case 8: Drag box with Shift
//   → Add all 2D+3D inside/crossing window to existing selection

═══════════════════════════════════════════════════════════════
## 7. VIEWER HIGHLIGHT — SOLID3D EXTENSION
═══════════════════════════════════════════════════════════════

// File: render/Viewer.ts
// setHighlight() already traverses THREE.Mesh objects and changes their
// material color. Solid3D meshes are named by entity.id.
// The existing code handles THREE.Mesh via the `else if (obj.material)` branch.
// However, there is a gap: Solid3D uses MeshPhongMaterial in shaded mode,
// MeshBasicMaterial in wireframe mode. The highlight must handle both.

// CURRENT setHighlight — works but only checks 'color' in material.
// MeshPhongMaterial has 'color' → works ✅
// MeshBasicMaterial  has 'color' → works ✅

// The existing code is sufficient for Solid3D highlight.
// Only one addition needed: store the original emissive color for Phong material
// when highlighting, to avoid yellow bleeding into the shaded lighting:

// In setHighlight(), when processing a Solid3D mesh:
IF obj.material instanceof THREE.MeshPhongMaterial:
  IF NOT this.originalColors.has(obj.name):
    this.originalColors.set(obj.name + '_emissive',
      obj.material.emissive.getHex())
  // Set highlight: bright yellow fill, no emissive
  obj.material.color.set(0xffff00)
  obj.material.emissive.set(0x222200)   // slight warm tint
  obj.material.needsUpdate = true

// In clearHighlight() / deselect:
IF obj.material instanceof THREE.MeshPhongMaterial:
  const origEmissive = this.originalColors.get(obj.name + '_emissive')
  IF origEmissive !== undefined:
    obj.material.emissive.set(origEmissive)
  obj.material.needsUpdate = true

─── Visual hover state (pre-highlight before click) ─────────────

// Add separate hover highlight — lighter than selection highlight
// so user can distinguish "will select" from "selected".

FUNCTION setHover(id: string | null):
  IF this.hoveredId === id: RETURN   // no change

  // Clear previous hover
  IF this.hoveredId:
    restoreHoverColor(this.hoveredId)
    this.hoveredId = null

  IF id:
    obj = this.scene.getObjectByName(id)
    IF obj:
      applyHoverColor(obj, 0x88aaff)   // light blue hover vs yellow select
      this.hoveredId = id

  this.scheduleRender()

═══════════════════════════════════════════════════════════════
## 8. LAYER RESPECT — 3D SELECTION
═══════════════════════════════════════════════════════════════

// Solid3D respects the same layer rules as 2D entities.
// getSelectableEntities() in app.ts already filters by:
//   isVisible=true, isFrozen=false (selectable but read-only if locked)
// Since Selection3DEngine takes `selectableEntities` as input,
// layer filtering is inherited automatically.

// getSolid3DMeshes() filters by selectableIds set:
//   Frozen layer entity → NOT in selectableEntities → NOT in selectableIds
//   → mesh skipped by raycaster → cannot be selected ✅

// getEditableEntities() filters by isLocked:
//   Locked layer Solid3D → selected (highlighted) but not passed to
//   transform commands → correct behavior ✅

═══════════════════════════════════════════════════════════════
## 9. SELECTION FEEDBACK — STATUS BAR UPDATE
═══════════════════════════════════════════════════════════════

// After selection changes, update status bar to show mixed 2D+3D count:

FUNCTION reportSelectionDimensions():
  IF selectedEntityIds.size === 0:
    statusBar.showMessage('')
    RETURN

  entities = Array.from(selectedEntityIds)
    .map(id => this.doc.getEntity(id))
    .filter(Boolean)

  count2D = entities.filter(e => !(e instanceof Solid3D)).length
  count3D = entities.filter(e =>  (e instanceof Solid3D)).length

  parts = []
  IF count2D > 0: parts.push(`${count2D} object${count2D > 1 ? 's' : ''}`)
  IF count3D > 0: parts.push(`${count3D} solid${count3D > 1 ? 's' : ''}`)

  statusBar.showMessage(`Selected: ${parts.join(', ')}`)

═══════════════════════════════════════════════════════════════
## 10. PERFORMANCE NOTES
═══════════════════════════════════════════════════════════════

// THREE.Raycaster without BVH: O(T) where T = number of triangles
//   A box has 12 triangles    → negligible
//   A sphere (64 segments)    → ~4000 triangles → still fast
//   A complex STEP model      → 100k+ triangles → may be slow
//
// three-mesh-bvh reduces raycast to O(log T) — highly recommended
// for any scene with imported STEP/IGES geometry.

// On mousemove — getSolid3DAt runs every pointer move event.
// Without BVH, this can cause lag if many complex Solid3D meshes exist.
// Mitigation: only run 3D hover raycast when pointer is NOT near any 2D entity.

// Optimised hover logic:
FUNCTION onMouseMove(worldX, worldY):
  tolerance = 5 / camera.zoom

  // Fast 2D check first (Quadtree — O(log n))
  entity2D = SelectionEngine.getEntityAtSpatial(worldX, worldY, tolerance, doc, selectableEntities)
  IF entity2D:
    viewer.setHover(entity2D.id)
    cursor = 'crosshair'
    RETURN   // skip expensive 3D raycast if 2D entity found

  // Only do 3D raycast if no 2D entity under cursor
  entity3D = Selection3DEngine.getHoveredSolid3D(
    worldX, worldY, camera, scene, doc, getSolid3DSelectables()
  )
  IF entity3D:
    viewer.setHover(entity3D.id)
    cursor = 'pointer'
  ELSE:
    viewer.setHover(null)
    cursor = 'default'

═══════════════════════════════════════════════════════════════
## 11. FILE CHANGE SURFACE
═══════════════════════════════════════════════════════════════

FILES TO CREATE:
  core/engine/Selection3DEngine.ts       ← new class (sections 5A–5G)

FILES TO MODIFY:
  core/model/Solid3D.ts
    + hitTest() returns false
    + getBoundingBox3D() for 3D AABB

  core/engine/SelectionEngine.ts
    + isPointNearEntity: Solid3D path (uses hitTest → false)
    + isEntityIntersectingBox: Solid3D bbox overlap fix

  render/Viewer.ts
    + setupBVHExtension() call (if using three-mesh-bvh)
    + addSolid3D: geometry.computeBoundsTree()
    + removeObject: geometry.disposeBoundsTree()
    + setHighlight: MeshPhongMaterial emissive handling
    + setHover(id): new method for hover pre-highlight

  app.ts
    + getSolid3DSelectables() helper
    + pointerUp/click: 2D → 3D fallback (section 6C)
    + drag handler: merge 2D + 3D results (section 6D)
    + mousemove: 2D → 3D hover fallback (section 6E)
    + reportSelectionDimensions: show 2D+3D counts

NO CHANGES NEEDED:
  SelectionEngine spatial methods (getEntitiesInWindowSpatial, etc.)
  HistoryManager (Solid3D.clone() already correct)
  LayerHandler, LayerManager
  CommandManager registry
  Any command files
