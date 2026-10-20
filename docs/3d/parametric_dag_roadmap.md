# Parametric Feature DAG — Implementation Roadmap

The GCS Sketcher produces constraint-solved profiles.
The Parametric Feature DAG is the infrastructure that turns those profiles
into a living, re-solvable model. Without it every 3D operation is still
direct-mode — change the sketch, nothing updates downstream.

This document is the concrete implementation guide for Milestone 1
of the post-GCS roadmap.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        DAGStore                                  │
│                                                                  │
│  nodes: FeatureNode[]   (ordered — index = execution order)      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Sketch 1 │→ │Extrude 1 │→ │ Fillet 1 │→ │Boolean 1 │ …      │
│  │ clean ✓  │  │ clean ✗  │  │ clean ✗  │  │ clean ✗  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│       ↑                                                          │
│  markDirty("Sketch1")  →  propagates right  →  regen from here  │
│                                                                  │
│  rollbackIndex: 2  →  nodes[2..] don't execute, geometry hidden  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — FeatureNode interface and DAGStore

### 1.1  FeatureNode

```typescript
// src/core/dag/FeatureNode.ts

import type { Solid3D }         from '../model/Solid3D';
import type { SketchDocument }  from '../sketcher/SketchDocument';

// ── execution status ──────────────────────────────────────────────────────
export const enum FeatureStatus {
  CLEAN        = 'clean',       // executed successfully, geometry up-to-date
  DIRTY        = 'dirty',       // needs re-execution
  ERROR        = 'error',       // last execution threw
  SUPPRESSED   = 'suppressed',  // user-toggled off; skip in regen
  FROZEN       = 'frozen',      // below rollback bar; skip in regen
}

// ── base interface ─────────────────────────────────────────────────────────
export interface FeatureNode {
  // identity
  readonly id:    string;
  readonly type:  FeatureType;
  name:           string;

  // ordering
  order:   number;    // index in DAGStore.nodes — the canonical execution order
  status:  FeatureStatus;

  // geometry outputs
  thisGeometry?:    Solid3D;   // what this feature contributes
  runningGeometry?: Solid3D;   // accumulated solid up to and including this node
                               // (equivalent to SolveSpace's group.runningShell)

  // upstream references — used to validate reorder operations
  inputRefs: string[];   // IDs of nodes this feature depends on

  // parameter storage — everything the user can edit in the dialog
  params: Record<string, FeatureParam>;

  // execution
  execute(context: RegenContext): Promise<void>;

  // serialization
  serialize():   FeatureNodeData;
  deserialize(d: FeatureNodeData): void;
}

export interface FeatureParam {
  value:   number | string | boolean;
  label:   string;
  type:    'number' | 'string' | 'boolean' | 'entityRef';
  min?:    number;
  max?:    number;
  unit?:   'mm' | 'deg' | 'scalar';
}

export type FeatureType =
  | 'sketch'
  | 'extrude'
  | 'revolve'
  | 'sweep'
  | 'loft'
  | 'fillet'
  | 'chamfer'
  | 'shell'
  | 'boolean'
  | 'transform'
  | 'step_import'
  | 'mirror'
  | 'pattern_linear'
  | 'pattern_circular';

// ── regen context passed to each execute() ─────────────────────────────────
// Contains everything a feature needs without reaching into global state
export interface RegenContext {
  dag:        DAGStore;
  occ:        OCCWorkerClient;
  deflection: number;
  // The running geometry of the previous node — feature reads this
  // as its "base solid" for boolean or modification operations
  previousGeometry: Solid3D | null;
}
```

### 1.2  DAGStore — the central registry

