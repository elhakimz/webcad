# Pseudocode: Boolean Operations — Union, Subtract, Intersect
### Three.js + OpenCASCADE WebCAD

---

## Core Problem: Shape Cache

The worker currently **discards the BREP shape after tessellation** — it only
returns `{ positions, indices }` to the main thread. Boolean operations need
two BREP shapes in OCC memory simultaneously. The solution is a persistent
**shape cache** inside the worker, keyed by entity ID.

```
Data flow without cache (current):
  OCC creates shape → tessellate → send positions/indices → DELETE shape

Data flow with cache (required):
  OCC creates shape → tessellate → STORE shape in cache[entityId]
                                 → send positions/indices
  Boolean op: cache[idA] + cache[idB] → fuse/cut/common → new shape
                                                         → cache[newId]
                                                         → send positions/indices
```

---

## 1. OCCWorker — Shape Cache & modified create handlers

```
// ── Global cache inside the worker ──────────────────────────────────────────
shapeCache: Map<string, TopoDS_Shape> = new Map()

// ── Helper: store a shape by entity ID ──────────────────────────────────────
FUNCTION cacheShape(entityId: string, shape: TopoDS_Shape):
  // If an old shape for this ID exists, delete it to free WASM heap
  IF shapeCache.has(entityId):
    shapeCache.get(entityId).delete()
  shapeCache.set(entityId, shape)

FUNCTION releaseShape(entityId: string):
  IF shapeCache.has(entityId):
    shapeCache.get(entityId).delete()
    shapeCache.delete(entityId)


// ── Modify ALL existing create* handlers to cache their result shape ─────────
// Pattern: after builder.Shape() and before sending geometry data,
//          call cacheShape(payload.entityId, resultShape)

// Example — createBox (same pattern for Cylinder, Sphere, Cone, Torus,
//           Extrude, Revolve):

} else if (type === 'createBox') {
  const { x, y, z, dx, dy, dz, deflection, entityId } = payload   // ADD entityId

  const corner = new oc.gp_Pnt_3(x, y, z)
  const builder = new oc.BRepPrimAPI_MakeBox_3(corner, dx, dy, dz)
  const resultShape = builder.Shape()

  IF entityId:
    cacheShape(entityId, resultShape)   // ← NEW: persist BREP for boolean ops

  const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection)
  self.postMessage({ type: 'result', id, data: geometryData })

  corner.delete()
  builder.delete()
  // NOTE: do NOT delete resultShape — it lives in the cache


// ── New handler: createBoolean ───────────────────────────────────────────────

} else if (type === 'createBoolean') {
  const { operation, idA, idB, entityId, deflection } = payload
  // operation: 'fuse' | 'cut' | 'common'

  TRY:
    IF NOT shapeCache.has(idA):
      THROW Error(`Shape not cached for solid A (id: ${idA}). 
                   Ensure solid was created in this OCC session.`)
    IF NOT shapeCache.has(idB):
      THROW Error(`Shape not cached for solid B (id: ${idB}).`)

    shapeA = shapeCache.get(idA)
    shapeB = shapeCache.get(idB)

    // ── Run the OCC boolean operation ───────────────────────────────────────
    let boolBuilder: any

    IF operation == 'fuse':
      boolBuilder = new oc.BRepAlgoAPI_Fuse_3(shapeA, shapeB)
    ELSE IF operation == 'cut':
      boolBuilder = new oc.BRepAlgoAPI_Cut_3(shapeA, shapeB)
    ELSE IF operation == 'common':
      boolBuilder = new oc.BRepAlgoAPI_Common_3(shapeA, shapeB)
    ELSE:
      THROW Error(`Unknown boolean operation: ${operation}`)

    boolBuilder.Build()

    IF NOT boolBuilder.IsDone():
      boolBuilder.delete()
      THROW Error(`Boolean ${operation} failed — shapes may not intersect or be invalid`)

    // Check the result is not empty (solids that don't intersect on Cut/Common)
    resultShape = boolBuilder.Shape()
    IF resultShape.IsNull():
      boolBuilder.delete()
      THROW Error(`Boolean ${operation} produced an empty result`)

    // ── Cache result and tessellate ─────────────────────────────────────────
    IF entityId:
      cacheShape(entityId, resultShape)

    geometryData = shapeToBufferGeometryData(resultShape, oc, deflection)
    self.postMessage({ type: 'result', id, data: geometryData })

    boolBuilder.delete()

  CATCH error:
    self.postMessage({ type: 'error', error: error.message, id })


// ── New handler: releaseShapes (called when entities are deleted) ─────────────

} else if (type === 'releaseShapes') {
  const { entityIds } = payload
  FOR each eid of entityIds:
    releaseShape(eid)
  self.postMessage({ type: 'result', id, data: null })
```

