In this doc. WebCAD will imitate CATIA object rendering

CATIA has a precise visual language for every object state. Each state is a distinct render pass with specific material properties, draw order, and compositing rules. Understanding the full system is what separates a CAD renderer from a general 3D app renderer.

---

## The state machine

Every object in CATIA exists in exactly one primary state at any time, with secondary overlay states that can stack on top.

```
Primary states (mutually exclusive):
  NORMAL → PRESELECTED → SELECTED → SELECTED+PRESELECTED

Secondary overlays (can stack on any primary state):
  HIDDEN / NO_SHOW
  GHOSTED (in assembly context)
  ACTIVE COMPONENT (in assembly)
  IN_ERROR (failed regen)
  FROZEN (below rollback bar)
```

---

## Primary state rendering

### Normal

The baseline state. Nothing special — just the object's material at full opacity.

CATIA V5 uses a fixed ACI-style color system tied to layer color by default, but the rendered appearance depends on the active **Visual Properties**:

- **Shading mode:** Flat, Gouraud, or Phong depending on user preference
- **Edge display:** Edges always drawn on top of shaded faces as a separate pass, in a slightly darker version of the face color or a fixed dark gray
- **Backface:** Back faces rendered in a slightly darker shade to give depth cues on thin shells

The edge pass is important — CATIA never relies on the face shading alone to communicate shape. Edges are a separate draw call with a depth offset (`glPolygonOffset` equivalent) so they don't z-fight with faces.

```
Render order for NORMAL solid:
  1. Draw faces (shaded, depth write on)
  2. Draw edges (line pass, depth offset, depth test on)
```

### Preselected (hover)

The object the cursor is currently over, before any click. The single most important interactive state because it's active 100% of the time the user is navigating.

**Color:** Orange — specifically `rgb(255, 140, 0)`, not yellow, not red. This specific orange is CATIA's brand color for interactivity and users recognize it instantly.

