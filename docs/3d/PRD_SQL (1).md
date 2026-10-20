# PRD_SQL — WebCAD Persistence & Cache Layer (v2)
**Author:** Product / Claude  
**Assignee:** Antigravity  
**Updated after source audit of current src.zip**

---

## Audit: What's Already Done ✅

Do not re-implement any of the following — they are complete and correct.

| Area | Files | Status |
|---|---|---|
| OCC shape cache | `OCCWorker.ts` — `shapeCache Map`, `cacheShape()`, `releaseShape()` | ✅ Done |
| entityId on all primitives | All `create*` handlers — Box, Cylinder, Sphere, Cone, Torus, Extrude, Revolve | ✅ Done |
| `createBoolean` | Full pipeline Worker → Client → Service | ✅ Done |
| `transformShape` | Worker + Client + Service | ✅ Done |
| `releaseShapes` | Worker + Client + Service | ✅ Done |
| `creationParams` on Solid3D | Field defined; set in BoxCommand, CylinderCommand, ExtrudeCommand; serialized in DXF export/import | ✅ Done |
| `rebuildWorkerCache` | `IOHandler.ts` — re-runs OCC for box/cylinder/extrude after DXF load | ✅ Partial (see Bug 1) |
| Gizmo system | `GizmoController`, `GizmoManager`, `GizmoRenderer` | ✅ Done |
| 3D selection | `Selection3DEngine` — raycast, cycling, window/crossing | ✅ Done |
| Boolean command + handler | `BooleanCommand`, `BooleanHandler` | ✅ Done |
| `Solid3D.position / rotation` | Extended model | ✅ Done |
| isClosed extrude/revolve fix | `ExtrudeCommand`, `RevolveCommand` | ✅ Done |

---

## Bugs to Fix First

Fix these before starting the persistence layer — they affect data correctness.

---

### Bug 1 — `creationParams` missing for Sphere, Cone, Torus, Revolve

`IOHandler.rebuildWorkerCache` handles only `box`, `cylinder`, `extrude`. The other four primitive commands never set `creationParams`, so their shapes are never rebuilt after a DXF load and boolean ops fail silently.

**Fix A — set `creationParams` in the missing commands:**

```typescript
// SphereCommand.ts — after: const solid = new Solid3D(id, positions, indices)
solid.creationParams = {
  type: 'sphere',
  params: { x: center.x, y: center.y, z: elevation, r: radius }
}

// ConeCommand.ts
solid.creationParams = {
  type: 'cone',
  params: { x: center.x, y: center.y, z: elevation, r: radius, h: height }
}

// TorusCommand.ts
solid.creationParams = {
  type: 'torus',
  params: { x: center.x, y: center.y, z: elevation, r1, r2 }
}

// RevolveCommand.ts
solid.creationParams = {
  type: 'revolve',
  params: { points, axisPoint: this.axisPt1, axisDir, angle: this.angle,
            thickness: this.thickness, isClosed }
}
```

**Fix B — extend `rebuildWorkerCache` in `IOHandler.ts`:**

```typescript
} else if (type === 'sphere') {
  await occService.createSphere(params.x, params.y, params.z, params.r, deflection, entity.id);

} else if (type === 'cone') {
  await occService.createCone(params.x, params.y, params.z, params.r, params.h, deflection, entity.id);

} else if (type === 'torus') {
  await occService.createTorus(params.x, params.y, params.z, params.r1, params.r2, deflection, entity.id);

} else if (type === 'revolve') {
  await occService.createRevolve(
    params.points, params.axisPoint, params.axisDir,
    params.angle, params.thickness, deflection, params.isClosed, entity.id
  );
```

---

### Bug 2 — Boolean result solids cannot be rebuilt after reload

After UNION/SUBTRACT/INTERSECT the result `Solid3D` has no `creationParams`. After a DXF save/reload, `rebuildWorkerCache` skips it, `shapeCache` has no entry, and any subsequent boolean on that solid throws "Shape not cached".

**Fix:** `exportBRep` / `importBRep` (see Section 3). BREP serialization is the only way to persist and restore the topology of a boolean result.

---

### Bug 3 — `GizmoManager` accesses private field via bracket notation

```typescript
// Current — fragile:
const deltaPos = this.renderer.root.position.clone().sub(this.controller["dragStartPos"]);
```

**Fix — add a public getter to `GizmoController.ts`:**

```typescript
public get startPos(): THREE.Vector3 {
  return this.dragStartPos;
}
```

**Then in `GizmoManager.onPointerMove`:**

```typescript
const deltaPos = this.renderer.root.position.clone().sub(this.controller.startPos);
```

---

### Bug 4 — `Document.idCounters` is private; cannot be saved/restored

Without restoring `idCounters`, after a reload `doc.getNextId('BOX')` returns `BOX1` again and silently overwrites the existing `BOX1` entity.

**Fix — add two methods to `Document.ts`:**