```typescript
// src/core/dag/DAGStore.ts

import { EventEmitter } from '../utils/EventEmitter';

export type DAGEvent =
  | { type: 'nodeAdded';    node: FeatureNode }
  | { type: 'nodeRemoved';  id:   string }
  | { type: 'nodeDirty';    id:   string }
  | { type: 'regenStart';   from: number }
  | { type: 'regenEnd';     success: boolean }
  | { type: 'rollbackMoved'; index: number };

export class DAGStore extends EventEmitter<DAGEvent> {
  nodes: FeatureNode[] = [];

  // Rollback bar: nodes at index >= rollbackIndex are frozen
  // -1 means "no rollback" (all nodes execute)
  rollbackIndex = -1;

  // ── node management ────────────────────────────────────────────────────

  append(node: FeatureNode): void {
    node.order = this.nodes.length;
    this.nodes.push(node);
    this.emit({ type: 'nodeAdded', node });
    this.markDirty(node.id);
  }

  insertAfter(afterId: string, node: FeatureNode): void {
    const idx = this.indexById(afterId);
    node.order = idx + 1;
    this.nodes.splice(idx + 1, 0, node);
    this.reindex(idx + 1);
    this.emit({ type: 'nodeAdded', node });
    this.markDirty(node.id);
  }

  remove(id: string): void {
    const idx = this.indexById(id);
    if (idx === -1) return;
    this.nodes.splice(idx, 1);
    this.reindex(idx);
    this.emit({ type: 'nodeRemoved', id });
    // Mark the node that now sits at idx dirty (it lost its predecessor)
    if (idx < this.nodes.length) this.markDirty(this.nodes[idx].id);
  }

  // ── dirty propagation (from SolveSpace MarkGroupDirty) ─────────────────
  //
  // Mark the given node and every node that comes after it as dirty.
  // This is the core invariant: if a node changes, all its dependents
  // must re-execute.
  markDirty(id: string): void {
    let propagate = false;
    for (const node of this.nodes) {
      if (node.id === id) propagate = true;
      if (propagate && node.status !== FeatureStatus.SUPPRESSED) {
        node.status = FeatureStatus.DIRTY;
        this.emit({ type: 'nodeDirty', id: node.id });
      }
    }
  }

  // Mark a single node dirty without propagating.
  // Use only when you know no downstream node depends on this one's output
  // (rare — e.g. name change, colour change).
  markDirtySingle(id: string): void {
    const node = this.getById(id);
    if (node) {
      node.status = FeatureStatus.DIRTY;
      this.emit({ type: 'nodeDirty', id });
    }
  }

  // ── rollback bar ───────────────────────────────────────────────────────

  setRollback(index: number): void {
    // -1 = all nodes active; 0 = only node[0] active; n = first n+1 active
    this.rollbackIndex = Math.max(-1, Math.min(this.nodes.length - 1, index));
    this.nodes.forEach((n, i) => {
      if (this.rollbackIndex !== -1 && i > this.rollbackIndex) {
        n.status = FeatureStatus.FROZEN;
      } else if (n.status === FeatureStatus.FROZEN) {
        n.status = FeatureStatus.DIRTY;  // un-freeze → needs regen
      }
    });
    this.emit({ type: 'rollbackMoved', index: this.rollbackIndex });
  }

  // ── node reordering ────────────────────────────────────────────────────

  // Returns an error string if the reorder is invalid, null if OK.
  canMoveTo(id: string, newIndex: number): string | null {
    const node = this.getById(id);
    if (!node) return 'Node not found';
    // A node cannot move before any node it depends on
    for (const dep of node.inputRefs) {
      const depIdx = this.indexById(dep);
      if (depIdx >= newIndex) {
        return `Cannot move before "${this.getById(dep)?.name}": this feature depends on it`;
      }
    }
    // A node cannot move after any node that depends on it
    for (const other of this.nodes) {
      if (other.inputRefs.includes(id)) {
        const otherIdx = other.order;
        if (newIndex >= otherIdx) {
          return `Cannot move after "${other.name}": it depends on this feature`;
        }
      }
    }
    return null;
  }

  moveTo(id: string, newIndex: number): void {
    const err = this.canMoveTo(id, newIndex);
    if (err) throw new Error(err);
    const oldIdx = this.indexById(id);
    const [node] = this.nodes.splice(oldIdx, 1);
    this.nodes.splice(newIndex, 0, node);
    this.reindex(Math.min(oldIdx, newIndex));
    this.markDirty(this.nodes[Math.min(oldIdx, newIndex)].id);
  }

  // ── suppress / unsuppress ──────────────────────────────────────────────

  suppress(id: string): void {
    const node = this.getById(id);
    if (!node) return;
    node.status = FeatureStatus.SUPPRESSED;
    // Downstream nodes need regen — they now have a different predecessor
    const idx = this.indexById(id);
    if (idx + 1 < this.nodes.length) {
      this.markDirty(this.nodes[idx + 1].id);
    }
  }

  unsuppress(id: string): void {
    const node = this.getById(id);
    if (!node) return;
    node.status = FeatureStatus.DIRTY;
    this.markDirty(id);  // propagate to downstream
  }

  // ── queries ────────────────────────────────────────────────────────────

  getById(id: string): FeatureNode | undefined {
    return this.nodes.find(n => n.id === id);
  }

  indexById(id: string): number {
    return this.nodes.findIndex(n => n.id === id);
  }

  firstDirtyIndex(): number {
    return this.nodes.findIndex(
      n => n.status === FeatureStatus.DIRTY || n.status === FeatureStatus.ERROR
    );
  }

  // The "active" geometry = runningGeometry of the last non-frozen node
  activeGeometry(): Solid3D | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (n.status === FeatureStatus.FROZEN || n.status === FeatureStatus.SUPPRESSED) continue;
      if (n.runningGeometry) return n.runningGeometry;
    }
    return null;
  }

  // ── private ───────────────────────────────────────────────────────────

  private reindex(from: number): void {
    for (let i = from; i < this.nodes.length; i++) {
      this.nodes[i].order = i;
    }
  }
}
```

