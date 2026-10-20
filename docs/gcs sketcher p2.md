gcs sketcher p2 

Based on everything analyzed — the WebCAD codebase, the CATIA interaction model, the SolveSpace architecture, the parametric DAG roadmap, and the OCC worker — here is the precise sequencing of what comes after the GCS sketcher, with full technical rationale for each ordering decision.

---

## The dependency chain

The GCS sketcher produces **profiles** — closed 2D curves with constraint-solved coordinates. Everything that follows consumes profiles. Nothing in the list below can be built correctly without the sketcher existing first.

```
GCS Sketcher (done)
       │
       ├──▶ Parametric Feature DAG    ← sketcher output needs somewhere to go
       │           │
       │           ├──▶ Extrude / Revolve / Sweep / Loft   ← first real 3D features
       │           │           │
       │           │           ├──▶ Boolean operations (cut, fuse, common)
       │           │           │
       │           │           └──▶ Topological Naming (TNS Phase 1)
       │           │                       │
       │           │                       └──▶ Fillet / Chamfer on named edges
       │           │
       │           └──▶ History tree UI (rollback bar, edit-in-place)
       │
       ├──▶ STEP Import / Export       ← OCC already has it; expose the pipeline
       │
       └──▶ Assembly                   ← last; needs stable single-part parametrics first
```

---

## 1. Parametric Feature DAG — first, immediately after the sketcher

**Why first:** The sketcher produces a `SketchDocument` with solved coordinates. Right now that document has nowhere to go — it exists in isolation. The DAG is the container that turns a sketch into a feature, chains features into a model, and makes the whole thing re-solvable when parameters change.

Without the DAG, every 3D operation is still direct-mode: create a box, fillet it, boolean it — and if you change the box dimensions, nothing downstream updates. The sketcher's constraint solving is wasted without a DAG to propagate changes through.

**What to build:**

The dirty-flag partial regen system from SolveSpace's `generate.cpp`, mapped to WebCAD's feature types:

```typescript
interface FeatureNode {
  id: string;
  type: 'sketch' | 'extrude' | 'revolve' | 'fillet' | 'boolean' | 'shell';
  clean: boolean;
  order: number;             // position in linear history
  params: Record<string, number>;  // the feature's own numeric parameters
  inputRefs: string[];       // IDs of upstream features this depends on
  thisGeometry?: Solid3D;    // this feature's contribution
  runningGeometry?: Solid3D; // accumulated solid from root to this node
  execute(inputs: Solid3D[]): Promise<Solid3D>;
}
```

The DAG starts linear (one feature after another). Branching — where two features depend on the same upstream — comes later with assembly. The linear case covers 95% of single-part modeling.

**Undo/redo migration:** This is the hardest part. WebCAD's current `HistoryManager` is a flat stack of entity add/remove operations. In the DAG model, undo means "remove the last feature node and regen from `firstDirty`". These two models cannot coexist. The migration boundary: once a `FeatureNode` exists in the DAG, its entities are DAG-owned and the flat history stack must not touch them.

**History tree UI:** The feature list in the left panel becomes the history tree. Each node shows its type, name, and status icon (green check / red error / blue under-solving). The rollback bar is a horizontal divider the user drags up/down — nodes below it don't execute, their geometry disappears from the viewport. This is the most visually impactful UI change and should ship with the DAG, not as a separate milestone.

---

## 2. Extrude, Revolve, Sweep, Loft — the first parametric 3D features

**Why second:** These are the operations that consume sketcher profiles and produce solid geometry. They're the reason the sketcher exists. Without them, the DAG has nodes but no useful geometry.

Each operation already exists in `OCCWorker.ts` as a direct-mode function. What changes is wrapping them as `FeatureNode.execute()` so they participate in DAG regen:

**Extrude:**
```typescript
class ExtrudeFeature implements FeatureNode {
  params = { depth: 20, draft: 0, symmetric: false };

  async execute(inputs: Solid3D[]): Promise<Solid3D> {
    const profile = this.sketch.execute();  // re-solves GCS sketch
    return await occ.createExtrude(
      profile.points,
      this.params.depth,
      undefined,         // no thickness — solid
      this.deflection,
      profile.isClosed,
      this.id
    );
  }
}
```

The parameter `depth: 20` is now editable. Double-clicking the extrude node in the history tree opens a dialog pre-filled with `depth: 20`. Changing it marks the node dirty, partial regen runs, the solid updates. This is the first moment WebCAD behaves like a parametric CAD system rather than a direct modeler.

**Grip handles on feature parameters:** From the earlier grip-dragging discussion, the extrude's depth handle (a blue arrow on the top face) now edits `ExtrudeFeature.params.depth` directly and triggers a DAG regen on mouseup — not a raw OCC call. This connects the interactive grip system to the parametric history.