```typescript
getIdCounters(): Record<string, number> {
  const out: Record<string, number> = {};
  this.idCounters.forEach((v, k) => { out[k] = v; });
  return out;
}

restoreIdCounters(counters: Record<string, number>): void {
  this.idCounters = new Map(Object.entries(counters));
}
```

---

### Bug 5 — `creationParams` for `extrude` is missing `isClosed`

```typescript
// Current (ExtrudeCommand.ts):
solid.creationParams = { type: 'extrude', params: { points, height, thickness } }

// Fix:
solid.creationParams = { type: 'extrude', params: { points, height, thickness, isClosed } }
```

---

## Section 1: New Files to Create

```
src/
└── core/
    └── persistence/
        ├── schemas.ts              ← RxDB JSON schemas only, no logic
        ├── DatabaseService.ts      ← RxDB init, collections, CRUD
        ├── ShapeCacheDB.ts         ← SQLite WASM: tessellation + BREP blobs
        ├── EntitySerializer.ts     ← Entity ↔ JSON row conversion
        └── PersistenceService.ts   ← Public API: save/load/autosave/list
```

---

## Section 2: Install Packages + Vite Config

```bash
npm install rxdb
npm install dexie
npm install @sqlite.org/sqlite-wasm
npm install uuid
npm install --save-dev @types/uuid
```

**`vite.config.ts`** — OPFS requires these headers or `ShapeCacheDB` silently falls back to `:memory:`:

```typescript
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})
```

---

## Section 3: OCCWorker — Add `exportBRep` and `importBRep`

Add these two handlers to `OCCWorker.ts` after the existing `releaseShapes` block.

```typescript
} else if (type === 'exportBRep') {
  const { entityId } = payload;
  try {
    const shape = shapeCache.get(entityId);
    if (!shape) {
      self.postMessage({ type: 'exportBRep', success: false,
        error: `No cached shape for entityId: ${entityId}`, id });
      return;
    }
    // BRep_Tools::Write serialises topology to a string.
    // Check your opencascade.js version for the exact binding name —
    // it may be BRepTools_1 or BRepTools_2. Inspect oc.BRepTools in browser console.
    const writer = new oc.BRepTools_2();
    const brepStr: string = writer.Write_2(shape);
    const brepBytes = new TextEncoder().encode(brepStr);
    self.postMessage(
      { type: 'exportBRep', success: true, id, data: brepBytes },
      [brepBytes.buffer]    // transferable — zero copy to main thread
    );
  } catch (err: any) {
    self.postMessage({ type: 'exportBRep', success: false, error: err.message, id });
  }

} else if (type === 'importBRep') {
  const { entityId, brepBytes } = payload;
  try {
    const brepStr = new TextDecoder().decode(new Uint8Array(brepBytes));
    const shape   = new oc.TopoDS_Shape_1();
    const builder = new oc.BRep_Builder();
    // BRepTools::Read fills shape from the serialized string
    new oc.BRepTools_2().Read_2(builder, shape, brepStr);
    cacheShape(entityId, shape);    // now available for boolean ops
    self.postMessage({ type: 'importBRep', success: true, id, data: { ok: true } });
  } catch (err: any) {
    self.postMessage({ type: 'importBRep', success: false, error: err.message, id });
  }
}
```

**Add to `OCCWorkerClient.ts`:**

```typescript
exportBRep(entityId: string): Promise<Uint8Array> {
  return this.send('exportBRep', { entityId });
}

importBRep(entityId: string, brepBytes: Uint8Array): Promise<{ ok: boolean }> {
  // Pass brepBytes.buffer as transferable so the worker receives it without copying.
  // If your send() doesn't support a transfer list yet, add it:
  //   this.worker.postMessage({ type, payload, id }, [brepBytes.buffer])
  return this.send('importBRep', { entityId, brepBytes }, [brepBytes.buffer]);
}
```

> If `send()` in `OCCWorkerClient.ts` doesn't accept a third `transfer: Transferable[]` argument yet, add it:
> ```typescript
> private send(type: string, payload: any, transfer: Transferable[] = []): Promise<any> {
>   return new Promise((resolve, reject) => {
>     const id = this.generateId();
>     this.pending.set(id, { resolve, reject });
>     this.worker.postMessage({ type, payload, id }, transfer);
>   });
> }
> ```

**Add to `OpenCascadeService.ts`:**

```typescript
async exportBRep(entityId: string): Promise<Uint8Array> {
  return this.client.exportBRep(entityId);
}

async importBRep(entityId: string, brepBytes: Uint8Array): Promise<void> {
  await this.client.importBRep(entityId, brepBytes);
}
```

---

## Section 4: `schemas.ts`