---

## Phase 2 — RegenEngine: the partial regen loop

```typescript
// src/core/dag/RegenEngine.ts
//
// Direct port of SolveSpace's GenerateAll() pattern:
//   1. Find firstDirty
//   2. Execute each dirty node in order
//   3. Pass runningGeometry forward
//   4. Stop on error (leave geometry as last-good state)

export class RegenEngine {
  private running = false;
  private pendingRegen = false;

  constructor(
    private dag:    DAGStore,
    private occ:    OCCWorkerClient,
    private viewer: Viewer,
    private deflection = 0.5,
  ) {}

  // Schedule a regen — debounced so rapid param changes batch into one regen.
  schedule(): void {
    if (this.running) {
      this.pendingRegen = true;
      return;
    }
    // Use microtask to let synchronous param changes settle first
    queueMicrotask(() => this.run());
  }

  async run(): Promise<void> {
    if (this.running) { this.pendingRegen = true; return; }
    this.running = true;

    try {
      await this._runOnce();
    } finally {
      this.running = false;
      if (this.pendingRegen) {
        this.pendingRegen = false;
        this.schedule();
      }
    }
  }

  private async _runOnce(): Promise<void> {
    const firstDirty = this.dag.firstDirtyIndex();

    // Nothing dirty — only update display (camera change, selection, etc.)
    if (firstDirty === -1) {
      this.viewer.scheduleRender();
      return;
    }

    this.dag.emit({ type: 'regenStart', from: firstDirty });

    // The running geometry entering the first dirty node = the last clean
    // node's runningGeometry (or null if firstDirty === 0)
    let prevGeometry: Solid3D | null =
      firstDirty > 0
        ? (this.dag.nodes[firstDirty - 1].runningGeometry ?? null)
        : null;

    let success = true;

    for (let i = firstDirty; i < this.dag.nodes.length; i++) {
      const node = this.dag.nodes[i];

      if (node.status === FeatureStatus.SUPPRESSED ||
          node.status === FeatureStatus.FROZEN) {
        continue;
      }

      const ctx: RegenContext = {
        dag:              this.dag,
        occ:              this.occ,
        deflection:       this.deflection,
        previousGeometry: prevGeometry,
      };

      try {
        await node.execute(ctx);
        node.status = FeatureStatus.CLEAN;

        // Remove old mesh from viewer, add new one
        this.viewer.removeEntity(node.id);
        if (node.runningGeometry) {
          this.viewer.addEntity(node.runningGeometry, /* units */);
        }

        prevGeometry = node.runningGeometry ?? prevGeometry;

      } catch (err) {
        node.status = FeatureStatus.ERROR;
        // Keep node.runningGeometry as last-good geometry for display
        // (user sees the model as it was before this feature broke)
        console.error(`[DAG] Feature "${node.name}" failed:`, err);
        success = false;
        break;  // stop regen — downstream nodes stay dirty
      }
    }

    this.dag.emit({ type: 'regenEnd', success });
    this.viewer.scheduleRender();
  }
}
```

---

## Phase 3 — Undo/redo migration

This is the hardest part of the DAG implementation. The existing flat
`HistoryManager` (a stack of `{ add: Entity[], remove: Entity[] }` records)
is incompatible with DAG-managed geometry.

### The migration boundary rule

> **If a geometry object is owned by a DAG node, the flat HistoryManager
> must never touch it.**

All Solid3D entities created by feature nodes are DAG-owned.
All 2D entities (Line, Arc, Circle, etc.) remain flat-HistoryManager-owned
until the full sketcher mode is integrated.

### DAGHistoryEntry — replaces entity-level undo for 3D ops