---

## 2. OCCWorkerClient — New methods

```
// In OCCWorkerClient.ts:

// Modify all existing create* to pass entityId:
createBox(x, y, z, dx, dy, dz, deflection, entityId?: string)
  → this.send('createBox', { x, y, z, dx, dy, dz, deflection, entityId })

createCylinder(x, y, z, r, h, deflection, entityId?: string)
  → this.send('createCylinder', { x, y, z, r, h, deflection, entityId })

createSphere(x, y, z, r, deflection, entityId?: string)
  → this.send('createSphere', { x, y, z, r, deflection, entityId })

createCone(x, y, z, r, h, deflection, entityId?: string)
  → this.send('createCone', { x, y, z, r, h, deflection, entityId })

createTorus(x, y, z, r1, r2, deflection, entityId?: string)
  → this.send('createTorus', { x, y, z, r1, r2, deflection, entityId })

createExtrude(points, height, thickness, deflection, isClosed, entityId?: string)
  → this.send('createExtrude', { points, height, thickness, deflection, isClosed, entityId })

createRevolve(points, axisPoint, axisDir, angle, thickness, deflection, isClosed, entityId?: string)
  → this.send('createRevolve', { points, axisPoint, axisDir, angle, thickness, deflection, isClosed, entityId })

// New methods:
createBoolean(
  operation: 'fuse' | 'cut' | 'common',
  idA: string,
  idB: string,
  entityId: string,
  deflection?: number
): Promise<{ positions: number[], indices: number[] }>
  → this.send('createBoolean', { operation, idA, idB, entityId, deflection })

releaseShapes(entityIds: string[]): Promise<void>
  → this.send('releaseShapes', { entityIds })
```

---

## 3. OpenCascadeService — New methods

```
// In OpenCascadeService.ts:

// Modify all existing create* signatures to forward entityId (same pattern):
async createBox(x, y, z, dx, dy, dz, deflection, entityId?: string)
  → data = await this.client.createBox(x, y, z, dx, dy, dz, deflection, entityId)
  → RETURN buildBufferGeometry(data)   // existing helper, no change

// New:
async createBoolean(
  operation: 'fuse' | 'cut' | 'common',
  idA: string,
  idB: string,
  entityId: string,
  deflection?: number
): Promise<THREE.BufferGeometry>
  data = await this.client.createBoolean(operation, idA, idB, entityId, deflection)
  RETURN buildBufferGeometry(data)

async releaseShapes(entityIds: string[]): Promise<void>
  await this.client.releaseShapes(entityIds)
```

---

## 4. BooleanCommand — Command layer

