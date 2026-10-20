# Replacing OutlineEffect with fat edge lines

**Ticket:** WEBCAD-174 (Phase C4) — blocker for WEBCAD-169 (Phase D1)
**Date:** 2026-10-20
**Status:** Approved design, ready for implementation planning

## Problem

Every shaded solid in the viewport is outlined by `OutlineEffect`
(`three/examples/jsm/effects/OutlineEffect.js`, constructed at `Viewer.ts:261`).
It is a WebGL-only addon: it takes a `WebGLRenderer`, keys a private material
cache on that renderer's internals, and re-renders the scene with inverted-hull
materials. It cannot be pointed at a `WebGPURenderer`, and it is the only place
the `RendererBackend` seam is deliberately broken — via
`this.renderer as unknown as THREE.WebGLRenderer` and a `effect!: any` field.

The outlines are not decoration. `createSolid3DObject()` creates every solid's
per-edge geometry with `opacity: 0.0` (`Viewer.ts:2113-2116`); the per-edge lines
exist for raycast picking only. `highlightEdge()` turns exactly one of them
orange (`0xffa500`). So **the visible black edges come entirely from
`OutlineEffect`**, and they are the affordance that tells a user which edges can
be chamfered, filleted or trimmed. Removing the effect without a replacement
leaves a shaded surface with nothing to aim at.

Phase D1 cannot land until this is replaced with something that works on both
backends.

## Decision

Use **fat lines** (`LineSegments2` + `LineSegmentsGeometry`) as the visible edge
layer, with one draw call per solid, and delete `OutlineEffect`.

Rejected alternatives:

- **Post-process outline pass on WebGPU only.** Leaves WebGL untouched, but a
  post-process outline detects silhouettes and depth discontinuities — not every
  pickable BRep edge. It would weaken the affordance the ticket exists to
  protect, and leave two implementations that drift.
- **Shared node pipeline on both backends.** One outline pass for both, and the
  same pass GTAO (WEBCAD-52) needs, but it moves the WebGL path onto
  `WebGPURenderer` (`forceWebGL`), dragging the seam, capture, antialiasing and
  every effect into one ticket.