```typescript
// src/core/dag/DAGHistory.ts

// A snapshot captures the param values of every feature node
// at a point in time. Restoring it marks all affected nodes dirty
// and schedules a regen.
//
// We do NOT snapshot geometry — it's re-derived from params.
// This keeps snapshots small (just numbers and strings).

interface DAGSnapshot {
  timestamp: number;
  label:     string;  // e.g. "Change extrude depth"
  nodes: Array<{
    id:     string;
    params: Record<string, FeatureParam>;
    status: FeatureStatus;
  }>;
  rollbackIndex: number;
}

export class DAGHistory {
  private undoStack: DAGSnapshot[] = [];
  private redoStack: DAGSnapshot[] = [];
  private maxDepth = 100;

  constructor(private dag: DAGStore, private regen: RegenEngine) {}

  // Call BEFORE making changes to take a snapshot of current state
  snapshot(label: string): void {
    const snap: DAGSnapshot = {
      timestamp: Date.now(),
      label,
      rollbackIndex: this.dag.rollbackIndex,
      nodes: this.dag.nodes.map(n => ({
        id:     n.id,
        params: structuredClone(n.params),
        status: n.status,
      })),
    };
    this.undoStack.push(snap);
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack = [];  // new action clears redo
  }

  undo(): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push(this.captureNow('Redo'));
    this.restore(snap);
  }

  redo(): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push(this.captureNow('Undo'));
    this.restore(snap);
  }

  private restore(snap: DAGSnapshot): void {
    // Restore params and find the first node that changed
    let firstChanged = this.dag.nodes.length;

    for (const saved of snap.nodes) {
      const node = this.dag.getById(saved.id);
      if (!node) continue;
      const changed = !paramsEqual(node.params, saved.params);
      if (changed) {
        node.params = structuredClone(saved.params);
        firstChanged = Math.min(firstChanged, node.order);
      }
    }

    this.dag.rollbackIndex = snap.rollbackIndex;

    if (firstChanged < this.dag.nodes.length) {
      this.dag.markDirty(this.dag.nodes[firstChanged].id);
      this.regen.schedule();
    }
  }

  private captureNow(label: string): DAGSnapshot {
    return {
      timestamp: Date.now(),
      label,
      rollbackIndex: this.dag.rollbackIndex,
      nodes: this.dag.nodes.map(n => ({
        id:     n.id,
        params: structuredClone(n.params),
        status: n.status,
      })),
    };
  }
}

function paramsEqual(
  a: Record<string, FeatureParam>,
  b: Record<string, FeatureParam>
): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => a[k]?.value === b[k]?.value);
}
```

### Coexistence with the existing HistoryManager

While the DAG migration is in progress, both systems are active:

```typescript
// src/app.ts — updated command handler

async handleResult(result: CommandResult): Promise<void> {
  if (result?.type === 'solid3d') {
    // New path: DAG-owned geometry
    this.dagHistory.snapshot(`Add ${result.featureType}`);
    this.dag.append(result.featureNode);
    this.regen.schedule();
    return;
  }

  // Legacy path: flat HistoryManager for 2D entities
  if (result?.entities) {
    this.doc.recordAdd(result.entities);
    // ... existing flat-history logic
  }
}
```

**Migration complete condition:** When every command that produces 3D geometry
goes through the `result.type === 'solid3d'` path. The flat HistoryManager
then only manages 2D drafting entities.

---

## Phase 4 — First concrete feature nodes

### 4.1  SketchFeatureNode

```typescript
// src/core/dag/features/SketchFeature.ts

export class SketchFeatureNode implements FeatureNode {
  readonly type = 'sketch' as const;
  inputRefs = [];  // sketch has no upstream solid dependency
  status    = FeatureStatus.DIRTY;
  params    = {};

  constructor(
    public readonly id: string,
    public name: string,
    public doc: SketchDocument,
    public workplane: WorkplaneDefinition,
  ) {}

  async execute(ctx: RegenContext): Promise<void> {
    // Re-solve the GCS sketch (params may have moved if workplane changed)
    const system = new System();
    const result = system.solve(this.doc);

    if (result.result !== SolveResult.SOLVED_OKAY) {
      throw new Error(
        `Sketch "${this.name}" failed to solve (dof=${result.dof}, ` +
        `status=${result.result})`
      );
    }

    // A sketch doesn't produce a Solid3D.
    // Its profile is read by the feature that directly follows it.
    // runningGeometry passes through unchanged from the previous node.
    this.thisGeometry    = undefined;
    this.runningGeometry = ctx.previousGeometry ?? undefined;
  }

  getProfile(): SketchProfile {
    // Build a closed profile from the solved SketchDocument
    return buildProfileFromSketch(this.doc);
  }

  serialize(): FeatureNodeData {
    return {
      type: 'sketch', id: this.id, name: this.name,
      params: {},
      sketchData: serializeSketchDocument(this.doc),
      workplane:  this.workplane,
    };
  }

  deserialize(d: FeatureNodeData): void {
    this.doc = deserializeSketchDocument(d.sketchData);
    this.workplane = d.workplane;
  }
}
```