**Revolve, Sweep, Loft** follow the same pattern: a sketch profile + feature parameters + `execute()` calling the existing OCC worker functions. The OCC plumbing is already there from `OCCWorker.ts`. The work is the DAG wrapper, not the geometry computation.

---

## 3. Topological Naming — Phase 1 (semantic string tags)

**Why now, not later:** Fillet and chamfer bind to specific edges. Those edges are identified by index today (`edgeIndex: 3`). When the upstream sketch changes and the extruded face count changes from 4 to 6, `edgeIndex: 3` now points to the wrong edge. This is the Topological Naming Problem (TNS) and it makes parametric editing unreliable.

Phase 1 from the roadmap — semantic string tags — is enough to ship parametric fillets without full `TNaming_Builder` instrumentation:

```typescript
// When extrude creates edges, tag them semantically:
const edgeTags = new Map<number, string>();

// An edge created by extruding a line segment:
edgeTags.set(edgeIndex, `Extrude_${featureId}_Profile_Edge_${profileEdgeIdx}_Lateral`);

// The top face edge:
edgeTags.set(edgeIndex, `Extrude_${featureId}_Top_Edge_${i}`);

// Bottom:
edgeTags.set(edgeIndex, `Extrude_${featureId}_Bottom_Edge_${i}`);
```

A downstream fillet stores `edgeTag: 'Extrude_1_Top_Edge_2'` rather than `edgeIndex: 7`. On regen, it asks: "find the edge with this tag in the current shape." If the extrude topology changes, the tag still resolves correctly as long as the semantic meaning (the i-th top edge from this feature) remains valid.

This is ~100 lines of tag-assignment code in the extrude/revolve handlers. It enables robust parametric fillets for the common case, which covers most mechanical parts. Full `TNaming_Builder` OCC instrumentation (Phase 2) comes later when users start reporting edge-identification failures on complex shapes.

---

## 4. Fillet, Chamfer, Shell as parametric features

**Why fourth:** These are the most-used post-processing operations in mechanical CAD. With semantic edge tags from step 3, they can now bind to edges stably across regen cycles.

The existing `filletSolid`, `chamferSolid`, and `makeThickSolid` in `OCCWorker.ts` become `FeatureNode.execute()` wrappers. The critical addition is that `makeThickSolid` must be rewritten to use `BRepOffsetAPI_MakeThickSolid` (the real OCC shelling API) instead of the current "boolean cut a scaled-down copy" hack. This was identified in the OCCWorker review as both a performance bug and a correctness bug — the current approach gives wrong results for non-symmetric shapes.

---

## 5. History tree interactions — edit-in-place, rollback, reorder

**Why fifth:** The DAG and features exist by now. This milestone adds the interaction model that makes the history tree usable as a professional parametric modeler:

**Double-click to edit:** Every feature node re-opens its creation dialog with current parameters. This requires `createdBy` params from the earlier WebCAD analysis — each feature stores the parameters it was created with, and double-click reinstates the command with those parameters pre-filled.

**Rollback bar:** A horizontal line in the history tree the user drags up. Features below the bar don't execute. The geometry shown in the viewport is the state at the rollback position. The user edits an earlier sketch and sees the impact without features below the bar interfering. When they drag the bar back down, everything below re-executes.

**Reorder:** Drag a feature node up or down the tree. This triggers `markDirty` from the moved node's new position and a full regen from there. Some reorderings are invalid (you can't reorder a fillet above the extrude it modifies) — the DAG detects this by checking `inputRefs` and shows a warning.

**Suppress/unsuppress:** Toggle a feature off without deleting it. Suppressed features are skipped in `GenerateAll()` — their downstream nodes execute as if the suppressed feature doesn't exist. This is the equivalent of SolveSpace's `clean = false` forcing a skip.

---

## 6. STEP import/export as a first-class feature

**Why sixth, not later:** `STEPControl_Reader` and `STEPControl_Writer` are already available in the OCC build. The export path is already partially implemented in `OCCWorker.ts` via `exportShapeToBytes` (even if called too frequently). What's missing is the import path exposed properly through the OCCWorkerClient API, and the ability to insert an imported STEP shape as a feature node in the DAG.

This matters now because:
- External shapes (supplier parts, reference geometry, fasteners) need to appear in the model
- The assembly system (next milestone) needs STEP import to bring in external components
- Many users' first action in any CAD tool is to open or import an existing file