```typescript
import { RxJsonSchema } from 'rxdb'

export const PROJECT_SCHEMA: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:        { type: 'string', maxLength: 100 },
    name:      { type: 'string' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    settings: {
      type: 'object',
      properties: {
        units:            { type: 'object' },
        facetres:         { type: 'number' },
        dimtoh:           { type: 'boolean' },
        dimtad:           { type: 'boolean' },
        currentLayer:     { type: 'string' },
        currentElevation: { type: 'number' },
        currentThickness: { type: 'number' },
        idCounters:       { type: 'object' }    // Record<string,number> — Bug 4 fix
      }
    }
  },
  required: ['id', 'name', 'createdAt', 'updatedAt', 'settings']
}

export const ENTITY_SCHEMA: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:             { type: 'string', maxLength: 100 },
    projectId:      { type: 'string', maxLength: 100 },
    type:           { type: 'string' },
    layer:          { type: 'string' },
    elevation:      { type: 'number' },
    thickness:      { type: 'number' },
    data:           { type: 'string' },        // JSON — entity-specific fields
    properties:     { type: 'string' },        // JSON — Entity.properties bag
    creationParams: { type: 'string' },        // JSON — Solid3D.creationParams or ''
    updatedAt:      { type: 'number' }
  },
  required: ['id', 'projectId', 'type', 'data'],
  indexes: ['projectId', ['projectId', 'updatedAt']]
}

export const LAYER_SCHEMA: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',                             // composite: `${projectId}::${name}`
  type: 'object',
  properties: {
    id:         { type: 'string', maxLength: 200 },
    projectId:  { type: 'string', maxLength: 100 },
    name:       { type: 'string' },
    color:      { type: 'number' },
    linetype:   { type: 'string' },
    lineWeight: { type: 'number' },
    isVisible:  { type: 'boolean' },
    isFrozen:   { type: 'boolean' },
    isLocked:   { type: 'boolean' }
  },
  required: ['id', 'projectId', 'name'],
  indexes: ['projectId']
}
```

---

## Section 5: `DatabaseService.ts`

```typescript
import { createRxDatabase, RxDatabase, RxCollection } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { PROJECT_SCHEMA, ENTITY_SCHEMA, LAYER_SCHEMA } from './schemas'

export class DatabaseService {
  private static instance: DatabaseService
  private db!: RxDatabase
  projects!: RxCollection
  entities!: RxCollection
  layers!:   RxCollection

  static getInstance(): DatabaseService {
    if (!this.instance) this.instance = new DatabaseService()
    return this.instance
  }

  async init(): Promise<void> {
    this.db = await createRxDatabase({ name: 'webcad', storage: getRxStorageDexie() })
    await this.db.addCollections({
      projects: { schema: PROJECT_SCHEMA },
      entities: { schema: ENTITY_SCHEMA  },
      layers:   { schema: LAYER_SCHEMA   }
    })
    this.projects = this.db.projects
    this.entities = this.db.entities
    this.layers   = this.db.layers
  }

  // Projects
  async upsertProject(row: object): Promise<void> { await this.projects.upsert(row) }
  async getProject(id: string): Promise<any> {
    return (await this.projects.findOne(id).exec())?.toJSON() ?? null
  }
  async listProjects(): Promise<any[]> {
    return (await this.projects.find({ sort: [{ updatedAt: 'desc' }] }).exec()).map(d => d.toJSON())
  }
  async deleteProject(id: string): Promise<void> {
    await this.projects.findOne(id).remove()
    await this.entities.find({ selector: { projectId: id } }).remove()
    await this.layers.find({ selector: { projectId: id } }).remove()
  }

  // Entities
  async bulkUpsertEntities(rows: object[]): Promise<void> { await this.entities.bulkUpsert(rows) }
  async getEntitiesForProject(pid: string): Promise<any[]> {
    return (await this.entities.find({ selector: { projectId: pid } }).exec()).map(d => d.toJSON())
  }
  async deleteEntity(id: string): Promise<void> { await this.entities.findOne(id).remove() }

  // Layers
  async bulkUpsertLayers(rows: object[]): Promise<void> { await this.layers.bulkUpsert(rows) }
  async getLayersForProject(pid: string): Promise<any[]> {
    return (await this.layers.find({ selector: { projectId: pid } }).exec()).map(d => d.toJSON())
  }

  // Reactive observable for FileToolWindow
  projects$() { return this.projects.find({ sort: [{ updatedAt: 'desc' }] }).$ }
}
```

---

## Section 6: `ShapeCacheDB.ts`