### 4.2  ExtrudeFeatureNode

```typescript
// src/core/dag/features/ExtrudeFeature.ts

export class ExtrudeFeatureNode implements FeatureNode {
  readonly type = 'extrude' as const;
  status = FeatureStatus.DIRTY;

  params: Record<string, FeatureParam> = {
    depth:     { value: 20,    label: 'Depth',     type: 'number', min: 0.001, unit: 'mm' },
    symmetric: { value: false, label: 'Symmetric', type: 'boolean' },
    draft:     { value: 0,     label: 'Draft',     type: 'number', min: -89, max: 89, unit: 'deg' },
    sketchId:  { value: '',    label: 'Sketch',    type: 'entityRef' },
  };

  thisGeometry?:    Solid3D;
  runningGeometry?: Solid3D;

  constructor(
    public readonly id:   string,
    public name:          string,
    public inputRefs:     string[],  // [sketchId]
  ) {}

  async execute(ctx: RegenContext): Promise<void> {
    const sketchId  = this.params.sketchId.value as string;
    const sketch    = ctx.dag.getById(sketchId) as SketchFeatureNode;
    if (!sketch) throw new Error(`Sketch "${sketchId}" not found`);

    const profile = sketch.getProfile();
    const depth   = this.params.depth.value as number;

    // Call OCCWorker — same underlying function, now DAG-wrapped
    const geo = await ctx.occ.createExtrude(
      profile.points,
      depth,
      undefined,        // no shell thickness — solid
      ctx.deflection,
      profile.isClosed,
      this.id,
    );

    this.thisGeometry = new Solid3D(this.id);
    this.thisGeometry.positions   = geo.positions;
    this.thisGeometry.indices     = geo.indices;
    this.thisGeometry.faceMapping = geo.faceMapping;
    this.thisGeometry.edgeLines   = geo.edgeLines;
    this.thisGeometry.brepBytes   = geo.brepBytes;

    // Assign semantic edge tags — TNS Phase 1
    assignExtrudeEdgeTags(this.thisGeometry, this.id, profile);

    // Accumulate: boolean FUSE with previous running geometry, or start fresh
    if (ctx.previousGeometry) {
      const fused = await ctx.occ.createBoolean(
        'fuse', ctx.previousGeometry.id, this.id,
        `${this.id}_running`, ctx.deflection,
      );
      this.runningGeometry = buildSolid3D(`${this.id}_running`, fused);
    } else {
      this.runningGeometry = this.thisGeometry;
    }
  }

  // Called by grip handle drag in Viewer — no OCC round-trip during drag,
  // only on mouseup via regen.schedule()
  setDepth(d: number): void {
    this.params.depth.value = d;
  }

  serialize(): FeatureNodeData {
    return { type: 'extrude', id: this.id, name: this.name, params: structuredClone(this.params), inputRefs: this.inputRefs };
  }
  deserialize(d: FeatureNodeData): void {
    this.params    = structuredClone(d.params);
    this.inputRefs = d.inputRefs;
  }
}

// ── Semantic edge tagging (TNS Phase 1) ───────────────────────────────────
function assignExtrudeEdgeTags(
  solid:   Solid3D,
  featureId: string,
  profile: SketchProfile,
): void {
  // The OCC extrude produces edges in a predictable order:
  // - Bottom edges: one per profile segment
  // - Top edges: one per profile segment
  // - Lateral edges: one per profile vertex
  const n = profile.points.length;

  solid.edgeTags = new Map<number, string>();

  for (let i = 0; i < n; i++) {
    solid.edgeTags.set(i,         `${featureId}_Bottom_${i}`);
    solid.edgeTags.set(i + n,     `${featureId}_Top_${i}`);
    solid.edgeTags.set(i + 2 * n, `${featureId}_Lateral_${i}`);
  }
}
```

### 4.3  FilletFeatureNode — first consumer of edge tags