```
// BooleanCommand.ts
// Single class handles all three operations via constructor mode parameter.
// Registered as: UNION, SUBTRACT (or SUBTRACT), INTERSECT

CLASS BooleanCommand IMPLEMENTS Command, HasSetEntity:

  mode:          'fuse' | 'cut' | 'common'
  step:          number = 0

  solidA:        Solid3D | null = null    // first selected solid
  solidB:        Solid3D | null = null    // second selected solid
  solidAId:      string | null = null
  solidBId:      string | null = null

  occService:    OpenCascadeService


  CONSTRUCTOR(mode: 'fuse' | 'cut' | 'common'):
    this.mode = mode
    this.occService = OpenCascadeService.getInstance()


  // Called by the app when the user clicks on an already-selected solid
  setEntity(entity: Entity):
    IF NOT (entity instanceof Solid3D): RETURN

    IF step == 0:
      solidA   = entity
      solidAId = entity.id
      step     = 1
    ELSE IF step == 1:
      IF entity.id == solidAId:
        RETURN   // can't boolean a solid with itself
      solidB   = entity
      solidBId = entity.id
      step     = 2


  onPoint(x, y, id, units, doc): CommandResponse | Promise<CommandResponse>
    // Point picks are handled via setEntity for Solid3D; nothing needed here.
    RETURN getPrompt()


  onInput(text, id, units, pickPt, doc): CommandResponse | undefined
    IF text.toUpperCase() == 'U' OR text.toUpperCase() == 'UNDO':
      IF step == 2: step = 1; solidB = null; solidBId = null
      ELSE IF step == 1: step = 0; solidA = null; solidAId = null
      RETURN getPrompt()

    IF step == 2 AND text.toUpperCase() in ['', 'OK', 'YES', 'Y']:
      RETURN executeBooleanOp(id, doc)

    RETURN getPrompt()


  // Called when both solids are selected and user confirms (Enter or auto-execute)
  PRIVATE ASYNC executeBooleanOp(newId: string, doc: IDocument):
    Promise<CommandResponse>

    IF solidA == null OR solidB == null:
      step = 0
      RETURN "Select two solids."

    IF NOT shapeIsCached(solidAId) OR NOT shapeIsCached(solidBId):
      step = 0
      RETURN "Error: Solid geometry not available for boolean. 
              Re-create solids in this session."

    TRY:
      const facetres = doc?.facetres ?? 5.0
      const deflection = 0.1 / facetres

      geometry = await occService.createBoolean(
        mode, solidAId, solidBId, newId, deflection
      )

      positions = Array.from(geometry.attributes.position.array)
      indices   = Array.from(geometry.index.array)
      newSolid  = new Solid3D(newId, positions, indices)

      // Carry layer from solid A
      newSolid.layer = solidA.layer

      // ── Build response: return new solid, delete both source solids ─────
      step   = 0
      solidA = null
      solidB = null

      RETURN [
        newSolid,                                  // add result to document
        { action: 'delete', ids: [solidAId, solidBId] },  // remove sources
        // Also release BREP shapes from worker cache for the deleted entities
        // (fire-and-forget, no await needed)
        occService.releaseShapes([solidAId, solidBId])
      ]

    CATCH error:
      step = 0
      RETURN `Error: ${error.message}`


  getPrompt(): string
    IF step == 0: RETURN `${modeLabel()}: Select first solid (A):`
    IF step == 1: RETURN `${modeLabel()}: Select second solid (B) [U=undo]:`
    IF step == 2: RETURN `${modeLabel()}: Press Enter to confirm, U to re-select:`
    RETURN ''

  PRIVATE modeLabel(): string
    IF mode == 'fuse':   RETURN 'UNION'
    IF mode == 'cut':    RETURN 'SUBTRACT'
    IF mode == 'common': RETURN 'INTERSECT'

  getOptions(): string[]
    IF step >= 1: RETURN ['U']    // offer Undo to re-pick
    RETURN []
```

---

## 5. Command registration (app.ts / CommandRegistry)

```
// Register the three boolean commands:
commandRegistry.register('UNION',     () => new BooleanCommand('fuse'))
commandRegistry.register('SUBTRACT',  () => new BooleanCommand('cut'))
commandRegistry.register('INTERSECT', () => new BooleanCommand('common'))

// Also release cached shape whenever a Solid3D is erased from the document:
document.onEntityDeleted.subscribe((entity) => {
  IF entity instanceof Solid3D:
    occService.releaseShapes([entity.id])   // free WASM heap
})
```

---

## 6. Modified create* commands — pass entityId

```
// In BoxCommand.ts, CylinderCommand.ts, SphereCommand.ts, etc.
// Pass the new entity's id so the worker can cache the BREP shape.

// Example — BoxCommand:
const solid = new Solid3D(id, positions, indices)
// OLD:
const geometry = await occService.createBox(x, y, z, dx, dy, dz, deflection)
// NEW:
const geometry = await occService.createBox(x, y, z, dx, dy, dz, deflection, id)
//                                                                             ↑ entityId

// Same change for ExtrudeCommand, RevolveCommand, ConeCommand, TorusCommand, etc.
// The entityId = the `id` parameter passed into onPoint/onInput — same id used
// for the Solid3D constructor — so the cache key always matches the entity ID
// in the document.
```

