# Kernel-Agnostic Geometry Service — Design Sketch

> Goal: decouple WebCAD from *where* and *how* the geometry kernel runs, so the
> same client code works against (a) today's OpenCascade-in-a-WASM-worker, and
> (b) a future server-side kernel (OCCT/Parasolid) — Onshape-style — with
> minimal disruption to the ~30 command files that consume geometry today.

## The core problem

`OpenCascadeService` today does **three jobs at once**:

1. **Kernel vocabulary** — `createBox`, `createBoolean`, `filletSolid`, … (~40 methods).
2. **Transport** — talks to the worker via `OCCWorkerClient` (RPC over `postMessage`).
3. **Presentation** — `buildGeometry()` turns kernel output into `THREE.BufferGeometry`.

Job #3 is the blocker. Every method returns `Promise<THREE.BufferGeometry>`, so
the kernel boundary is welded to the renderer. A server kernel can only return
**raw data** (typed arrays + topology + B-rep bytes); it has no idea what THREE is.

Everything else is actually *well-suited* to a server model already:
- Operations are **stateful and id-based** (`createBoolean(idA, idB, outId)`,
  `filletSolid(entityId, …)`). The kernel holds the B-reps; the client holds IDs.
  That is exactly Onshape's model — the client never owns exact geometry.
- The transport is **request/response RPC with id correlation** — maps 1:1 onto
  HTTP/WebSocket.

So the refactor is mostly *separation*, not rewrite.

## Target layering

```mermaid
flowchart TD
    Callers["Callers<br/>(commands / handlers / Solid3DReevaluator)"]

    subgraph Facade["GeometryService (facade)"]
        direction TB
        F["op → kernel → MeshFactory<br/><i>THREE lives ONLY here</i>"]
    end

    Kernel["GeometryKernel<br/>(interface)<br/><i>TessellationResult — no THREE</i>"]
    MeshFactory["KernelMeshFactory<br/>TessellationResult → THREE.BufferGeometry"]

    Worker["WorkerKernel<br/>(OCC WASM worker — today)"]
    Remote["RemoteKernel<br/>(HTTP/WS server — future)"]
    Mock["MockKernel<br/>(tests)"]

    Callers -- "returns BufferGeometry" --> Facade
    Facade --> Kernel
    Facade --> MeshFactory
    Kernel -. "implemented by<br/>swappable transport" .-> Worker
    Kernel -. .-> Remote
    Kernel -. .-> Mock

    classDef three fill:#1d4ed8,stroke:#93c5fd,color:#fff;
    classDef iface fill:#0f766e,stroke:#5eead4,color:#fff;
    classDef impl fill:#374151,stroke:#9ca3af,color:#fff;
    class Facade,MeshFactory three;
    class Kernel iface;
    class Worker,Remote,Mock impl;
```

Three new seams, one moved responsibility:

1. **`GeometryKernel`** — the abstract contract. Operations in → **raw**
   `TessellationResult` out. No THREE, no DOM. Async, id-based, stateful.
2. **Transport implementations** — `WorkerKernel` wraps the existing
   `OCCWorkerClient`; `RemoteKernel` (later) speaks to a backend. Same interface.