```typescript
// src/core/dag/features/FilletFeature.ts

export class FilletFeatureNode implements FeatureNode {
  readonly type = 'fillet' as const;
  status = FeatureStatus.DIRTY;

  params: Record<string, FeatureParam> = {
    radius:  { value: 2, label: 'Radius', type: 'number', min: 0.001, unit: 'mm' },
    edgeTag: { value: '', label: 'Edge',  type: 'entityRef' },
  };

  thisGeometry?:    Solid3D;
  runningGeometry?: Solid3D;

  constructor(
    public readonly id:   string,
    public name:          string,
    public inputRefs:     string[],   // [solidFeatureId]
  ) {}

  async execute(ctx: RegenContext): Promise<void> {
    if (!ctx.previousGeometry) throw new Error('Fillet has no input solid');

    const edgeTag = this.params.edgeTag.value as string;
    const radius  = this.params.radius.value  as number;

    // Resolve semantic tag → current edge index via the edgeTag map
    const edgeIndex = resolveEdgeTag(ctx.previousGeometry, edgeTag);
    if (edgeIndex === -1) {
      throw new Error(
        `Fillet "${this.name}": edge "${edgeTag}" not found in current geometry. ` +
        `The upstream sketch may have changed topology.`
      );
    }

    const geo = await ctx.occ.filletSolid(
      ctx.previousGeometry.id,
      edgeIndex,
      radius,
    );

    this.thisGeometry = this.runningGeometry = buildSolid3D(this.id, geo);
  }

  serialize(): FeatureNodeData {
    return { type: 'fillet', id: this.id, name: this.name, params: structuredClone(this.params), inputRefs: this.inputRefs };
  }
  deserialize(d: FeatureNodeData): void {
    this.params    = structuredClone(d.params);
    this.inputRefs = d.inputRefs;
  }
}

function resolveEdgeTag(solid: Solid3D, tag: string): number {
  if (!solid.edgeTags) return -1;
  for (const [idx, t] of solid.edgeTags) {
    if (t === tag) return idx;
  }
  return -1;
}
```

---

## Phase 5 — History tree UI

The left panel becomes the history tree. Every `FeatureNode` in `DAGStore.nodes`
is a row. The rollback bar is a draggable divider.

```tsx
// src/ui/HistoryTree.tsx  (React component)

import { DAGStore, FeatureStatus } from '../core/dag/DAGStore';

const STATUS_ICON: Record<FeatureStatus, string> = {
  [FeatureStatus.CLEAN]:      '✓',
  [FeatureStatus.DIRTY]:      '↻',
  [FeatureStatus.ERROR]:      '✕',
  [FeatureStatus.SUPPRESSED]: '○',
  [FeatureStatus.FROZEN]:     '❄',
};

const STATUS_COLOR: Record<FeatureStatus, string> = {
  [FeatureStatus.CLEAN]:      '#22c55e',
  [FeatureStatus.DIRTY]:      '#f59e0b',
  [FeatureStatus.ERROR]:      '#ef4444',
  [FeatureStatus.SUPPRESSED]: '#6b7280',
  [FeatureStatus.FROZEN]:     '#3b82f6',
};

interface Props {
  dag:          DAGStore;
  selectedId:   string | null;
  onSelect:     (id: string) => void;
  onDoubleClick:(id: string) => void;  // opens edit dialog
  onContextMenu:(id: string, e: MouseEvent) => void;
}

export function HistoryTree({ dag, selectedId, onSelect, onDoubleClick, onContextMenu }: Props) {
  const [rollback, setRollback] = useState(dag.rollbackIndex);
  const [draggingRollback, setDraggingRollback] = useState(false);

  // Rollback bar drag
  const handleRollbackDrag = (e: DragEvent, targetIndex: number) => {
    dag.setRollback(targetIndex);
    setRollback(targetIndex);
  };

  return (
    <div className="history-tree">
      <div className="history-tree-header">
        <span>Model History</span>
        <span className="dof-badge">{/* dof display from GCS */}</span>
      </div>

      {dag.nodes.map((node, i) => (
        <div key={node.id}>
          {/* Rollback bar — shown between nodes */}
          {rollback === i - 1 && (
            <div
              className="rollback-bar"
              draggable
              onDragEnd={e => handleRollbackDrag(e, i - 1)}
            >
              <span className="rollback-label">▶ Rollback</span>
            </div>
          )}

          <div
            className={[
              'history-node',
              selectedId === node.id   ? 'selected'   : '',
              node.status              === FeatureStatus.ERROR      ? 'error'      : '',
              node.status              === FeatureStatus.SUPPRESSED ? 'suppressed' : '',
              node.status              === FeatureStatus.FROZEN     ? 'frozen'     : '',
            ].join(' ')}
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => onDoubleClick(node.id)}
            onContextMenu={e => { e.preventDefault(); onContextMenu(node.id, e as any); }}
            draggable
            onDragStart={e => e.dataTransfer.setData('nodeId', node.id)}
            onDrop={e => {
              const fromId = e.dataTransfer.getData('nodeId');
              const err    = dag.canMoveTo(fromId, i);
              if (!err) dag.moveTo(fromId, i);
            }}
            onDragOver={e => e.preventDefault()}
          >
            {/* Type icon */}
            <span className="node-icon">{FEATURE_ICON[node.type]}</span>

            {/* Name — editable inline */}
            <span className="node-name">{node.name}</span>

            {/* Status indicator */}
            <span
              className="node-status"
              style={{ color: STATUS_COLOR[node.status] }}
              title={node.status}
            >
              {STATUS_ICON[node.status]}
            </span>
          </div>
        </div>
      ))}

      {/* Rollback bar at the end */}
      {rollback === dag.nodes.length - 1 && (
        <div className="rollback-bar rollback-bar--end" />
      )}
    </div>
  );
}

const FEATURE_ICON: Record<FeatureType, string> = {
  sketch:           '✏',
  extrude:          '⬆',
  revolve:          '↺',
  sweep:            '〰',
  loft:             '◈',
  fillet:           '◌',
  chamfer:          '◇',
  shell:            '□',
  boolean:          '⊕',
  transform:        '⤢',
  step_import:      '📥',
  mirror:           '⇔',
  pattern_linear:   '⠿',
  pattern_circular: '⊙',
};
```

