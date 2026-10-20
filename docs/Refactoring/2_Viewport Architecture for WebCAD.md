# Viewport Architecture for WebCAD

A proper viewport architecture is one of the most important milestones in transforming WebCAD from a drawing application into a real CAD platform.

Professional CAD systems like AutoCAD, FreeCAD, and SolidWorks separate:

* document/model
* viewport
* rendering
* interaction state

into different systems.

---

# Core Concept

A viewport is NOT just a camera.

A viewport is:

```text
Viewport
 ├── camera
 ├── projection mode
 ├── render target
 ├── visual style
 ├── interaction state
 ├── snapping state
 ├── grid state
 ├── UCS
 ├── layer overrides
 ├── selection state
 └── renderer pipeline
```

Each viewport can show the SAME document differently.

Example:

| Viewport    | Mode        |
| ----------- | ----------- |
| Top         | Wireframe   |
| Front       | Hidden Line |
| Perspective | Shaded      |
| Layout      | Paperspace  |

---

# Recommended Architecture

# 1. Viewport Manager

Central manager for all viewports.

```text
ViewportManager
 ├── activeViewport
 ├── viewport list
 ├── layout engine
 ├── focus management
 └── synchronization
```

---

## Responsibilities

### Create Viewports

```ts
createViewport(type: 'top' | 'front' | 'perspective')
```

---

### Destroy Viewports

```ts
removeViewport(id)
```

---

### Activate Viewport

```ts
setActiveViewport(id)
```

---

### Resize/Split Layout

```ts
splitViewport(horizontal)
splitViewport(vertical)
```

---

# 2. Viewport Class

Core object.

---

## Suggested Structure

```ts
class Viewport {
    id: string;

    canvas: HTMLCanvasElement;

    camera: Camera;

    renderer: Renderer;

    controller: ViewportController;

    visualStyle: VisualStyle;

    projectionMode: ProjectionMode;

    grid: GridSettings;

    snap: SnapSettings;

    ucs: UCS;

    layers: LayerViewportState;

    selectionState: SelectionState;

    renderPipeline: RenderPipeline;
}
```

---

# 3. Camera System

You need TWO camera families.

---

# Orthographic Camera

For drafting.

```ts
THREE.OrthographicCamera
```

Used in:

* Top
* Front
* Side
* Isometric drafting

---

## Why Orthographic Matters

CAD drafting requires:

* accurate dimensions
* no perspective distortion
* engineering precision

Without orthographic mode:
CAD becomes unusable for drafting.

---

# Perspective Camera

For 3D visualization.

```ts
THREE.PerspectiveCamera
```

Used for:

* 3D orbit
* walkthrough
* realistic previews

---

# Recommended Camera Wrapper

```ts
class CadCamera {
    type: 'orthographic' | 'perspective';

    threeCamera: THREE.Camera;

    target: Vector3;

    zoom: number;

    orbitEnabled: boolean;

    panEnabled: boolean;
}
```

---

# 4. Viewport Controller

Controls interaction.

---

## Responsibilities

```text
ViewportController
 ├── mouse events
 ├── wheel zoom
 ├── pan
 ├── orbit
 ├── selection
 ├── drag
 ├── snapping
 └── gesture support
```

---

## Example

```ts
onMouseMove(event)
onMouseDown(event)
onWheel(event)
```

---

# IMPORTANT

Interaction logic MUST NOT live inside renderer.

This is a major mistake in many hobby CAD systems.

Correct separation:

```text
Input
 → ViewportController
 → Command System
 → Document
 → Renderer
```

---

# 5. Render Pipeline

Do NOT render directly inside viewport.

Instead:

```text
Viewport
  → RenderPipeline
      → Passes
```

---

# Suggested Pipeline

```text
RenderPipeline
 ├── GeometryPass
 ├── HiddenLinePass
 ├── SelectionPass
 ├── OverlayPass
 ├── GridPass
 ├── GizmoPass
 └── UIPass
```

---

# Why This Matters

Later you will need:

* hidden-line rendering
* xray
* selection outline
* SSAO
* shadows
* technical illustration
* overlay dimensions

Without render passes:
renderer becomes spaghetti.

---

# 6. Visual Styles

CAD systems support multiple styles.

---

## Suggested Enum

```ts
enum VisualStyle {
    Wireframe,
    HiddenLine,
    Shaded,
    ShadedWithEdges,
    XRay
}
```

---

# 7. Viewport Layout System

You need split views.

---

## Common CAD Layouts

### Single

```text
+--------+
|        |
|   3D   |
|        |
+--------+
```

---

### Vertical Split

```text
+----+----+
|Top |3D  |
+----+----+
```

---

### Quad View

```text
+----+----+
|Top |Front|
+----+----+
|Left|3D   |
+----+----+
```

---

# Recommended Layout Tree