3. **`KernelMeshFactory`** — the *only* place `THREE.BufferGeometry` is built
   (today's `buildGeometry`, lifted out). Pure, client-side, kernel-independent.
4. **`GeometryService`** keeps the current public shape (still returns
   `BufferGeometry`) so callers don't change — it just composes kernel + factory.

## 1. The data contract (no THREE)

This is already almost exactly what the worker returns — we just name it and
strip THREE out.

```ts
// src/core/geometry/KernelTypes.ts
export interface TessellationResult {
  positions: Float32Array;          // flat xyz (transferable)
  indices:   Uint32Array;           // triangle indices (transferable)
  normals?:  Float32Array;          // computed kernel-side (see perf note)
  faceMapping?: number[];           // triangle → persistent face id
  edgeLines?:   number[][];         // edge polylines for display
  brepBytes?:   Uint8Array;         // serialized B-rep snapshot (transferable)
  bbox?: { min: [number,number,number]; max: [number,number,number] };
  lod?: number;                     // which resolution this is (progressive)
}

export interface ShapeStats { isValid: boolean; faceCount: number; volume?: number; }
```

## 2. The kernel interface

Two ways to express the op vocabulary. Pick one:

**Option A — method-per-op (mirrors today, lowest risk).** The interface lists
the same ~40 methods, but every `Promise<THREE.BufferGeometry>` becomes
`Promise<TessellationResult>`. Mechanical, diff-reviewable, no behavior change.

**Option B — op-as-data (cleaner, recommended target).** Collapse the vocabulary
into one discriminated union so transports never re-list 40 signatures and
batching/caching/logging are trivial:

```ts
// src/core/geometry/KernelOps.ts
export type KernelOp =
  | { kind: 'box';      out: string; x:number; y:number; z:number; dx:number; dy:number; dz:number }
  | { kind: 'cylinder'; out: string; x:number; y:number; z:number; r:number; h:number }
  | { kind: 'boolean';  out: string; op:'fuse'|'cut'|'common'; a:string; b:string }
  | { kind: 'fillet';   out: string; target:string; edge:number; radius:number }
  | { kind: 'draftFaces'; out: string; target:string; faces:number[]; neutral:number; angleRad:number }
  /* … one variant per current method … */;

export interface GeometryKernel {
  init(): Promise<void>;

  // Run one op; kernel stores the result B-rep under op.out and returns its mesh.
  run(op: KernelOp, opts?: TessellateOpts): Promise<TessellationResult>;

  // Batch — single round-trip for a whole DAG re-evaluation (critical for remote latency).
  runBatch(ops: KernelOp[], opts?: TessellateOpts): Promise<TessellationResult[]>;

  // Session / lifecycle (maps onto today's rehydrate / releaseShapes / clearCache).
  loadBRep(id: string, bytes: Uint8Array): Promise<TessellationResult>;
  exportBRep(id: string): Promise<Uint8Array>;
  release(ids: string[]): Promise<void>;
  clear(): Promise<void>;

  // Queries.
  validity(id: string): Promise<ShapeStats>;
  faceProfile(id: string, face: number): Promise<{ x:number; y:number; bulge:number }[][]>;

  // Re-tessellate an existing shape at a new quality (LOD / progressive refine) WITHOUT recompute.
  retessellate(id: string, opts: TessellateOpts): Promise<TessellationResult>;
}

export interface TessellateOpts { deflection?: number; lod?: number; withNormals?: boolean; }
```

Option B is more work up front but is what makes server-side, batching, and LOD
clean. A reasonable path: ship Option A first (fast, low-risk), evolve to B.

## 3. The presentation layer (THREE isolated here)

```ts
// src/core/geometry/KernelMeshFactory.ts  — today's buildGeometry(), lifted out
import * as THREE from 'three';
export function toBufferGeometry(r: TessellationResult): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(r.positions, 3));
  g.setIndex(new THREE.Uint32BufferAttribute(r.indices, 1));
  if (r.normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(r.normals, 3));
  else g.computeVertexNormals();            // fallback only; prefer kernel-side normals
  g.userData = { faceMapping: r.faceMapping, edgeLines: r.edgeLines, brepSnapshot: r.brepBytes };
  return g;
}
```

This single move is what makes a server kernel possible — nothing downstream of
`TessellationResult` cares whether the bytes came from WASM or from HTTPS.

## 4. The facade (keeps callers unchanged)

```ts
// OpenCascadeService becomes a thin composition; same public methods/signatures.
class GeometryService {
  private kernel: GeometryKernel;          // WorkerKernel today; swap later
  async createBox(...args): Promise<THREE.BufferGeometry> {
    const r = await this.kernel.run({ kind:'box', out: entityId, ... });
    return toBufferGeometry(r);
  }
}
```

So the ~30 command files keep calling `occ.createBox(...)` and keep receiving a
`BufferGeometry`. The swap (worker ↔ server) happens entirely behind the facade
via a single `kernel = new WorkerKernel()` vs `new RemoteKernel(url)` line.

## What this buys, and what each transport needs

| Concern | Worker (today) | Remote (future) |
|---|---|---|
| Where B-reps live | worker WASM heap | server session |
| Transport | `postMessage` + id | WebSocket/HTTP + id |
| Big payloads | **transferable** ArrayBuffers | binary frames / gzip |
| Round-trip cost | ~free | latency → **`runBatch` essential** |
| Session | implicit (one worker) | explicit open/close + GC |
| Caching | `ShapeCacheDB` (have it) | content-hash op cache server+client |

## Performance wins that fall out of this design

- **Transferables**: `WorkerKernel` returns `TessellationResult` with typed
  arrays and passes `[positions.buffer, indices.buffer, brepBytes.buffer]` as the
  transfer list — eliminates the structured-clone deep copy that happens today.
- **Kernel-side normals**: `withNormals` computed in the worker/server, so the
  main thread stops calling `computeVertexNormals()` per shape.
- **Batching**: DAG re-evaluation (`Solid3DReevaluator`) sends one `runBatch`
  instead of N sequential round-trips — the single biggest latency win for remote.
- **LOD / progressive**: `retessellate(id, {lod})` re-meshes a shape the kernel
  already holds, without recomputing the B-rep — Onshape's coarse-first feel.
- **Content-hash cache**: key `TessellationResult` by a hash of the op + inputs;
  unchanged features skip the kernel entirely.

## Migration path (incremental, each step shippable)

1. **Extract `KernelTypes` + `KernelMeshFactory`** — move `buildGeometry` out of
   `OpenCascadeService`; service calls it. No interface change. *(small, safe)*
2. **Introduce `GeometryKernel` (Option A) + `WorkerKernel`** wrapping
   `OCCWorkerClient`; `OpenCascadeService` becomes the facade. Add transferables
   + kernel-side normals here. *(perf win lands now)*
3. **Add `runBatch`** and route `Solid3DReevaluator` through it.
4. **Evolve to Option B (op-as-data)** if/when the vocabulary churn justifies it.
5. **Add `RemoteKernel`** implementing the same interface — *no caller changes*.
   Decide server kernel (OCCT native first; Parasolid only if commercial).

## Risks / notes

- `entityId`-as-output-handle is already the contract — keep it; it's what makes
  the kernel stateful in a server-friendly way.
- A server kernel needs **session lifecycle + GC** (today's single worker hides
  this); `release`/`clear` already exist to build on.
- Don't let THREE types leak back across the boundary in review — the whole value
  is that `GeometryKernel` and `TessellationResult` stay THREE-free.
- Selection/highlight depends on `faceMapping`/`edgeLines` being **persistent**
  ids across regenerations — worth firming up regardless of transport.
```
