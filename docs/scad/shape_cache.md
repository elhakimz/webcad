shape_cache


Your caching architecture—using OPFS SQLite (`ShapeCacheDB.ts`) and RxDB Dexie fallback (`DatabaseService.ts`)—is actually brilliant. It is the absolute fastest way to persist data in the browser.

However, the bottleneck is **not** the database. The bottleneck is **how you are generating the byte payload to put into the database**.

If you look at your `OCCWorker.ts`, at the end of every single geometric operation (`createBox`, `createExtrude`, `createBoolean`), you do this:

```typescript
const brepBytes = exportShapeToBytes(oc, resultShape, entityId);

```

And inside `exportShapeToBytes`, you are using `STEPControl_Writer`.

### The STEP Translation Trap

You are using a **STEP file** as your internal cache format.
STEP (ISO 10303) is an exchange format. To create a STEP file, OpenCASCADE must traverse its entire internal memory tree, map its B-Rep geometry to ISO standard definitions, generate a massive ASCII text file, write it to the Emscripten Virtual File System (VFS), and then read it back out.

Doing this translation every time a shape changes just to get a cacheable snapshot takes a massive amount of CPU time, especially on complex booleans or lofts.

### The Fix: Use Native B-Rep for Caching

OpenCASCADE has its own internal serialization format (`BRepTools`). It does no translation; it simply dumps the exact C++ memory layout of the shape to a byte array. It is exponentially faster than generating a STEP file.

You should use **Native B-Rep** for your `ShapeCacheDB`, and only use `STEPControl_Writer` when the user explicitly clicks an "Export" button to download a file.

Here is exactly how to replace the serialization in your worker to instantly remove that lag:

#### 1. Add the Native Export function to `OCCWorker.ts`

Replace your calls to `exportShapeToBytes` (for caching purposes) with this:

```typescript
function exportShapeToNativeBRep(oc: any, shape: any, entityId: string): Uint8Array | undefined {
  if (!oc || !shape || shape.IsNull()) return undefined;
  
  const path = `/cache_${entityId}.brep`;
  try {
    // Write native OCCT internal format (NO STEP translation overhead)
    let success = false;
    
    // Depending on your opencascade.js build, the overload suffix might vary
    if (oc.BRepTools.Write_2) {
      success = oc.BRepTools.Write_2(shape, path);
    } else if (oc.BRepTools.Write_1) {
      success = oc.BRepTools.Write_1(shape, path);
    } else {
      success = oc.BRepTools.Write(shape, path);
    }

    if (success) {
      const bytes = oc.FS.readFile(path) as Uint8Array;
      try { oc.FS.unlink(path); } catch (_) { }
      return bytes;
    } else {
      throw new Error("BRepTools.Write returned false");
    }
  } catch (e: any) {
    self.postMessage({ type: 'log', message: `[Worker] Native BREP export failed for ${entityId}: ${e.message}` });
  }

  return undefined;
}

```

#### 2. Add the Native Import function

When pulling bytes out of your `ShapeCacheDB`, you need to read the native format instead of using `STEPControl_Reader`.

```typescript
function importShapeFromNativeBRep(oc: any, entityId: string, bytes: Uint8Array): any {
  const path = `/imp_${entityId}.brep`;
  try { oc.FS.unlink(path); } catch (_) { }
  oc.FS.writeFile(path, new Uint8Array(bytes));

  try {
    const shape = new oc.TopoDS_Shape();
    const builder = new oc.BRep_Builder();
    
    let success = false;
    if (oc.BRepTools.Read_2) {
      success = oc.BRepTools.Read_2(shape, path, builder);
    } else if (oc.BRepTools.Read_1) {
      success = oc.BRepTools.Read_1(shape, path, builder);
    } else {
      success = oc.BRepTools.Read(shape, path, builder);
    }

    try { oc.FS.unlink(path); } catch (_) { }

    if (!success || shape.IsNull()) {
      throw new Error(`Native BREP read failed or produced null shape for ${entityId}`);
    }

    return shape;
  } catch (e: any) {
    try { oc.FS.unlink(path); } catch (_) { }
    throw e;
  }
}

```

#### 3. Update your Worker handlers

Anywhere in your worker that previously generated the cache payload:

```typescript
// CHANGE THIS:
// const brepBytes = exportShapeToBytes(oc, resultShape, entityId);

// TO THIS:
const brepBytes = exportShapeToNativeBRep(oc, resultShape, entityId);

```

And inside your `importBRep` handler in the worker:

```typescript
// CHANGE THIS:
// const shape = importShapeFromBytes(oc, entityId, brepBytes); 

// TO THIS:
const shape = importShapeFromNativeBRep(oc, entityId, brepBytes);

```

### Why this changes everything

By switching to `BRepTools`, the worker no longer performs expensive ISO 10303 structural mapping for every single operation.

If a user drags a translation gizmo and fires 5 transformations before releasing the mouse, the worker can dump the native memory to the cache DB almost instantly, keeping the `postMessage` pipeline clear and ensuring your application remains responsive.