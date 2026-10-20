# Rendering Pipeline Refactor — Detailed WebCAD Plan

Your current renderer appears centralized around something like:

```text
render/Viewer.ts
```

This works initially, but eventually becomes impossible to scale because CAD rendering is fundamentally different from normal game rendering.

CAD requires:

* millions of primitives
* selectable geometry
* precision rendering
* layered redraw
* hidden line rendering
* annotation overlays
* viewport isolation
* paperspace/modelspace
* snapping acceleration
* GPU batching
* partial redraw

A professional CAD renderer is closer to a database-driven graphics pipeline than a game engine.

---

# Target Rendering Architecture

Recommended structure:

```text
render/
├── core/
├── scene/
├── viewport/
├── renderers/
├── pipelines/
├── picking/
├── overlays/
├── materials/
├── cache/
├── batching/
├── text/
├── grid/
├── layers/
├── effects/
└── debug/
```

---

# 1. Rendering Core

## Goal

Centralize low-level GPU operations.

```text
render/core/
 ├── Renderer.ts
 ├── RenderContext.ts
 ├── FrameState.ts
 ├── GPUCapabilities.ts
 └── RenderStats.ts
```

---

## Renderer.ts

Manages:

* Three.js renderer
* frame lifecycle
* render passes
* resize
* GPU settings

Example:

```ts
class Renderer {
    beginFrame()
    renderScene()
    renderOverlay()
    endFrame()
}
```

---

## RenderContext.ts

Stores frame-global state:

```ts
interface RenderContext {
    camera
    viewport
    visibleLayers
    renderMode
    selectionState
    snappingState
}
```

Avoid global singleton state.

---

# 2. Scene Graph Refactor

Current likely:

```text
Viewer → entities → meshes
```

Target:

```text
Document
   ↓
SceneGraph
   ↓
RenderNodes
   ↓
GPU Buffers
```

---

# CAD Scene Graph

```text
scene/
 ├── SceneGraph.ts
 ├── SceneNode.ts
 ├── EntityNode.ts
 ├── BlockNode.ts
 ├── LayerNode.ts
 └── ViewportNode.ts
```

---

# Why CAD Needs Scene Graph

Because CAD entities have:

* transforms
* block nesting
* visibility inheritance
* clipping
* layer overrides
* viewport overrides

---

# Example

```text
BlockReference
 ├── transform
 ├── children
 └── visibility
```

This becomes critical later.

---

# 3. Entity Renderer Abstraction

MOST IMPORTANT REFACTOR.

Instead of:

```ts
if(entity.type === 'LINE')
```

create renderer classes.

---

# Target

```text
renderers/
 ├── IEntityRenderer.ts
 ├── LineRenderer.ts
 ├── CircleRenderer.ts
 ├── ArcRenderer.ts
 ├── PolylineRenderer.ts
 ├── HatchRenderer.ts
 ├── TextRenderer.ts
 ├── MTextRenderer.ts
 ├── DimensionRenderer.ts
 ├── SplineRenderer.ts
 └── BlockRenderer.ts
```

---

# Interface

```ts
interface IEntityRenderer<T> {
    build(entity: T): RenderObject
    update(entity: T): void
    dispose(): void
}
```

---

# Why This Matters

Without this:

* renderer becomes gigantic
* hidden line impossible
* batching difficult
* GPU optimization impossible

With this:

* each entity owns rendering logic
* render modes become modular
* caching becomes easier

---

# 4. RenderObject Layer

VERY IMPORTANT.

Never expose raw Three.js meshes directly.

Instead:

```text
Entity
  ↓
Renderer
  ↓
RenderObject
  ↓
Three.js Meshes
```

---

# Example

```ts
class RenderObject {
    geometry
    material
    bounds
    selectable
    layerId
}
```

This abstraction protects you from engine rewrites later.

---

# 5. Multi-Pass Rendering Pipeline

CAD rendering is NOT one render pass.

You need:

```text
Frame
 ├── Background Pass
 ├── Grid Pass
 ├── Geometry Pass
 ├── Hidden Line Pass
 ├── Selection Pass
 ├── Overlay Pass
 ├── Gizmo Pass
 └── UI Pass
```

---

# Suggested Passes

## Geometry Pass

Draw entities.

---

## Hidden Line Pass

For hidden-line mode:

```text
front faces
back faces
edge extraction
depth compare
```

---

## Overlay Pass

Draw:

* grips
* snap indicators
* dimensions
* selection highlights

without polluting geometry pipeline.

---

# 6. Viewport Architecture

CRITICAL.

You eventually need:

* top
* front
* side
* perspective
* paperspace

---

# Structure

```text
viewport/
 ├── Viewport.ts
 ├── CameraController.ts
 ├── ViewCube.ts
 ├── ProjectionManager.ts
 └── ViewportManager.ts
```

---

# Viewport