**Implementation:** Not a material swap — CATIA renders the preselected object twice:
1. Normal pass (keeps the object's own material visible)
2. Highlight pass — the same geometry rendered as a slightly expanded shell (vertex normal offset) or as an overlay at reduced opacity

The overlay approach means the object's own color is still visible underneath the orange tint. It reads as "this thing is highlighted" not "this thing has changed color."

**Edge highlight:** Only the edges belonging to the hovered topology level highlight, not the whole object. If selection filter is set to "edge," only the hovered edge goes orange. If filter is "face," only the face boundary edges highlight. The rest of the solid stays normal.

**Cursor:** Changes shape simultaneously — a small topology icon appears next to the arrow cursor (a square for face, a line for edge, a dot for vertex).

### Selected

Confirmed click. The object stays selected until explicitly deselected.

**Color:** Green — `rgb(0, 215, 0)` approximately. Fully replaces the object's own color (unlike preselection which overlays).

**Implementation:** Full material override on the selected topology. For a solid with a face selected, that face renders green, the rest of the solid renders normal. For a whole-body selection, the entire mesh goes green.

**Edge behavior:** Selected edges render thicker (2–3px vs 1px for normal edges) and in a darker green.

**Multi-select:** Each newly selected item goes green. There is no visual distinction between "first selected" and "subsequent selected" items — they're all the same green. The order matters to the command (fillet selects one face then another) but the visual doesn't show order.

### Selected + Preselected simultaneously

When the cursor hovers over an already-selected object. CATIA renders this as orange-on-green — the preselect orange takes visual priority. This communicates "you can interact with this selected thing further" (e.g. drag a grip, open context menu).

---

## Secondary overlay states

### Hidden / No-Show

CATIA distinguishes two kinds of invisible:

**Space (normal space):** The object exists and is visible.

**No-Show space:** The object is hidden. It does not render in the main viewport at all. The user switches to "No-Show" via a toggle, which shows a grayed-out ghost of all hidden objects. Selecting from No-Show space makes an object visible again.

This is not the same as `visible = false` in Three.js. No-Show is a mode toggle on the viewport, not a per-object flag that's checked silently. Users intentionally enter the No-Show view to manage hidden objects.

**Implementation note for WebCAD:** The `layer.visible` flag covers most of this. But CATIA's per-object hide (independent of layer) needs a separate `entity.visible` flag that survives layer visibility changes.

### Ghosted (assembly context)

In assembly mode when one component is active, all other components render ghosted:

- Faces: ~15% opacity, same hue as their normal color
- Edges: ~25% opacity
- `depthWrite: false` so ghosted geometry doesn't occlude the active component
- Still raycasted for selection (you can click a ghosted component to activate it)

This is a three-layer render:

```
Render order in assembly mode:
  1. Draw ghosted components (transparent, depthWrite off, depthTest on)
  2. Draw active component normally (opaque, depthWrite on)
  3. Draw active component edges
  4. Draw selection highlights on top
```

The ghosted components rendering before the active component is deliberate — the active component occludes the ghosts, giving a strong spatial reading of which component is "in front."

### In-Error state

When a feature fails to regen (broken topological reference, invalid geometry, etc.), the downstream features render with a red-orange stipple or hatching overlay. They are still visible as geometry but clearly marked as invalid.

CATIA also shows a red exclamation badge on the feature tree node. The last successful geometry is shown as a placeholder — the model doesn't collapse to nothing, it shows what it was before the failure.

**For WebCAD:** This matters because when you implement the parametric DAG, failed nodes must not crash the entire model. Show the last-good geometry with a red overlay material.

### Frozen / Below rollback bar

Features below the rollback bar don't execute — they render as if they don't exist. Features above the bar render normally. There is no special "frozen" visual, they're just absent.

However, the rollback boundary itself is visualized — a subtle blue plane or annotation in the tree showing where history execution stopped.

---

## Rendering modes (user-selectable)

These are global viewport modes that change how all normal-state geometry renders:

### Wireframe

Only edges, no faces. No depth sorting on edges — all edges visible regardless of occlusion. Used for understanding complex geometry where shading obscures internal structure.

```
Render: edges only, no depth cull on back edges
```

### Shading (Gouraud)

Smooth vertex-normal interpolation. The standard working mode. Edges still drawn as a separate pass.

### Shading with Edges

Gouraud faces + edge pass. The most common CATIA working mode. The edge pass uses `polygonOffset` to prevent z-fighting.

### Shading with Material

Adds specular highlights and a simplified physically-based look. Used in presentation screenshots. The viewport slows slightly.

### Wireframe with Hidden Line Removal (HLR)

The most technically demanding mode. Visible edges only — edges behind faces are removed (not just hidden by depth test, actually not rendered). This requires a CPU-side or geometry-shader visibility test, not just the GPU depth buffer. The result looks like a technical drawing.

CATIA caches the HLR result and only recomputes when geometry changes.

**For WebCAD:** Skip true HLR for now. A reasonable approximation is edges with `depthTest: true` (hidden edges simply fail the depth test). True HLR — where silhouette edges of curved surfaces are computed — is a substantial separate system.

### Realistic (ray-traced)

CATIA V6/3DEXPERIENCE has a real-time ray tracer (Iray integration) for final visualization. Not relevant for WebCAD's current stage.

---

## The edge rendering system in detail

CATIA's edge rendering is more sophisticated than a single line pass. There are four distinct edge categories, each rendered separately:

| Edge type | Description | Default rendering |
|---|---|---|
| **Smooth edges** | Where two faces meet at a continuous angle (G1+) | Not shown by default — optionally shown as thin gray |
| **Sharp edges** | Where faces meet at a discontinuous angle | Always shown, 1px, object color or dark gray |
| **Boundary edges** | Naked edges (open shells, holes) | Shown, slightly thicker, often in a different color |
| **Silhouette edges** | Contour edges of curved surfaces (not topological, generated) | Shown in real time, recomputed as camera moves |

Silhouette edges are the hardest. They're not stored in the B-Rep — they're computed as the set of points on a curved surface where the surface normal is perpendicular to the view direction. For a cylinder viewed from the side, the silhouette is the two vertical lines, but rotating the view changes them continuously.

**For WebCAD:** Sharp edges and boundary edges are approximable from the tessellation. Smooth edges need a dihedral angle check per edge. Silhouette edges on curved surfaces need either a geometry shader or a CPU precomputation pass — defer this until after the B-Rep edge extraction from OCC is solid.

---

## Depth compositing and render order

CATIA uses a strict render order to avoid z-fighting and ensure the right things appear on top:

```
Layer 0  — Background (gradient or solid color)
Layer 1  — 3D Geometry: opaque faces (normal state), depth write ON
Layer 2  — 3D Geometry: ghosted/transparent faces, depth write OFF
Layer 3  — 3D Edges (separate draw call, polygon offset)
Layer 4  — Preselect highlight (overlay pass, depth test ON)
Layer 5  — Select highlight (overlay pass, depth test ON)
Layer 6  — Grip handles, gizmos (depth test OFF — always on top)
Layer 7  — Snap indicators (depth test OFF, always on top)
Layer 8  — Dimension annotations, text (screen space)
Layer 9  — 2D overlay (compass, triad, UI chrome)
```

Layers 6–9 use `depthTest: false`. Everything below that respects depth. This is why a grip handle is always visible even if it's inside the solid — it renders after the depth buffer is written and ignores it.

**Current WebCAD gap:** The existing code mixes `depthTest` settings inconsistently across preview objects, selection highlights, and gizmos. Formalizing this render order as a documented constant in `Viewer.ts` would clean up a lot of the z-fighting issues that will appear when snapping and gripping are added.

---

## Material system — what drives the face color

In CATIA, a face can get its color from four sources, in priority order:

```
1. Selection/preselection state override  (highest priority)
2. Feature-level override (e.g. color applied to a specific face via properties)
3. Body-level material (assigned in Part Design)
4. Layer color (fallback)
```

For WebCAD's current ACI layer-color system, only levels 1 and 4 are active. The implementation path to level 2 and 3 is:

- Per-entity `properties.color` already exists on `Entity` — use it as level 2
- A `Material` object on `Solid3D` (diffuse, specular, roughness) as level 3
- Layer color as the fallback (current behavior)

When rendering, the `Viewer` checks in that priority order.

---

## The highlight shader — how CATIA's orange actually works

CATIA doesn't change the mesh material for preselection. Instead it renders a **highlight shell** — the same mesh, drawn second, with:

- Vertices offset slightly along their normals (`position += normal * offset`)
- Solid orange color, no lighting
- Front-face only (`cullFace: BACK` on the offset mesh, which shows the outer shell)
- `depthTest: true`, `depthWrite: false`

This technique — sometimes called "inverted hull" or "rim highlight" — is why CATIA's highlight doesn't change the apparent material of the object. The original mesh renders normally; a slightly larger orange ghost renders behind it.

In Three.js:

```typescript
function makeHighlightMesh(
  source: THREE.Mesh,
  color: number,     // 0xff8c00 for preselect, 0x00d700 for select
  offset: number     // world units, e.g. 0.02
): THREE.Mesh {

  const highlightMat = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      offset: { value: offset },
    },
    vertexShader: `
      uniform float offset;
      void main() {
        vec3 newPosition = position + normal * offset;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,   // render inside-out so only the offset shell shows
    depthWrite: false,
    depthTest: true,
  });

  const mesh = new THREE.Mesh(source.geometry, highlightMat);
  mesh.matrix.copy(source.matrix);
  mesh.matrixAutoUpdate = false;
  return mesh;
}
```

Usage:

```typescript
// On hover:
const highlight = makeHighlightMesh(hoveredMesh, 0xff8c00, 0.04);
highlight.name = 'preselect_highlight';
this.scene.add(highlight);

