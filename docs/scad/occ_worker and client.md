occ_worker and client

Looking at your `OCCWorker.ts` and `OCCWorkerClient.ts`, your architecture is fundamentally excellent. Your `originalPostMessage` interceptor that maps `Float32Array` buffers to `Transferable` objects is exactly how you achieve zero-copy memory transfers between the Worker and the Main thread.

However, looking closely at the worker logic, I found the exact reasons why your engine is still lagging. You have introduced a massive Virtual File System (VFS) bottleneck and a re-meshing trap.

Here is how to fix the performance immediately.

### 1. The VFS Serialization Bottleneck (Critical)

In almost every shape creation and modification block (`createBox`, `createBoolean`, `rotateShape`, etc.), you are calling this:

```typescript
// Inside your worker commands:
const brepBytes = exportShapeToBytes(oc, resultShape, entityId || "temp");

```

If we look at `exportShapeToBytes`, it creates a `STEPControl_Writer`, translates the shape, **writes a physical STEP file to the Emscripten Virtual File System (`/exp.step`)**, reads that file back into a JavaScript `Uint8Array`, and then deletes the file.

Writing and reading a STEP file to disk (even a virtual memory disk) on *every single geometric operation* is incredibly expensive. If you make a quick boolean cut, the worker spends 10% of its time doing the math and 90% of its time translating and serializing a STEP file.

* **The Fix:** Remove `exportShapeToBytes` from your standard operations. Only generate STEP bytes when the user explicitly clicks a "Download STEP" button (using your existing `exportBRep` case).
* **Need State Persistence?** If you are generating `brepBytes` on every step so you can cache the model for an Undo/Redo stack, do not use STEP. Use OpenCASCADE's native BREP format, which is vastly faster. You can serialize it directly to a string in memory without touching the VFS using `BRepTools.Write`.

### 2. The Gizmo Dragging / Re-meshing Trap

Look at your `transformShape` and `rotateShape` functions.

```typescript
const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
const newShape = brepTransform.Shape();
// ...
const geometryData = shapeToBufferGeometryData(newShape, oc, deflection || 0.1);

```

When you call `shapeToBufferGeometryData`, it runs `BRepMesh_IncrementalMesh`. Meshing is the heaviest computational task in OpenCASCADE.
If your user is dragging a 3D translation gizmo in the browser, and you are firing `transformShape` to the worker 60 times a second, the worker queue will instantly choke because it is trying to re-calculate a complex B-Rep surface mesh on every pixel of mouse movement.

* **The Fix:** When the user is dragging a shape, **do not send that to the worker.** Apply the translation/rotation directly to the `THREE.Mesh.position` and `THREE.Mesh.rotation` on the main thread. The visual update will be instant and 60fps.
* Only when the user lets go of the mouse button (`onPointerUp`), send the final transformation matrix to `multMatrixShape` in the worker to permanently bake the coordinates into the B-Rep shape.

### 3. Dynamic Array Resizing in the Mesher

Inside `shapeToBufferGeometryData`, you are extracting the vertices like this:

```typescript
const positions: number[] = [];
// ... inside loop:
positions.push(pnt.X(), pnt.Y(), pnt.Z());

```

JavaScript arrays are dynamic. When you `push()` hundreds of thousands of floats into a standard array, the V8 engine has to constantly pause, allocate a larger chunk of memory, and copy the old data over.

* **The Fix:** Since you can ask the triangulation how many nodes it has (`tri.NbNodes()`), pre-allocate the memory.

```typescript
// Instead of an array, push chunks directly or pre-calculate total vertices
let idx = 0;
// Note: You would need to sum tri.NbNodes() across all faces first
const positions = new Float32Array(totalNodes * 3); 

// Inside your loop:
positions[idx++] = pnt.X();
positions[idx++] = pnt.Y();
positions[idx++] = pnt.Z();

```

### 4. Memory Leaks in the Mesher

WASM memory is manual. In `shapeToBufferGeometryData`, you are leaking the transformation handles on every single face and edge extraction.

```typescript
const location = new oc.TopLoc_Location_1();
const triangulation = oc.BRep_Tool.Triangulation(face, location);

if (!triangulation.IsNull()) {
  const trsf = location.Transformation(); // <-- This is created but never deleted
  // ...
  // You must add: trsf.delete();
}

```

You have the same missing `trsf.delete()` inside the `BRep_Tool.Polygon3D` edge extraction loop further down. Over time, generating previews will eat up your WASM heap and crash the tab.