```typescript
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

export class ShapeCacheDB {
  private static instance: ShapeCacheDB
  private db: any = null

  static getInstance(): ShapeCacheDB {
    if (!this.instance) this.instance = new ShapeCacheDB()
    return this.instance
  }

  async init(): Promise<void> {
    const sqlite3 = await sqlite3InitModule({ print: console.log, printErr: console.error })
    if (sqlite3.capi.sqlite3_vfs_find('opfs')) {
      this.db = new sqlite3.oo1.OpfsDb('/webcad-cache.db')
    } else {
      console.warn('[ShapeCacheDB] OPFS unavailable — falling back to in-memory (data will not persist)')
      this.db = new sqlite3.oo1.DB(':memory:')
    }
    this.createSchema()
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tessellation_cache (
        entity_id   TEXT NOT NULL,
        project_id  TEXT NOT NULL,
        positions   BLOB NOT NULL,
        indices     BLOB NOT NULL,
        deflection  REAL NOT NULL,
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (entity_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS brep_cache (
        entity_id   TEXT NOT NULL,
        project_id  TEXT NOT NULL,
        brep_data   BLOB NOT NULL,
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (entity_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS file_history (
        project_id   TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        last_opened  INTEGER NOT NULL,
        thumbnail    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tess ON tessellation_cache(project_id);
      CREATE INDEX IF NOT EXISTS idx_brep ON brep_cache(project_id);
    `)
  }

  // Tessellation
  saveTessellation(eid: string, pid: string, positions: number[], indices: number[], deflection: number): void {
    this.db.exec({ sql: `INSERT OR REPLACE INTO tessellation_cache VALUES (?,?,?,?,?,?)`,
      bind: [eid, pid, new Uint8Array(new Float32Array(positions).buffer),
             new Uint8Array(new Uint32Array(indices).buffer), deflection, Date.now()] })
  }
  loadTessellation(eid: string, pid: string): { positions: number[], indices: number[], deflection: number } | null {
    const rows = this.db.exec({ sql: `SELECT positions,indices,deflection FROM tessellation_cache WHERE entity_id=? AND project_id=?`,
      bind: [eid, pid], returnValue: 'resultRows', rowMode: 'array' })
    if (!rows.length) return null
    const [p, i, d] = rows[0]
    return { positions: Array.from(new Float32Array(p.buffer)), indices: Array.from(new Uint32Array(i.buffer)), deflection: d }
  }
  deleteTessellation(eid: string, pid: string): void {
    this.db.exec({ sql: 'DELETE FROM tessellation_cache WHERE entity_id=? AND project_id=?', bind: [eid, pid] })
  }

  // BREP
  saveBRep(eid: string, pid: string, brepBytes: Uint8Array): void {
    this.db.exec({ sql: `INSERT OR REPLACE INTO brep_cache VALUES (?,?,?,?)`,
      bind: [eid, pid, brepBytes, Date.now()] })
  }
  loadBRep(eid: string, pid: string): Uint8Array | null {
    const rows = this.db.exec({ sql: `SELECT brep_data FROM brep_cache WHERE entity_id=? AND project_id=?`,
      bind: [eid, pid], returnValue: 'resultRows', rowMode: 'array' })
    return rows.length ? rows[0][0] : null
  }
  deleteBRep(eid: string, pid: string): void {
    this.db.exec({ sql: 'DELETE FROM brep_cache WHERE entity_id=? AND project_id=?', bind: [eid, pid] })
  }

  // File history
  upsertHistory(pid: string, name: string, thumbnail?: string): void {
    this.db.exec({ sql: `INSERT OR REPLACE INTO file_history VALUES (?,?,?,?)`,
      bind: [pid, name, Date.now(), thumbnail ?? null] })
  }
  getHistory(): any[] {
    return this.db.exec({ sql: 'SELECT project_id,name,last_opened,thumbnail FROM file_history ORDER BY last_opened DESC LIMIT 20',
      returnValue: 'resultRows', rowMode: 'object' })
  }
  deleteHistory(pid: string): void {
    this.db.exec({ sql: 'DELETE FROM file_history WHERE project_id=?', bind: [pid] })
  }

  // Bulk clear
  clearProject(pid: string): void {
    this.db.exec('BEGIN')
    try {
      this.db.exec({ sql: 'DELETE FROM tessellation_cache WHERE project_id=?', bind: [pid] })
      this.db.exec({ sql: 'DELETE FROM brep_cache WHERE project_id=?',         bind: [pid] })
      this.db.exec('COMMIT')
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
}
```

---

## Section 7: `EntitySerializer.ts`

```typescript
import { Entity } from '../model/Entity'
import { Line } from '../model/Line'
import { Polyline } from '../model/Polyline'
import { Circle } from '../model/Circle'
import { Arc } from '../model/Arc'
import { Ellipse } from '../model/Ellipse'
import { Spline } from '../model/Spline'
import { Text } from '../model/Text'
import { MText } from '../model/MText'
import { Dimension } from '../model/Dimension'
import { Hatch } from '../model/Hatch'
import { Insert } from '../model/Insert'
import { Donut } from '../model/Donut'
import { Solid } from '../model/Solid'
import { Trace } from '../model/Trace'
import { Note } from '../model/Note'
import { Point } from '../model/Point'
import { Solid3D } from '../model/Solid3D'

export class EntitySerializer {

  static serialize(entity: Entity, projectId: string): object {
    const cp = (entity as any).creationParams
    return {
      id:             entity.id,
      projectId,
      type:           entity.constructor.name,
      layer:          entity.layer,
      elevation:      entity.elevation,
      thickness:      entity.thickness,
      data:           JSON.stringify(this.serializeData(entity)),
      properties:     JSON.stringify(entity.properties ?? {}),
      creationParams: cp ? JSON.stringify(cp) : '',
      updatedAt:      Date.now()
    }
  }

  private static serializeData(e: Entity): object {
    if (e instanceof Line)      return { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }
    if (e instanceof Polyline)  return { vertices: e.vertices, closed: e.closed }
    if (e instanceof Circle)    return { cx: e.cx, cy: e.cy, r: e.r }
    if (e instanceof Arc)       return { cx: e.cx, cy: e.cy, r: e.r, startAngle: e.startAngle, endAngle: e.endAngle }
    if (e instanceof Ellipse)   return { cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, rotation: e.rotation }
    if (e instanceof Spline)    return { controlPoints: e.controlPoints, degree: e.degree,
                                         isClosed: e.isClosed, knots: e.knots, sampledPoints: e.sampledPoints }
    if (e instanceof Text)      return { x: e.x, y: e.y, text: e.text, height: e.height,
                                         rotation: e.rotation, style: e.style, justify: (e as any).justify }
    if (e instanceof MText)     return { x: e.x, y: e.y, text: e.text, height: e.height,
                                         rotation: e.rotation, width: (e as any).width, attachPoint: (e as any).attachPoint }
    if (e instanceof Dimension) return { dimType: (e as any).dimType, points: (e as any).points, text: (e as any).text }
    if (e instanceof Hatch)     return { boundaries: (e as any).boundaries, pattern: (e as any).pattern,
                                         scale: (e as any).scale, angle: (e as any).angle, isSolid: (e as any).isSolid }
    if (e instanceof Insert)    return { blockName: (e as any).blockName, x: (e as any).x, y: (e as any).y,
                                         xScale: (e as any).xScale, yScale: (e as any).yScale, rotation: (e as any).rotation }
    if (e instanceof Donut)     return { cx: (e as any).cx, cy: (e as any).cy,
                                         innerR: (e as any).innerR, outerR: (e as any).outerR }
    if (e instanceof Solid)     return { points: (e as any).points }
    if (e instanceof Trace)     return { points: (e as any).points }
    if (e instanceof Note)      return { x: (e as any).x, y: (e as any).y, text: (e as any).text,
                                         width: (e as any).width, height: (e as any).height }
    if (e instanceof Point)     return { x: (e as any).x, y: (e as any).y }
    if (e instanceof Solid3D)
      // Geometry is in tessellation_cache — store only counts + transform
      return { positionCount: e.positions.length, indexCount: e.indices.length,
               position: e.position, rotation: e.rotation }
    return {}
  }

  static deserialize(row: any): Entity {
    const d = JSON.parse(row.data)
    let entity: Entity

    switch (row.type) {
      case 'Line':      entity = new Line(row.id, d.x1, d.y1, d.x2, d.y2); break
      case 'Polyline':  entity = new Polyline(row.id, d.vertices, d.closed, row.elevation, row.thickness); break
      case 'Circle':    entity = new Circle(row.id, d.cx, d.cy, d.r); break
      case 'Arc':       entity = new Arc(row.id, d.cx, d.cy, d.r, d.startAngle, d.endAngle); break
      case 'Ellipse':   entity = new Ellipse(row.id, d.cx, d.cy, d.rx, d.ry, d.rotation); break
      case 'Spline': {
        const s = new Spline(row.id, d.controlPoints, d.degree, d.isClosed)
        s.knots = d.knots; s.sampledPoints = d.sampledPoints; entity = s; break
      }
      case 'Text':      entity = new Text(row.id, d.x, d.y, d.text, d.height, d.rotation, d.style); break
      case 'MText':     entity = new MText(row.id, d.x, d.y, d.text, d.height, d.rotation); break
      case 'Dimension': entity = new Dimension(row.id, d.dimType, d.points, d.text); break
      case 'Hatch':     entity = new Hatch(row.id, d.boundaries, d.pattern, d.scale, d.angle, d.isSolid); break
      case 'Insert':    entity = new Insert(row.id, d.blockName, d.x, d.y, d.xScale, d.yScale, d.rotation); break
      case 'Donut':     entity = new Donut(row.id, d.cx, d.cy, d.innerR, d.outerR); break
      case 'Solid':     entity = new Solid(row.id, d.points); break
      case 'Trace':     entity = new Trace(row.id, d.points); break
      case 'Note':      entity = new Note(row.id, d.x, d.y, d.text, d.width, d.height); break
      case 'Point':     entity = new Point(row.id, d.x, d.y); break
      case 'Solid3D': {
        const s3d = new Solid3D(row.id, [], [])   // geometry filled by PersistenceService
        if (d.position) s3d.position = d.position
        if (d.rotation) s3d.rotation = d.rotation
        entity = s3d; break
      }
      default: throw new Error(`Unknown entity type: ${row.type}`)
    }

    entity.layer     = row.layer
    entity.elevation = row.elevation
    entity.thickness = row.thickness
    entity.properties = JSON.parse(row.properties || '{}')
    if (row.type === 'Solid3D' && row.creationParams) {
      (entity as Solid3D).creationParams = JSON.parse(row.creationParams)
    }
    return entity
  }
}
```

---

## Section 8: `PersistenceService.ts`

```typescript
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from './DatabaseService'
import { ShapeCacheDB } from './ShapeCacheDB'
import { EntitySerializer } from './EntitySerializer'
import { IDocument } from '../model/Document'
import { Solid3D } from '../model/Solid3D'
import { OpenCascadeService } from '../io/OpenCascadeService'

export class PersistenceService {
  private static instance: PersistenceService
  private db    = DatabaseService.getInstance()
  private cache = ShapeCacheDB.getInstance()
  private occ   = OpenCascadeService.getInstance()

  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null

  public activeProjectId:   string | null = null
  public activeProjectName: string = 'Untitled'

  static getInstance(): PersistenceService {
    if (!this.instance) this.instance = new PersistenceService()
    return this.instance
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await this.db.init()
    await this.cache.init()
  }

  // ── New Project ───────────────────────────────────────────────────────────────

  async newProject(doc: IDocument): Promise<string> {
    const pid = uuidv4()
    this.activeProjectId   = pid
    this.activeProjectName = 'Untitled'
    await this.db.upsertProject({
      id: pid, name: 'Untitled',
      createdAt: Date.now(), updatedAt: Date.now(),
      settings: this.extractSettings(doc)
    })
    return pid
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async saveProject(doc: IDocument, name: string, thumbnail?: string): Promise<void> {
    if (!this.activeProjectId) return
    const pid = this.activeProjectId
    this.activeProjectName = name

    // 1. Project row
    const existing = await this.db.getProject(pid)
    await this.db.upsertProject({
      id: pid, name, updatedAt: Date.now(),
      createdAt: existing?.createdAt ?? Date.now(),
      settings: this.extractSettings(doc)
    })

    // 2. Entity rows — bulk upsert (one DB round-trip)
    const allEntities = doc.getAllEntities()
    await this.db.bulkUpsertEntities(allEntities.map(e => EntitySerializer.serialize(e, pid)))

    // 3. Solid3D caching
    const deflection = 0.1 / (doc.facetres ?? 5.0)
    for (const entity of allEntities) {
      if (!(entity instanceof Solid3D) || entity.positions.length === 0) continue

      // Tessellation cache — always write (enables fast render on load without re-running OCC)
      this.cache.saveTessellation(entity.id, pid, entity.positions, entity.indices, deflection)

      // BREP cache — only for boolean results (primitives use creationParams + re-run on load)
      if (!entity.creationParams) {
        try {
          const brepBytes = await this.occ.exportBRep(entity.id)
          if (brepBytes?.length) this.cache.saveBRep(entity.id, pid, brepBytes)
        } catch (err) {
          console.warn(`[PersistenceService] exportBRep failed for ${entity.id}:`, err)
        }
      }
    }

    // 4. Layer rows
    await this.db.bulkUpsertLayers(doc.layers.listLayers().map(l => ({
      id: `${pid}::${l.name}`, projectId: pid,
      name: l.name, color: l.color, linetype: l.linetype, lineWeight: l.lineWeight,
      isVisible: l.isVisible, isFrozen: l.isFrozen, isLocked: l.isLocked
    })))

    // 5. File history (includes thumbnail for project panel)
    this.cache.upsertHistory(pid, name, thumbnail)
  }

  // ── Load ─────────────────────────────────────────────────────────────────────

  async loadProject(projectId: string, doc: IDocument, app: any): Promise<void> {
    const pid     = projectId
    const project = await this.db.getProject(pid)
    if (!project) throw new Error(`Project ${pid} not found`)

    this.activeProjectId   = pid
    this.activeProjectName = project.name

    // 1. Apply document settings
    this.applySettings(doc, project.settings)

    // 2. Clear current document (entities, history, spatial index)
    doc.clear()

    // 3. Deserialize all entity rows
    const rows     = await this.db.getEntitiesForProject(pid)
    const entities = rows.map(row => {
      const entity = EntitySerializer.deserialize(row)
      // Fill Solid3D geometry from tessellation cache
      if (entity instanceof Solid3D) {
        const tess = this.cache.loadTessellation(entity.id, pid)
        if (tess) {
          entity.positions = tess.positions
          entity.indices   = tess.indices
        } else {
          console.warn(`[PersistenceService] No tessellation cache for Solid3D ${entity.id}`)
        }
      }
      return entity
    })

    // 4. Add entities to document (no history recording)
    for (const entity of entities) doc.addEntity(entity)

    // 5. Restore layers
    const layerRows = await this.db.getLayersForProject(pid)
    for (const lr of layerRows) {
      doc.layers.createLayer(lr.name, lr.color, lr.linetype, lr.lineWeight)
      const layer = doc.layers.getLayer(lr.name)!
      layer.isVisible = lr.isVisible
      layer.isFrozen  = lr.isFrozen
      layer.isLocked  = lr.isLocked
    }
    doc.layers.currentLayerName = project.settings.currentLayer ?? '0'

    // 6. Restore idCounters — prevents ID collision on next entity (Bug 4 fix)
    if (project.settings.idCounters) doc.restoreIdCounters(project.settings.idCounters)

    // 7. Rebuild OCC worker shape cache for all Solid3D:
    //    • Primitives (have creationParams) → re-run OCC (fast, exact geometry)
    //    • Boolean results (no creationParams) → importBRep from SQLite
    for (const entity of entities) {
      if (!(entity instanceof Solid3D)) continue
      if (entity.creationParams) {
        await this.rebuildFromCreationParams(entity, doc.facetres)
      } else {
        const brepBytes = this.cache.loadBRep(entity.id, pid)
        if (brepBytes) {
          await this.occ.importBRep(entity.id, brepBytes)
        } else {
          console.warn(`[PersistenceService] No BREP for ${entity.id} — boolean ops unavailable for this solid`)
        }
      }
    }

    // 8. Single re-render (do NOT call per-entity)
    app.syncFromDocument()

    // 9. Update file history timestamp
    this.cache.upsertHistory(pid, project.name)
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async deleteProject(projectId: string): Promise<void> {
    const rows = await this.db.getEntitiesForProject(projectId)
    const s3dIds = rows.filter(r => r.type === 'Solid3D').map(r => r.id)
    if (s3dIds.length) await this.occ.releaseShapes(s3dIds)

    await this.db.deleteProject(projectId)
    this.cache.clearProject(projectId)
    this.cache.deleteHistory(projectId)

    if (this.activeProjectId === projectId) {
      this.activeProjectId   = null
      this.activeProjectName = 'Untitled'
    }
  }

  // ── Per-entity erase ─────────────────────────────────────────────────────────

  async onEntityErased(entityId: string, entity: Entity): Promise<void> {
    if (!this.activeProjectId) return
    await this.db.deleteEntity(entityId)
    if (entity instanceof Solid3D) {
      this.cache.deleteTessellation(entityId, this.activeProjectId)
      this.cache.deleteBRep(entityId, this.activeProjectId)
      await this.occ.releaseShapes([entityId])
    }
  }

  // ── Auto-save ─────────────────────────────────────────────────────────────────

  scheduleAutoSave(doc: IDocument, getThumbnail?: () => string): void {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer)
    this.autoSaveTimer = setTimeout(async () => {
      await this.saveProject(doc, this.activeProjectName, getThumbnail?.())
      console.log(`[PersistenceService] Auto-saved "${this.activeProjectName}"`)
    }, 2000)
  }

  cancelAutoSave(): void {
    if (this.autoSaveTimer) { clearTimeout(this.autoSaveTimer); this.autoSaveTimer = null }
  }

  // ── List ──────────────────────────────────────────────────────────────────────

  async listProjects(): Promise<any[]> { return this.db.listProjects() }
  projects$()                          { return this.db.projects$() }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private extractSettings(doc: IDocument): object {
    return {
      units: doc.units, facetres: doc.facetres, dimtoh: doc.dimtoh, dimtad: doc.dimtad,
      currentLayer: doc.layers.currentLayerName,
      currentElevation: doc.currentElevation, currentThickness: doc.currentThickness,
      idCounters: (doc as any).getIdCounters()   // Bug 4 fix — new method on Document
    }
  }

  private applySettings(doc: IDocument, s: any): void {
    if (s.units)              doc.units            = s.units
    if (s.facetres != null)   doc.facetres         = s.facetres
    if (s.dimtoh   != null)   doc.dimtoh           = s.dimtoh
    if (s.dimtad   != null)   doc.dimtad           = s.dimtad
    if (s.currentElevation != null) doc.currentElevation = s.currentElevation
    if (s.currentThickness != null) doc.currentThickness = s.currentThickness
  }

  private async rebuildFromCreationParams(entity: Solid3D, facetres: number): Promise<void> {
    const { type, params } = entity.creationParams!
    const deflection = 0.1 / (facetres ?? 5.0)
    try {
      switch (type) {
        case 'box':      await this.occ.createBox(params.x, params.y, params.z, params.dx, params.dy, params.dz, deflection, entity.id); break
        case 'cylinder': await this.occ.createCylinder(params.x, params.y, params.z, params.radius, params.height, deflection, entity.id); break
        case 'sphere':   await this.occ.createSphere(params.x, params.y, params.z, params.r, deflection, entity.id); break
        case 'cone':     await this.occ.createCone(params.x, params.y, params.z, params.r, params.h, deflection, entity.id); break
        case 'torus':    await this.occ.createTorus(params.x, params.y, params.z, params.r1, params.r2, deflection, entity.id); break
        case 'extrude':  await this.occ.createExtrude(params.points, params.height, params.thickness, deflection, params.isClosed, entity.id); break
        case 'revolve':  await this.occ.createRevolve(params.points, params.axisPoint, params.axisDir, params.angle, params.thickness, deflection, params.isClosed, entity.id); break
        default: console.warn(`[PersistenceService] Unknown creationParams type: ${type}`)
      }
    } catch (err) {
      console.error(`[PersistenceService] Failed to rebuild cache for ${entity.id}:`, err)
    }
  }
}
```

---

## Section 9: `app.ts` Changes

```typescript
// Add import:
import { PersistenceService } from './core/persistence/PersistenceService'

// Add field to App class:
public persistence!: PersistenceService

// In App constructor or init(), after OCC service is ready:
this.persistence = PersistenceService.getInstance()
await this.persistence.init()
await this.persistence.newProject(this.doc)

// In addEntity() method, after this.doc.addEntity(entity):
this.persistence.scheduleAutoSave(
  this.doc,
  () => this.viewer.canvas.toDataURL('image/jpeg', 0.5)
)

// In the entity-erase flow, wherever doc.removeEntity(id) is called:
const entity = this.doc.getEntity(id)
this.doc.removeEntity(id)
if (entity) await this.persistence.onEntityErased(id, entity)
```

---

## Section 10: `FileToolWindow.ts` Changes

Replace the `alert('Save functionality not fully implemented yet.')` save button and the static DXF file list:

```typescript
// NEW button:
newBtn.onclick = async () => {
  if (!confirm('Clear current drawing?')) return
  this.app.doc.clear()
  await this.app.persistence.newProject(this.app.doc)
  this.app.syncFromDocument()
  this.renderProjectList()
}

// SAVE button:
saveBtn.onclick = async () => {
  let name = this.app.persistence.activeProjectName
  if (name === 'Untitled') {
    name = prompt('Project name:') ?? 'Untitled'
    this.app.persistence.activeProjectName = name
  }
  await this.app.persistence.saveProject(
    this.app.doc, name,
    this.app.viewer.canvas.toDataURL('image/jpeg', 0.5)
  )
}

// Project list (replaces static DXF table):
async renderProjectList() {
  const projects = await this.app.persistence.listProjects()
  tbody.innerHTML = ''
  projects.forEach(p => {
    const tr = document.createElement('tr')
    const date = new Date(p.updatedAt).toLocaleDateString()

    const tdName = document.createElement('td')
    tdName.textContent = p.name
    tdName.style.cursor = 'pointer'
    tdName.onclick = () => this.app.persistence.loadProject(p.id, this.app.doc, this.app)

    const tdDate = document.createElement('td')
    tdDate.textContent = date

    const tdDel  = document.createElement('td')
    const delBtn = document.createElement('button')
    delBtn.textContent = 'DEL'
    delBtn.onclick = async () => {
      if (!confirm(`Delete "${p.name}"?`)) return
      await this.app.persistence.deleteProject(p.id)
      this.renderProjectList()
    }
    tdDel.appendChild(delBtn)

    tr.append(tdName, tdDate, tdDel)
    tbody.appendChild(tr)
  })
}

// Call renderProjectList() in constructor after persistence.init() resolves
```

---

## Implementation Order

```
Step 1  Apply Bug fixes 1–5 (creationParams, private getter, idCounters, isClosed param)
Step 2  npm install packages + add vite.config.ts COOP/COEP headers
Step 3  Create schemas.ts
Step 4  Create DatabaseService.ts — verify RxDB opens in browser (check DevTools → IndexedDB)
Step 5  Create ShapeCacheDB.ts — verify OPFS: check browser console for fallback warning
Step 6  Create EntitySerializer.ts — unit-test serialize→deserialize round-trip for each entity type
Step 7  Add exportBRep / importBRep to OCCWorker, OCCWorkerClient, OpenCascadeService
Step 8  Create PersistenceService.ts
Step 9  Wire PersistenceService into app.ts
Step 10 Update FileToolWindow.ts
Step 11 Run AC1–AC10 manually
```

---

## Acceptance Criteria

| # | Test |
|---|---|
| AC1 | Draw polyline → wait 2s (auto-save) → refresh → open project → polyline appears |
| AC2 | Create Box → save → reload → box renders (geometry from tessellation_cache, not re-run OCC) |
| AC3 | Create two boxes → UNION → save → reload → union solid renders correctly |
| AC4 | After reload: SUBTRACT on reloaded UNION solid → no "Shape not cached" error |
| AC5 | File panel shows saved projects with names and dates |
| AC6 | NEW clears canvas; old project still in list |
| AC7 | DEL removes project from list; tessellation_cache rows gone (DevTools → Storage → OPFS) |
| AC8 | Erase Solid3D → its tessellation_cache and brep_cache rows deleted |
| AC9 | `doc.getNextId('BOX')` returns `BOX4` (not `BOX1`) after reloading a project with 3 boxes |
| AC10 | IMPORT DXF still works; Solid3Ds rebuild via creationParams (existing IOHandler logic unchanged) |