### Context menu for a history node

```typescript
// Right-click menu items on a FeatureNode:

const CONTEXT_MENU_ITEMS = [
  {
    label: 'Edit',
    action: (id: string) => app.openFeatureDialog(id),
    // Equivalent to CATIA double-click on tree node
  },
  {
    label: 'Rename',
    action: (id: string) => app.inlineRenameNode(id),
  },
  {
    label: (node: FeatureNode) =>
      node.status === FeatureStatus.SUPPRESSED ? 'Unsuppress' : 'Suppress',
    action: (id: string, node: FeatureNode) =>
      node.status === FeatureStatus.SUPPRESSED
        ? dag.unsuppress(id)
        : dag.suppress(id),
  },
  { separator: true },
  {
    label: 'Move Up',
    disabled: (node: FeatureNode) => node.order === 0,
    action: (id: string, node: FeatureNode) =>
      dag.moveTo(id, node.order - 1),
  },
  {
    label: 'Move Down',
    disabled: (node: FeatureNode) => node.order === dag.nodes.length - 1,
    action: (id: string, node: FeatureNode) =>
      dag.moveTo(id, node.order + 1),
  },
  { separator: true },
  {
    label: 'Delete',
    danger: true,
    action: (id: string) => {
      dagHistory.snapshot(`Delete ${dag.getById(id)?.name}`);
      dag.remove(id);
      regen.schedule();
    },
  },
];
```

---

## Phase 6 — Feature edit dialogs (double-click to edit)

Every feature node opens its own dialog pre-filled with current `params`.
Changing a value snapshots history, updates `params`, marks the node dirty,
and schedules regen.

```typescript
// src/ui/FeatureDialog.ts

export class FeatureDialog {
  private node: FeatureNode;
  private preview: Solid3D | null = null;

  open(nodeId: string): void {
    this.node = dag.getById(nodeId)!;

    // Render a form from node.params
    const form = Object.entries(this.node.params).map(([key, param]) => ({
      key,
      ...param,
      onChange: async (newValue: number | string | boolean) => {
        // Live preview: update param but don't commit to history yet
        const old = this.node.params[key].value;
        this.node.params[key].value = newValue;
        this.node.status = FeatureStatus.DIRTY;

        // Async preview regen (debounced, 150ms)
        await regen.run();
      },
    }));

    this.show(form);
  }

  onOK(): void {
    // Commit: take snapshot for undo, leave param values as-is
    dagHistory.snapshot(`Edit ${this.node.name}`);
    this.close();
  }

  onCancel(): void {
    // Restore original param values by undoing without adding to history
    // (simple approach: just restore from a pre-open snapshot)
    this.restorePreOpenState();
    regen.schedule();
    this.close();
  }
}
```

The dialog does NOT re-run OCC on every keystroke during typing. It uses a
150ms debounce. The orange ghost preview from the CATIA rendering analysis
is shown as the user types: the new geometry renders at 35% opacity
overlaid on the current `runningGeometry`. On OK, the ghost becomes opaque
and the history snapshot is committed.

---

## Phase 7 — Connecting DAG to App

These are the wiring changes in `app.ts` that activate the DAG as the
primary geometry management system.

