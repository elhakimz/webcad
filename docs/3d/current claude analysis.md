current claude analysis 

Now I have the complete picture of the current state. Let me compile the full gap analysis.Now I have the full picture. Here is the complete state assessment and next steps.

---

## Current State vs Roadmap — Full Gap Analysis

### What has been built

**1. PBD Constraint Solver (`SketchSolver.ts`, 506 lines)**

A Position-Based Dynamics relaxation solver exists and is wired into the document. It handles coincident, horizontal, vertical, distance, parallel, perpendicular, and fix constraints. `DocumentConstraint` / `DocumentPointRef` bridge the solver to existing document entities (`Line`, `Circle`, `Arc`, `Polyline`) without a separate param store. Constraints live on `doc.constraints[]` and survive undo/redo via `HistoryManager`. This is a real, working constraint system.

**2. Sketch UI (`SketchToolWindow.ts`, 828 lines)**

Full constraint toolbar with point selection, constraint application buttons, constraint list, and undo/redo integration. The architecture of operating on selected existing entities (rather than a separate sketch mode) is a deliberate simplification — no hard mode switch required.

**3. Per-solid feature list (`Solid3D.features[]` + `Solid3DReevaluator`)**

Each `Solid3D` carries a `features: FeatureNode[]` array. `SFilletHandler`, `SChamferHandler`, `ShellHandler`, `ScaleHandler` push to this array. `Solid3DReevaluator.reevaluate()` replays the feature list through OCC from scratch. `PropertiesWindow` has a features tab that exposes this with edit+reevaluate. This is a per-solid parametric history — not a global DAG.

**4. Viewer constraint visualization (`updateConstraints`)**

`Viewer.updateConstraints()` renders constraint badges (horizontal/vertical marks, dimension lines) as Three.js overlay objects.

---

### The three architectural divergences from the roadmap

**Divergence 1: PBD instead of Newton-Jacobian**

The roadmap specified a Newton solver with automatic differentiation (`Expr` + `PartialWrt`) and a Jacobian rank test for DoF feedback. The codebase has PBD relaxation instead.

PBD is faster to implement and gives smooth interactive behavior, but has concrete limitations that will matter soon:

| | PBD (current) | Newton-Jacobian (roadmap) |
|---|---|---|
| Convergence | Approximate — never exactly satisfies constraints | Exact to floating point tolerance |
| DoF count | Cannot compute | `dof = n - m` from Jacobian rank |
| Over-constraint detection | Silent wrong result | `SINGULAR_JACOBIAN` with conflict identification |
| Under-constraint coloring | Not possible | Free params → blue entities |
| Equal length, tangent, angle | Hard to add correctly | Write equation, derivative is automatic |

The missing DoF coloring (blue/green/red) is the most visible gap. Without it, the user has no feedback about whether their sketch is fully constrained before extruding.

**Divergence 2: Per-solid feature list instead of global DAG**

`Solid3D.features[]` is a local history per solid. The global DAG (from the post-GCS roadmap) hasn't been built. The consequences:

- A boolean `FUSE(solidA, solidB)` creates `solidC` with no connection to A or B. If you change solidA's extrude depth, solidC doesn't update.
- A sketch-driven extrude (sketch as a document entity, extrude as a `Solid3D`) has no formal link. The extrude stores `creationParams.points[]` — a copy of the profile at creation time. If you move the sketch entities, the solid doesn't update.
- The `Solid3DReevaluator` re-executes features within one solid's chain but can't orchestrate a multi-solid parametric chain.

**Divergence 3: No hard sketcher sub-mode**

The current approach applies constraints to selected existing document entities. This is intentional simplicity — it avoids a hard mode switch and integrates naturally with the 2D drafting workflow. But it means there's no "close sketch → extrude this profile" pipeline. The extrude command takes the current geometry as a point array, not a live sketch reference.

---

### What to build next — in priority order

**Priority 1: DoF visualization via Jacobian rank test (2 weeks)**

This is the highest-value addition to the existing PBD solver with the least architectural change. It doesn't replace PBD — it adds a separate analysis pass after PBD converges.

The plan: after `solveConstraints()` runs, build the Jacobian matrix of the active constraints against the free coordinates, run Gram-Schmidt rank computation, and classify each entity's points:

```typescript
// src/core/engine/SketchSolver.ts — add alongside existing solveConstraints()

export interface DoFAnalysis {
  dof: number;                    // degrees of freedom remaining
  freePointIndices: Set<number>;  // points with unconstrained coordinates
  conflictIndices:  number[];     // equations that are linearly dependent (over-constrained)
}

export function analyzeDoF(
  points: SketchPoint[],
  constraints: SketchConstraint[]
): DoFAnalysis {
  // Build the Jacobian: rows = scalar constraint equations, cols = free coordinates
  // Each constraint generates one or two scalar equations
  // Each non-fixed point contributes two free coordinates (x, y)
  //
  // For each scalar equation f_i, for each free coord x_j:
  //   J[i][j] = ∂f_i / ∂x_j (numerical — perturb x_j by ε and measure Δf_i)
  //
  // Rank via Gram-Schmidt → dof = n_freeCols - rank
  // Free params = columns with zero Jacobian across all rows
  // Conflicts = rows that become zero after orthogonalization
}
```