- **Crisp 1px vector edges** (the ticket's third option). Backend-neutral and
  nearly free, but rejected on requirement: edges must keep visible weight at
  any zoom, not thin to a hairline.

Fat lines win because the requirement is "every selectable edge, drawn with
weight". That is an edge-drawing problem, not a silhouette problem, and
`LineSegments2` is the official three.js answer on both backends.

## Architecture

### Geometry: one object per solid

Build a single `LineSegmentsGeometry` per solid from the same `entity.edgeLines`
the viewer already consumes:

- Each BRep polyline is expanded into segment pairs: `p0→p1`, `p1→p2`, …
- The `EdgesGeometry` fallback path (`Viewer.ts:2138`) supplies position pairs
  directly.
- Degenerate polylines (fewer than two points) are skipped, not emitted as
  zero-length segments.

One draw call per solid rather than one per edge, because a filleted solid
carries dozens of BRep edges and per-edge objects multiply draw calls for no
benefit.

Build-time bookkeeping records `edgeRanges: { edgeIndex, start, count }[]` so a
single topological edge can be addressed inside the shared buffer.

### Materials: two classes behind one seam

`RendererBackend.ts` gains a factory:

```ts
createEdgeMaterial(kind: RendererKind, opts: EdgeMaterialOptions): EdgeMaterialHandle

interface EdgeMaterialHandle {
  material: LineMaterial | Line2NodeMaterial;
  setResolution(width: number, height: number): void;
}
```

- `webgl` → `LineMaterial` (`three/addons/lines/LineMaterial`), whose
  `resolution` uniform must be written explicitly and re-written on every resize
- `webgpu` → `Line2NodeMaterial` (exported from `three/webgpu`) drawing
  `three/addons/lines/webgpu/LineSegments2`; it has **no `resolution` property**
  (it inherits `LineDashedMaterial` defaults and the node renderer supplies
  screen size), so `setResolution` is a no-op

That asymmetry is exactly why the factory returns a handle rather than a bare
material: `Viewer.resize()` calls `handle.setResolution(w, h)` and never branches
on backend. Callers otherwise use the shared surface (`color`, `linewidth`,
`opacity`, `transparent`, `depthTest`), and `Viewer` already holds
`_rendererInfo.kind`.

### Picking: unchanged

The existing thin `THREE.Line` objects stay exactly as they are — `opacity: 0`,
`userData.edgeIndex`, built from `entity.edgeLines`. They remain the raycast
targets, so `Selection3DEngine` and the edge-selection e2e coverage are
untouched. The fat layer is display-only.

This duplication is deliberate: rewriting picking onto `raycaster.params.Line2`
would put a well-tested code path at risk for no functional gain. Revisiting it
belongs with WEBCAD-172 (GPU picking), not here.

### Highlight: one source of truth, two renderings

`highlightEdge()` keeps mutating the thin lines exactly as today, then writes the
same state into the fat layer: all segments black, the target edge's segment
range orange, via the geometry's colour attribute and `needsUpdate`. No geometry
is rebuilt — hover and selection changes are attribute writes.

### Hazard: `LineSegments2` extends `Mesh`

`LineSegments2` is a `Mesh` subclass, so every existing `instanceof THREE.Mesh`
traversal in `Viewer` will treat the fat edge layer as a solid. Tag it
`userData.type = 'EdgeOutline'` and add guards at the three sites that would
otherwise corrupt it:

| Site | Today's behaviour | Effect on fat lines |
|---|---|---|
| `setShadingMode()` (`Viewer.ts:567`) | swaps in `getMeshMaterial()` for every untagged mesh | **destroys the `LineMaterial`** — required guard |
| `tintEntityLines()` (`Viewer.ts:4429`) | resets mesh/line colours to the layer colour | paints edges in layer colour instead of black — skip |
| `setEntityOpacity()` (`Viewer.ts:3650`) | sets `transparent`/`opacity` on all meshes | *intentional*: ghosted solids ghost their edges too |

There is precedent for this: `setShadingMode()` already excludes
`userData.type === 'Edge'`. The fat layer follows that pattern.

Two consequences worth stating explicitly:

- Teardown needs no change — `removeObject()` (`Viewer.ts:3589`) and `clear()`
  already dispose any `THREE.Mesh`, which now includes the fat layer.
- `raycast` is overridden to a no-op so the display layer can never be picked;
  picking stays on the thin lines described above.

## Behaviour

| Property | Value |
|---|---|
| Width | 2 px, screen space (constant at any zoom) |
| Colour | `#000000`, unlit; selected edge `#ffa500` |
| Resolution | Refreshed through `EdgeMaterialHandle.setResolution()` in `Viewer.resize()` (no-op on WebGPU) |
| Depth | `depthTest: true`, `depthWrite: false`, drawn after the mesh |
| Visible in | `SHADED`, `ZEBRA` (unchanged from today) |
| Not visible in | `WIREFRAME`, `PHONG`, `BLINN` (unchanged from today) |

**Lifecycle:** no new teardown code. `removeObject()` and `clear()` already
dispose every `THREE.Mesh` child, and the fat layer is one; keeping the layer
inside the solid's group is therefore the only requirement.

**Z-fighting:** verify first, then bias. The fat lines sit exactly on the mesh
surface, so the implementation starts with `depthTest: true`, `depthWrite:
false` and no offset; if a box, cylinder or filleted box shows stitching, apply
`polygonOffset` on the material, and only then fall back to `renderOrder` plus a
camera-space depth bias. The chosen mechanism is recorded with the comparison
screenshots.

**Budget:** one draw call per solid for edges. Deleting `OutlineEffect` also
removes one extra full-scene render per shaded frame, so net frame cost should
fall. Recorded as measured numbers on a 10-solid scene, not as a claim.

## Testing

**Unit (Vitest), written first.** The only real logic is buffer construction, so
it gets pure functions:

- `buildEdgeSegments(edgeLines)` → `{ positions, edgeRanges }`
- `buildEdgeColors(edgeRanges, selectedEdgeIndex)` → colour buffer

Cases: polyline expansion (`p0→p1→p2` becomes two segments), the `EdgesGeometry`
fallback, degenerate polylines, and that every `edgeIndex` maps to a contiguous
range that addresses exactly its own segments.

A guard test covers the `Mesh`-inheritance hazard directly: after
`setShadingMode('PHONG')` and back to `'SHADED'`, the edge object's material is
still the line material and not a `MeshPhongMaterial`. This is the regression
that would otherwise ship silently as "edges turned into white surfaces".

**E2E (bridge).** Fill the proxy gap found during the audit: add
`setShadingMode(mode)` / `getShadingMode()` to `TestBridge` and the Playwright
driver, so a spec can pin `SHADED` without a command string. Then assert
semantically: the solid exposes 12 edges, `selectEdge()` reports the selected
edge, `pickAt()` still resolves it. Colour stays out of the semantic layer.

**Visual.** New opt-in `edges.spec.ts` under `WEBCAD_VISUAL=1` with before/after
baselines (OutlineEffect vs fat lines), plus a manual WebGPU parity run
(`?renderer=webgpu`) — headless CI has no adapter, so WebGPU cannot be gated.
These screenshots are the comparison artifact WEBCAD-174's acceptance requires.

**Performance.** Draw calls and frame time, 10-solid scene, before and after.

## Rollout

1. Behind `?edges=classic|fat`, defaulting to `classic`, so both looks can be
   screenshotted from one build.
2. Flip the default to `fat` once the comparison is accepted.
3. Delete the flag, `OutlineEffect`, the cast and the `effect` field in a final
   commit. `renderNow()` collapses to a plain `renderer.render(scene, camera)`.

Each step is independently reviewable and reversible.

## Non-goals

- WebGL context-loss recovery. A genuine gap the WebGL guidance calls out, but
  orthogonal to this ticket; file separately.
- Wide lines on 2D entity linework, dimensions or the sketch layer. The existing
  `LineBasicMaterial` entities elsewhere are untouched.
- Outlines in `PHONG`/`BLINN`.
- Replacing CPU edge picking.

## Board updates (same PR)

- Close WEBCAD-174, attaching the before/after comparison.
- Move WEBCAD-166 (Phase C1, zebra → TSL) back to Backlog: it is marked
  *started* but `ZebraTSL.ts` was deleted in Phase B2/C3 and no work survives.
- Replace the stale "blocked on the three.js upgrade (WEBCAD-164)" reason text in
  `chooseRenderer()` — WEBCAD-164 is complete; only this ticket blocked WebGPU.
- Update the README rendering section, which currently states that
  `OutlineEffect` draws every shaded frame.

## Acceptance criteria

- No import of `OutlineEffect`; no `as unknown as THREE.WebGLRenderer`; `effect`
  is gone from `Viewer`.
- `expectRenderer('webgl')` still passes; the edge layer is built from the
  backend-aware material factory.
- A shaded solid shows all edges at 2 px; selecting an edge turns exactly that
  edge orange and leaves the rest black.
- Switching shading modes round-trips without replacing the edge material.
- `setShadingMode`/`getShadingMode` exist on the bridge, and the edge-selection
  e2e spec passes unchanged.
- Before/after screenshots recorded on a box, a cylinder and a filleted box.
- Draw calls and frame time recorded for the 10-solid scene.
- All existing tests pass: `npm test`, `npm run typecheck`, `npm run lint`,
  `npm run build`.