```typescript
// src/app.ts — additions

export class App {
  // New fields alongside existing ones:
  readonly dag        = new DAGStore();
  readonly regen      = new RegenEngine(this.dag, this.occ, this.viewer);
  readonly dagHistory = new DAGHistory(this.dag, this.regen);

  constructor() {
    // ...existing init...

    // Listen for DAG events to sync viewer and UI
    this.dag.on('nodeAdded',    e => this.onNodeAdded(e.node));
    this.dag.on('nodeRemoved',  e => this.onNodeRemoved(e.id));
    this.dag.on('regenEnd',     e => this.onRegenEnd(e.success));
    this.dag.on('rollbackMoved',e => this.onRollbackMoved(e.index));
  }

  // ── command integration ────────────────────────────────────────────────

  // Called by EXTRUDE command on completion:
  addFeatureNode(node: FeatureNode): void {
    this.dagHistory.snapshot(`Add ${node.type}`);
    this.dag.append(node);
    this.regen.schedule();
    this.selectedFeatureId = node.id;
    this.updateGizmoAttachment();
  }

  // Called by double-click on history tree node:
  editFeatureNode(id: string): void {
    const node = this.dag.getById(id);
    if (!node) return;
    new FeatureDialog().open(id);
  }

  // ── keyboard shortcuts ─────────────────────────────────────────────────

  handleKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey && e.key === 'z') {
      this.dagHistory.undo();
      return;
    }
    if (e.ctrlKey && e.key === 'y') {
      this.dagHistory.redo();
      return;
    }
    // ...existing key handling...
  }

  // ── gizmo integration ─────────────────────────────────────────────────

  // Override updateGizmoAttachment to prefer selected feature's running geo
  updateGizmoAttachment(): void {
    if (this.selectedFeatureId) {
      const node = this.dag.getById(this.selectedFeatureId);
      if (node?.runningGeometry) {
        const mesh = this.viewer.getMeshForEntity(node.runningGeometry.id);
        if (mesh) {
          this.gizmoManager.attachToObject(mesh, node.runningGeometry);
          return;
        }
      }
    }
    // Fall back to existing selection-based logic
    super.updateGizmoAttachment();
  }

  // ── grip handle integration ───────────────────────────────────────────

  // On grip mouseup (from the earlier grip-drag implementation):
  onGripDragEnd(entityId: string, paramName: string, newValue: number): void {
    // Find which feature node owns this entity
    const node = this.dag.nodes.find(n => n.id === entityId);
    if (!node) { super.onGripDragEnd(entityId, paramName, newValue); return; }

    this.dagHistory.snapshot(`Drag ${node.name} ${paramName}`);
    node.params[paramName].value = newValue;
    this.dag.markDirty(node.id);
    this.regen.schedule();
  }
}
```

---

## Testing milestones

```
Week 1    DAGStore unit tests
          ├── markDirty propagates to all downstream nodes
          ├── suppress/unsuppress marks correct nodes dirty
          ├── canMoveTo blocks invalid reorders
          └── rollback freezes correct nodes

Week 2    RegenEngine integration tests
          ├── Extrude executes and produces Solid3D
          ├── Second extrude fuses with first
          ├── Error in node 2 stops at node 2, nodes 3+ stay dirty
          └── pendingRegen batches rapid param changes into one regen

Week 3    DAGHistory tests
          ├── snapshot + undo restores prior param values
          ├── undo marks correct node dirty and triggers regen
          ├── redo works after undo
          └── max depth evicts oldest snapshot

Week 4    Full pipeline integration test
          ├── Sketch (rectangle 40×30) → Extrude 20mm
          ├── Change sketch width to 50 → extrude updates automatically
          ├── Add fillet on top edge (by semantic tag) → fillet survives sketch change
          └── Rollback bar hides fillet, shows pre-fillet state

Week 5    History tree UI
          ├── All nodes visible with correct status icons
          ├── Double-click opens dialog pre-filled with current params
          ├── Drag-drop reorder triggers regen from moved position
          └── Context menu suppress/unsuppress works
```

---

## What this unlocks

After these 5 phases:

| Capability | Status |
|---|---|
| Edit sketch → extrude updates automatically | ✓ |
| Change extrude depth via dialog or grip drag | ✓ |
| Add fillet referencing named edge | ✓ |
| Fillet survives upstream sketch topology change | ✓ (TNS Phase 1) |
| Rollback bar to inspect intermediate states | ✓ |
| Suppress feature without deleting | ✓ |
| Undo/redo across all parametric operations | ✓ |
| Orange ghost preview on param changes | ✓ |

This is the minimum viable parametric modeler.
From here, adding Revolve, Sweep, Loft, Shell, Boolean, and Mirror is
mechanical: implement `execute()` calling the existing OCCWorker functions,
assign semantic edge tags, and register with the feature dialog system.
No new architecture is needed for any of them.