Wire into `SketchToolWindow` and `Viewer.updateConstraints()`: after every constraint add/remove and every drag, call `analyzeDoF` and color entities accordingly. This closes the biggest UX gap with professional CAD without touching the core PBD loop.

**Priority 2: Sketch→solid parametric link (3 weeks)**

The missing link between a sketch (document entities + constraints) and a solid that was extruded from it. Right now the extrude stores a point snapshot; it should store a reference to the sketch entities.

Add a `sketchRef` to `Solid3D.features[0]`:

```typescript
// Instead of storing points directly:
features[0] = {
  type: 'Extrude',
  parameters: {
    primitiveType: 'extrude',
    points: [...],        // ← copy at creation time (current)
    sketchEntityIds: ['line_1', 'line_2', 'arc_3'],  // ← add this
    height: 20,
  },
  isActive: true
}
```

In `Solid3DReevaluator.reevaluate()`, when `sketchEntityIds` is present, read the current coordinates from those entities instead of the stored `points[]`. Now when you move a sketch line and call reevaluate, the solid rebuilds from the live entity geometry.

Trigger: add a `REGEN` command (already exists as `RegenCommand.ts`) and wire it to call `Solid3DReevaluator.reevaluate()` for all solids whose `sketchEntityIds` reference any entity that changed.

```typescript
// In app.ts, after any entity transform that touches constrained entities:
if (this.doc.constraints.length > 0) {
  await this.reevaluateSketchDrivenSolids();
}

private async reevaluateSketchDrivenSolids(): Promise<void> {
  const changedEntityIds = new Set(this.recentlyChangedEntityIds);
  for (const entity of this.doc.entities.values()) {
    if (!(entity instanceof Solid3D)) continue;
    const base = entity.features[0];
    if (!base?.parameters.sketchEntityIds) continue;
    const refs: string[] = base.parameters.sketchEntityIds;
    if (refs.some(id => changedEntityIds.has(id))) {
      const geom = await Solid3DReevaluator.reevaluate(entity, this.doc.facetres, this.doc);
      this.viewer.updateSolid3DGeometry(entity.id, geom);
    }
  }
}
```

This gives the first live sketch-drives-solid parametric update without building the global DAG.

**Priority 3: Global DAGStore for cross-solid dependencies (4 weeks)**

The full `DAGStore` + `RegenEngine` from the post-GCS roadmap. This is needed when:
- A boolean solid needs to update when either input solid changes
- A sketch on a solid's face needs to re-solve when that face moves (in-context editing)
- The history tree UI needs to show the full model history as a list

At the current architecture level, this can be built as a layer on top of the existing `Solid3D.features[]` system. Each `Solid3D` becomes a DAG node. The DAG edges come from `inputRefs` (the solid IDs used in boolean operations, the `sketchEntityIds` in sketch-driven features). The `RegenEngine` walks the DAG in topological order and calls `Solid3DReevaluator.reevaluate()` for each dirty node.

This is the minimal DAG that bridges the current per-solid system to the full cross-solid parametric chain without a full rewrite.

**Priority 4: History tree UI (2 weeks)**

The `PropertiesWindow` features tab shows the features for one selected solid. The history tree shows the full DAG across all solids. Given the per-solid `features[]` that already exists, the history tree can be built as a flat list of all solids in creation order, each expandable to show their features.

This is the UI that makes the per-solid feature system navigable and the DAG regen tangible to the user.

---

### One-page summary

```
Current state:
  ✓  PBD constraint solver wired to document entities
  ✓  SketchToolWindow with constraint apply/list UI
  ✓  Solid3D.features[] per-solid feature list
  ✓  Solid3DReevaluator replays single solid's feature chain
  ✓  PropertiesWindow features tab with edit+reevaluate
  ✗  No DoF coloring (blue/green/red)
  ✗  No sketch→solid live parametric link (snapshot only)
  ✗  No cross-solid DAG (boolean result detached from inputs)
  ✗  No history tree UI

Build next in order:
  1.  DoF analysis via Jacobian rank (2 weeks)
      Adds blue/green/red coloring to existing PBD solver
      No architectural change — pure additive

  2.  Sketch→solid live link via sketchEntityIds (3 weeks)
      Extrude/Revolve/Sweep store entity references
      Solid3DReevaluator reads live coords from them
      REGEN command triggers reevaluation on entity change

  3.  Global DAGStore wrapping Solid3D nodes (4 weeks)
      Enables boolean solids to track their inputs
      RegenEngine walks dag.nodes[] in topological order
      Each node calls Solid3DReevaluator.reevaluate()

  4.  History tree UI (2 weeks)
      Flat list of all solids + expandable feature sublists
      Rollback bar freezes solids below it
      Double-click opens feature edit dialog
```