```ts
class Viewport {
    id
    camera
    renderState
    gridState
    snapState
    visibleLayers
}
```

Each viewport has isolated state.

Exactly like AutoCAD.

---

# 7. GPU Geometry Batching

Huge future performance improvement.

Instead of:

```text
100k lines = 100k meshes
```

Use:

```text
1 line batch buffer
```

---

# CAD Batch Types

```text
batching/
 ├── LineBatch.ts
 ├── PolylineBatch.ts
 ├── TextBatch.ts
 └── HatchBatch.ts
```

---

# Example

```ts
Float32Array positions
Float32Array colors
Uint32Array entityIds
```

Then upload once to GPU.

Massive speedup.

---

# 8. Picking / Selection Refactor

Current likely:

```text
raycast all meshes
```

This dies at scale.

---

# Proper CAD Picking

```text
mouse
  ↓
spatial index
  ↓
candidate entities
  ↓
precise intersection
```

---

# Picking Modules

```text
picking/
 ├── PickingManager.ts
 ├── Raycaster.ts
 ├── HitProxy.ts
 ├── SelectionBuffer.ts
 └── SnapPicking.ts
```

---

# GPU Selection Buffer

Advanced approach:

render entity IDs into hidden framebuffer.

Example:

```text
pixel color = entity ID
```

Extremely fast selection.

Professional CAD technique.

---

# 9. Layer Rendering System

CAD layers affect rendering heavily.

Need:

```text
layers/
 ├── LayerVisibility.ts
 ├── LayerRenderCache.ts
 └── LayerOverrides.ts
```

---

# Layer Overrides

Per viewport:

* frozen
* hidden
* locked
* transparency
* color override

---

# 10. Overlay Rendering

Do NOT mix overlays into geometry scene.

Separate:

```text
overlay/
 ├── GripRenderer.ts
 ├── SnapRenderer.ts
 ├── SelectionRenderer.ts
 ├── CursorRenderer.ts
 └── RubberBandRenderer.ts
```

This avoids redraw chaos.

---

# 11. Text Rendering Refactor

CAD text is difficult.

Need:

```text
text/
 ├── TextLayout.ts
 ├── SHXRenderer.ts
 ├── MTextLayout.ts
 ├── FontCache.ts
 └── GlyphAtlas.ts
```

---

# Why

Eventually you need:

* SHX fonts
* MTEXT formatting
* rotation
* stacked fractions
* unicode
* annotation scaling

---

# 12. Hidden Line Engine

A major CAD milestone.

---

# Rendering Modes

```text
enum RenderMode {
    Wireframe,
    Shaded,
    HiddenLine,
    XRay,
    Realistic
}
```

---

# Hidden Line Pipeline

```text
solid geometry
   ↓
edge extraction
   ↓
depth testing
   ↓
visible edges only
```

---

# 13. Incremental Redraw System

Professional CAD does NOT redraw entire scene every frame.

Need:

```text
cache/
 ├── DirtyRegion.ts
 ├── RenderCache.ts
 ├── GeometryCache.ts
 └── RedrawScheduler.ts
```

---

# Dirty Flag Example

```ts
entity.modified = true
```

Only rebuild changed geometry.

Huge performance gain.

---

# 14. OpenCascade Integration Path

Target pipeline:

```text
BREP
  ↓
OpenCascade
  ↓
Triangulation
  ↓
GPU Mesh
```

---

# OCC Render Cache

```text
occ/
 ├── OCCShapeCache.ts
 ├── Tessellator.ts
 ├── EdgeExtractor.ts
 └── BrepRenderer.ts
```

---

# 15. Recommended Immediate Refactor Steps

## Step 1

Extract:

```text
LineRenderer
CircleRenderer
PolylineRenderer
```

first.

---

## Step 2

Create:

```ts
RenderObject
```

abstraction.

---

## Step 3

Create:

```ts
Viewport
```

class.

---

## Step 4

Move overlays out of main scene.

---

## Step 5

Implement batch rendering for lines.

---

## Step 6

Implement render passes.

---

# Suggested Final Architecture

```text
Document
   ↓
SceneGraph
   ↓
EntityRenderers
   ↓
RenderObjects
   ↓
RenderPipeline
   ↓
GPU
```

---

# Biggest Future Bottlenecks

Without refactor:

* renderer becomes 20k-line monster
* selection slows massively
* hidden line impossible
* 3D impossible
* paperspace impossible
* multi-viewport impossible

With refactor:

* scalable CAD engine
* professional architecture
* easier OCC integration
* large drawings possible
* reusable rendering subsystems

---

# Recommended Next Refactor Order

## Highest Priority

1. Entity renderer abstraction
2. RenderObject layer
3. Viewport system
4. Overlay separation
5. GPU batching
6. Picking refactor
7. Multi-pass rendering
8. Hidden-line renderer
9. Incremental redraw
10. OCC solid rendering