```ts
class ViewportLayoutNode {
    type: 'split' | 'leaf';

    splitDirection?: 'horizontal' | 'vertical';

    ratio?: number;

    children?: ViewportLayoutNode[];

    viewport?: Viewport;
}
```

This allows recursive docking layouts.

---

# 8. Coordinate Systems

Each viewport may have different UCS.

---

# World Coordinate System (WCS)

Global coordinates.

```text
X Y Z
```

---

# User Coordinate System (UCS)

Per-viewport orientation.

```text
Viewport A → top UCS
Viewport B → rotated UCS
```

Essential for advanced drafting.

---

# 9. Grid System

Grid belongs to viewport.

NOT document.

---

## Why?

Different viewports may have:

* different zoom
* different spacing
* different orientation

---

## Suggested Grid

```ts
class GridSettings {
    enabled: boolean;

    spacing: number;

    adaptive: boolean;

    snapEnabled: boolean;

    majorLineEvery: number;
}
```

---

# 10. Snap State

Each viewport should manage snap state.

---

## Snap Modes

```text
ENDPOINT
MIDPOINT
CENTER
QUADRANT
INTERSECTION
PERPENDICULAR
TANGENT
NEAREST
GRID
```

---

# 11. Selection System

Selections should be viewport-aware.

---

# Important Distinction

```text
Document Selection
vs
Viewport Highlight
```

Example:

Entity selected globally,
but only highlighted in active viewport.

---

# 12. Overlay Rendering

Overlays must be separate from geometry.

---

## Overlay Examples

* selection rectangle
* crosshair
* dimensions
* command previews
* grips
* gizmos
* rubberband line

---

## Recommended

Use separate overlay scene:

```ts
mainScene
overlayScene
uiScene
```

---

# 13. Performance Architecture

Critical for CAD.

---

# Recommended Strategy

## Static Geometry Buffers

Most CAD geometry rarely changes.

Use:

```text
BufferGeometry
Instancing
Geometry cache
```

---

# Dynamic Layers

Separate:

```text
static geometry
dynamic previews
temporary command geometry
```

---

# 14. View Frustum Culling

Very important for large drawings.

---

## Recommended

Spatial indexing:

```text
Quadtree (2D)
BVH
Octree (3D)
```

Then render only visible entities.

---

# 15. Multi-Viewport Synchronization

Sometimes viewports synchronize.

---

## Example

Top/Front/Side linked:

```text
cursor position
selection
camera target
```

---

# 16. Rendering Loop

Do NOT constantly rerender everything.

---

# Recommended

```text
dirty flag rendering
```

Only rerender when:

* camera changes
* entity changes
* viewport resized
* selection changed

---

## Example

```ts
if (viewport.isDirty) {
    renderer.render(...)
}
```

This massively improves performance.

---

# 17. Picking Architecture

Picking should NOT use brute-force raycasts on all entities.

---

# Recommended

```text
Screen Point
 → Spatial Index
 → Candidate Entities
 → Precise Intersection
```

---

# 18. Future-Proofing for Paperspace

Eventually:

```text
Model Space
Paper Space
Floating Viewports
```

Architecture should already allow:

```text
Viewport inside layout sheet
```

---

# Recommended Folder Structure

```text
render/
 ├── viewport/
 │    ├── Viewport.ts
 │    ├── ViewportManager.ts
 │    ├── ViewportController.ts
 │    ├── ViewportLayout.ts
 │    ├── CadCamera.ts
 │    └── ViewportState.ts
 │
 ├── pipeline/
 │    ├── RenderPipeline.ts
 │    ├── GeometryPass.ts
 │    ├── OverlayPass.ts
 │    ├── HiddenLinePass.ts
 │    └── SelectionPass.ts
 │
 ├── overlays/
 │    ├── CrosshairOverlay.ts
 │    ├── GripOverlay.ts
 │    ├── SelectionOverlay.ts
 │    └── RubberbandOverlay.ts
 │
 ├── picking/
 │    ├── Picker.ts
 │    ├── RaycastPicker.ts
 │    └── SpatialPicker.ts
 │
 └── cameras/
      ├── OrthographicCadCamera.ts
      └── PerspectiveCadCamera.ts
```

---

# Recommended First Implementation Order

# Phase 1

Implement:

* Viewport class
* Orthographic camera
* Viewport manager
* Single viewport rendering

---

# Phase 2

Implement:

* split views
* quad view
* independent cameras

---

# Phase 3

Implement:

* render passes
* overlays
* selection rendering

---

# Phase 4

Implement:

* hidden line mode
* shaded mode
* perspective viewport

---

# Phase 5

Implement:

* paperspace
* layout tabs
* floating viewports

---

# MOST IMPORTANT DESIGN RULE

Keep these strictly separated:

```text
Document/Data
≠
Viewport
≠
Renderer
≠
Commands
≠
UI
```

This separation is what allows professional CAD systems to scale to millions of entities and decades of feature growth.
