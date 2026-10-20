Now let me read the truncated section too:I can see the full picture now. Here's the diagnosis and fix:

---

## Root Cause

The error `Export failed. [STEP] FS error` is thrown **inside your OCC worker's `exportBRep` handler**. It's failing because the worker is using `BRepTools.Write_4` (or `Write_2`) — the **file-path overload** — and the Emscripten virtual filesystem directory it's trying to write to **doesn't exist** at that path.

The flow that breaks:

```
createBox() → worker creates shape, stores in registry ✅
exportBRep() → worker tries Write_4(shape, "/some/path/id.brep") → FS error ❌
              (the directory "/some/path/" was never mkdir'd)
```

---

## Fix 1 — In the Worker (the real fix)

The worker's `exportBRep` handler almost certainly looks like this — replace the file-path write with an **in-memory stream**:

```typescript
// ❌ BROKEN — writes to FS path that may not exist
function exportBRep(entityId: string): Uint8Array {
  const shape = shapeRegistry[entityId];
  oc.BRepTools.Write_4(shape, `/brep/${entityId}.brep`);          // FS error here
  const bytes = oc.FS.readFile(`/brep/${entityId}.brep`);
  return bytes;
}

// ✅ FIX A — in-memory via Write_3 (no FS needed)
function exportBRep(entityId: string): Uint8Array {
  const shape = shapeRegistry[entityId];
  if (!shape) throw new Error(`Shape not found: ${entityId}`);

  // Write_3(shape, ostream) — no file path, no FS required
  const oStream = new oc.std.stringstream();
  oc.BRepTools.Write_3(shape, oStream);
  const brepString: string = oStream.str();
  oStream.delete();

  return new TextEncoder().encode(brepString);
}

// ✅ FIX B — if Write_3 isn't available, mkdir before Write_4
function exportBRep(entityId: string): Uint8Array {
  const shape = shapeRegistry[entityId];
  if (!shape) throw new Error(`Shape not found: ${entityId}`);

  // Ensure directory exists before writing
  try { oc.FS.mkdir('/brep'); } catch (_) { /* already exists */ }

  const path = `/brep/${entityId}.brep`;
  oc.BRepTools.Write_4(shape, path);
  const bytes = oc.FS.readFile(path);

  // Clean up to avoid FS bloat
  try { oc.FS.unlink(path); } catch (_) {}

  return bytes;
}
```

---

## Fix 2 — Eliminate the Separate `exportBRep` Call (architectural fix)

The cleaner fix is to have the worker return the BRep bytes **as part of the `createBox` response**, so you never need a second round-trip. This avoids the race condition and halves the worker calls. Change the service like this:

```typescript
// OpenCascadeService.ts

async createBox(
  x: number, y: number, z: number,
  dx: number, dy: number, dz: number,
  deflection?: number,
  entityId?: string
): Promise<THREE.BufferGeometry> {

  // Worker now returns brepBytes directly in the same response
  const data = await this.client.createBox(x, y, z, dx, dy, dz, deflection, entityId);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();

  // BRep now comes from createBox response, not a separate call
  geometry.userData = {
    faceMapping:   data.faceMapping,
    edgeLines:     data.edgeLines,
    brepSnapshot:  data.brepBytes ?? undefined,   // worker exports during creation
  };

  return geometry;
}
```

And in the worker's `createBox` handler, export BRep right after building the shape:

```typescript
// OCC Worker — createBox handler
function handleCreateBox(params) {
  const { x, y, z, dx, dy, dz, deflection, entityId } = params;

  const pt    = new oc.gp_Pnt_3(x, y, z);
  const maker = new oc.BRepPrimAPI_MakeBox_2(pt, dx, dy, dz);
  const shape = maker.Shape();
  maker.delete();
  pt.delete();

  // Store in registry
  if (entityId) shapeRegistry[entityId] = shape;

  // Tessellate
  const mesh = new oc.BRepMesh_IncrementalMesh_2(shape, deflection ?? 0.1, false, 0.5, false);
  mesh.delete();

  const { positions, indices, faceMapping, edgeLines } = extractMeshData(shape);

  // ✅ Export BRep inline — no separate worker call needed
  let brepBytes: Uint8Array | null = null;
  if (entityId) {
    try {
      const oStream = new oc.std.stringstream();
      oc.BRepTools.Write_3(shape, oStream);
      brepBytes = new TextEncoder().encode(oStream.str());
      oStream.delete();
    } catch (e) {
      console.warn('[Worker] BRep export failed during createBox:', e);
    }
  }

  return { positions, indices, faceMapping, edgeLines, brepBytes };
}
```

---

## Fix 3 — Service-side helper to DRY up the repeated pattern

While you're at it, every method in your service has the same 20-line copy-paste block. Extract it:

```typescript
// OpenCascadeService.ts

private buildGeometry(
  data: { positions: number[]; indices: number[]; faceMapping: any; edgeLines: any; brepBytes?: Uint8Array | null }
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.userData = {
    faceMapping:  data.faceMapping,
    edgeLines:    data.edgeLines,
    brepSnapshot: data.brepBytes ?? undefined,
  };
  return geometry;
}

// Now every method becomes 2 lines:
async createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
  return this.buildGeometry(await this.client.createBox(x, y, z, dx, dy, dz, deflection, entityId));
}

async createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
  return this.buildGeometry(await this.client.createCylinder(x, y, z, r, h, deflection, entityId));
}

async createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
  return this.buildGeometry(await this.client.createSphere(x, y, z, r, deflection, entityId));
}

// ... all other shapes follow the same pattern
```

---

## Summary

| Problem | Location | Fix |
|---|---|---|
| `FS error` on write | OCC Worker `exportBRep` | Use `BRepTools.Write_3` (in-memory stream) instead of `Write_4` (file path) |
| Missing FS directory | OCC Worker | `oc.FS.mkdir('/brep')` before `Write_4`, or switch to `Write_3` |
| Two worker round-trips per shape | Service + Worker | Return `brepBytes` from `createBox` directly, remove separate `exportBRep` call |
| Massive copy-paste | Service | Extract `buildGeometry()` helper |