---

## 7. Full operation flow diagram

```
User types: UNION
  │
  ├── App sets active command: BooleanCommand('fuse')
  │   Prompt: "UNION: Select first solid (A):"
  │
  ├── User clicks solid A  →  setEntity(solidA)
  │   step = 1
  │   Prompt: "UNION: Select second solid (B) [U=undo]:"
  │
  ├── User clicks solid B  →  setEntity(solidB)
  │   step = 2
  │   Prompt: "UNION: Press Enter to confirm, U to re-select:"
  │
  └── User presses Enter   →  onInput('', newId, ...)
        │
        └── executeBooleanOp(newId, doc)
              │
              ├── occService.createBoolean('fuse', idA, idB, newId, deflection)
              │     │
              │     └── OCCWorkerClient.send('createBoolean', ...)
              │           │
              │           └── OCCWorker:
              │                 shapeA = shapeCache.get(idA)   ← BREP from when
              │                 shapeB = shapeCache.get(idB)      solid was created
              │                 builder = BRepAlgoAPI_Fuse_3(shapeA, shapeB)
              │                 builder.Build()
              │                 resultShape = builder.Shape()
              │                 shapeCache.set(newId, resultShape)
              │                 geometryData = shapeToBufferGeometryData(resultShape)
              │                 postMessage({ type:'result', data: geometryData })
              │
              ├── new Solid3D(newId, positions, indices)   → added to document
              │
              ├── { action:'delete', ids:[idA, idB] }     → source solids removed
              │
              └── occService.releaseShapes([idA, idB])    → free WASM heap


SUBTRACT (cut):   shapeA − shapeB   (B is subtracted from A)
  → BRepAlgoAPI_Cut_3(shapeA, shapeB)
  → Order matters: A is the base, B is the tool

INTERSECT (common):  A ∩ B   (only the overlapping volume)
  → BRepAlgoAPI_Common_3(shapeA, shapeB)
  → Returns empty shape if solids don't intersect
```

---

## 8. Error cases to handle

```
CASE 1 — Shape not cached (session restart or unsaved solid):
  Worker throws: "Shape not cached for solid A"
  Command returns: "Error: Re-create the solid in this session to use booleans."
  Reason: The WASM heap is per browser session. If the page reloads, all cached
          shapes are lost even if the document still shows the solid's mesh.
  Fix:    On document load, grey out boolean commands until both target solids
          have been re-created in OCC (i.e., are present in shapeCache).
          OR store BREP in BRep_Builder → serialize to BREP string → re-load.

CASE 2 — Shapes do not intersect (Cut/Common):
  OCC returns an empty shape or a shape with zero volume.
  Command returns: "Boolean SUBTRACT/INTERSECT produced no result — 
                   solids may not overlap."
  Check: resultShape.IsNull() || ShapeVolume(resultShape) < EPSILON

CASE 3 — Same solid selected twice:
  setEntity() checks entity.id == solidAId and silently ignores the duplicate.

CASE 4 — Non-solid selected (line, polyline, text):
  setEntity() checks instanceof Solid3D and returns early.

CASE 5 — Boolean result is non-manifold (degenerate):
  boolBuilder.IsDone() returns false, or BRepCheck_Analyzer reports errors.
  Command returns the OCC error message string.
  Optional: run BRepCheck_Analyzer(resultShape) and report specific issue.
```

---

## 9. Optional: BRepCheck validation before tessellation

```
// In OCCWorker createBoolean handler, after getting resultShape:

FUNCTION validateShape(shape: TopoDS_Shape) -> string | null:
  analyzer = new oc.BRepCheck_Analyzer(shape, true)
  IF analyzer.IsValid():
    RETURN null
  ELSE:
    // Collect error info from the analyzer (simplified)
    RETURN "Resulting shape is not valid — boolean operation may be degenerate"

// Usage:
resultShape = boolBuilder.Shape()
err = validateShape(resultShape)
IF err:
  boolBuilder.delete()
  THROW Error(err)
```