The import node becomes a `StepImportFeature` in the DAG — immutable (can't edit it parametrically, the geometry is fixed), but its position and orientation are parameters. Its edges can have tags assigned from the STEP topology names if they exist.

```typescript
class StepImportFeature implements FeatureNode {
  params = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };

  async execute(): Promise<Solid3D> {
    let shape = await occ.importBRep(this.id, this.brepBytes);
    if (this.hasTransform()) {
      shape = await occ.transformShape(this.id, ...this.params);
    }
    return shape;
  }
}
```

---

## 7. Assembly — the final major system

**Why last:** Assembly is the most complex system and depends on everything before it. A single-part parametric modeler must be stable before assembling multiple of them. The specific dependencies:

- Needs the DAG: each component instance is a DAG reference to a part document
- Needs STEP import: external components come in via STEP
- Needs parametric features: in-context editing (modifying a part while seeing the assembly) requires the sketch + feature system to work in-place
- Needs stable TNS: assembly mates bind to faces and edges by tag; without TNS, mates break when parts are edited

**Phase 1 — manual placement (ship first):**

Place components in the scene with a transform gizmo. No mate solver. This alone — a scene with multiple positioned solids — is immediately useful for visualization, clearance checking, and exploded view creation. It ships in 2–3 weeks and delivers real value while the mate solver is being built.

```typescript
interface ComponentInstance {
  id: string;
  componentId: string;
  transform: THREE.Matrix4;   // typed, not number[]
  constraints: AssemblyConstraint[];
  visible: boolean;
}
```

**Phase 2 — mate constraint engine:**

The spatial equivalent of the GCS sketcher — a 6-DoF constraint solver operating on component transforms rather than 2D point coordinates. The same three-stage architecture applies:

- Substitution: `mate/flush` constraints with `offset=0` → direct transform equality
- Single-equation: `angle` constraints on faces with known normals → 1D solve
- Full Newton: remaining constraints solved simultaneously

Mate types in implementation order by frequency of use:

| Mate | Equations | DoF removed |
|---|---|---|
| Coincident faces (mate/flush) | normal alignment + distance | 3 |
| Axis-to-axis (insert) | two axis direction equations + center distance | 4 |
| Angle | one rotation equation | 1 |
| Distance | one translation equation | 1 |
| Width (symmetric between two faces) | two equations | 2 |

**Phase 3 — in-context editing:**

Double-clicking a component in the assembly tree activates it for editing. Other components ghost (15% opacity, depth-write off). The active component's sketch can snap to faces of other components, creating contextual links (parameter references across documents). This is deferred to Phase 3 because it introduces cross-document dependencies — a separate dependency graph problem on top of the single-part DAG.

---

## Parallel track: rendering pipeline formalization

This isn't a milestone that ships user features, but it needs to happen alongside milestones 1–3 to avoid accumulating rendering debt that becomes impossible to untangle later.

The `Viewer.ts` render order formalization from the CATIA rendering analysis:

```typescript
const RENDER_ORDER = {
  FACES_OPAQUE:     0,
  FACES_GHOSTED:    1,  // assembly non-active components
  EDGES:            2,
  PRESELECT_HULL:   3,  // inverted-hull orange shader
  SELECT_HULL:      4,  // inverted-hull green shader
  GRIPS:            5,
  SNAP_INDICATORS:  6,
  SKETCH_OVERLAY:   7,  // constraint badges, inference lines
  ANNOTATIONS:      8,
} as const;
```

The sketcher introduces a new render category (sketch geometry + constraint badges) that doesn't fit the current Viewer's structure. Adding it properly now prevents the `Viewer.ts` size from growing beyond its current 3,419 lines. The entity renderer extraction (from the original codebase review) should happen here: move per-type rendering into specialized renderers so `Viewer.ts` becomes an orchestrator rather than a monolith.

---

## Full timeline

```
Months 1–2    Parametric Feature DAG
              ├── Dirty-flag partial regen (from SolveSpace generate.cpp)
              ├── Undo/redo migration from flat stack to DAG-rollback
              └── History tree UI with rollback bar

Month 3       Extrude + Revolve as first parametric features
              ├── Sketch → profile → extrude pipeline
              └── Grip handle on depth parameter → DAG regen on release

Month 4       TNS Phase 1 (semantic edge tags)
              Fillet / Chamfer / Shell as parametric features
              (rewrite makeThickSolid to use BRepOffsetAPI)

Month 5       History tree interactions
              ├── Double-click edit-in-place
              ├── Reorder with invalid-move detection
              └── Suppress / unsuppress

Month 6       Sweep + Loft as parametric features
              STEP import as DAG feature node

Month 7       Rendering pipeline formalization
              ├── Render order constants
              ├── Inverted-hull highlight shader
              └── Entity renderer extraction from Viewer.ts

Months 8–9    Assembly Phase 1: manual placement + STEP component loading
Month 10      Assembly Phase 2: mate/flush + axis-to-axis solver
Month 11      Assembly Phase 3: angle/distance/width mates + DoF preview
Month 12      Assembly Phase 4: in-context editing (deferred contextual links)
```

---

## The single most important ordering constraint

**The DAG must exist before any other milestone starts.** Every system above — parametric extrude, fillet on named edges, rollback bar, assembly component references — is a node type in the DAG. Building extrude without the DAG produces a direct-mode extrude that has to be ripped out and rebuilt. The DAG is not a feature; it is the substrate everything else runs on. This is the same reason SolveSpace's `Group` system is the very first thing initialized before any geometry exists — the container predates its contents.