// On click (selected):
const highlight = makeHighlightMesh(selectedMesh, 0x00d700, 0.04);
highlight.name = 'select_highlight';
this.scene.add(highlight);

// Cleanup:
const old = this.scene.getObjectByName('preselect_highlight');
if (old) this.scene.remove(old);
```

The offset value (0.04) needs to scale with camera distance for orthographic cameras — same pattern as the snap indicator scaling in the gripping implementation.

---

## Edge selection highlight

When an edge is preselected or selected, CATIA thickens and recolors that specific edge. In Three.js this requires `Line2` from `three/examples/jsm/lines/Line2` (which already exists in Viewer.ts) since native `THREE.Line` has fixed 1px width on most GPUs.

```typescript
function highlightEdge(
  points: THREE.Vector3[],
  color: number,
  linewidth: number
): Line2 {

  const geo = new LineGeometry();
  geo.setPositions(points.flatMap(p => [p.x, p.y, p.z]));

  const mat = new LineMaterial({
    color,
    linewidth,           // in world units when worldUnits: true
    depthTest: true,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  });
  mat.resolution.set(window.innerWidth, window.innerHeight);

  return new Line2(geo, mat);
}

// Preselect edge: orange, 3px
// Select edge: green, 3px
// Normal edge: dark gray, 1px
```

---

## Implementation plan for WebCAD

These are ordered by impact, not complexity. Each builds on the previous.

### Phase 1 — Formalize render order (1–2 days)

Define render layers as constants in `Viewer.ts`:

```typescript
const RENDER_ORDER = {
  FACES_OPAQUE:    0,
  FACES_GHOSTED:   1,
  EDGES:           2,
  PRESELECT:       3,
  SELECT:          4,
  GRIPS:           5,
  SNAP_INDICATOR:  6,
  ANNOTATIONS:     7,
} as const;
```

Go through every `new THREE.Mesh` / `new Line2` call in `Viewer.ts` and assign `renderOrder` from this table. Fix `depthWrite` / `depthTest` to match the layer semantics. This alone will eliminate most z-fighting.

### Phase 2 — Inverted hull highlight shader (2–3 days)

Replace the current color-swap selection highlighting with the inverted hull approach. Add `makeHighlightMesh()` to `Viewer.ts`. Call it from `setHovered()` and `setSelected()`. The visual change is immediately noticeable — selected objects look like they're glowing instead of turning a flat color.

### Phase 3 — Edge categorization (3–4 days)

When adding a solid's mesh to the scene, extract and categorize its edges:

- Compute dihedral angle per edge from face normals
- Edges below a threshold (e.g. 5°) → smooth edge, don't render by default
- Edges above threshold → sharp edge, render at 1px
- Naked edges (boundary) → render at 1.5px, slightly lighter color

Store edge lists on `mesh.userData.sharpEdges`, `mesh.userData.boundaryEdges`. The snap system from Part 1 already reads `mesh.userData` so the pattern is consistent.

### Phase 4 — Topology-level highlight (4–5 days)

When `selectionFilter` targets edges (from the command-driven filter in the earlier list), preselection should highlight only the hovered edge, not the whole solid. This requires:

- During hover, raycast against the edge line objects (not the face mesh)
- Find the nearest edge line within screen tolerance
- Highlight that edge with `highlightEdge()` at orange
- Leave the face mesh normal

This closes the gap between WebCAD's current "whole object highlights" and CATIA's "topology-level highlights."

### Phase 5 — Ghosted assembly mode (deferred)

Implement after assembly support exists. The render pass order is already established in Phase 1 so adding the transparent pass is a matter of setting `opacity` and `depthWrite: false` on the right objects.

---

## What this looks like in the Viewer render pipeline

After all phases, the `render()` method in `Viewer.ts` conceptually works like this:

```
1. Clear buffers

2. OPAQUE PASS (depthWrite on, depthTest on)
   - All solid faces (normal state)
   - Active component faces (assembly mode)

3. TRANSPARENT PASS (depthWrite off, depthTest on)
   - Ghosted component faces
   - Preview/ghost geometry (command preview)

4. EDGE PASS (depthWrite off, depthTest on, polygonOffset)
   - Sharp edges for all visible solids
   - Boundary edges

5. HIGHLIGHT PASS (depthWrite off, depthTest on)
   - Preselect inverted hull (orange)
   - Select inverted hull (green)
   - Highlighted edges (Line2, thickened)

6. ALWAYS-ON-TOP PASS (depthWrite off, depthTest off)
   - Grip spheres
   - Snap indicators
   - Gizmo handles
   - Compass triad

7. SCREEN-SPACE PASS
   - Dimension annotations
   - Snap type label (e.g. "Midpoint")
   - Coordinate readout
```

The current `Viewer.ts` doesn't have this separation — render calls are spread through rendering methods without a clear compositing order. Formalizing this as a structured pipeline is the highest-leverage rendering improvement you can make, and it's what makes every subsequent visual feature (grips, snapping, assembly ghosting, HLR) slot in cleanly without z-fighting regressions.