# Entity Renderer Abstraction for WebCAD

Right now your renderer appears to be centralized around a single viewer/render pipeline.

That works initially, but eventually becomes extremely difficult to maintain once you add:

* hidden-line rendering
* selection highlighting
* paperspace
* 3D solids
* layer visibility
* line types
* dimensions
* GPU optimization
* multiple viewports
* OpenCascade shapes

A professional CAD engine separates:

```text
CAD Entity
    ↓
Entity Renderer
    ↓
Graphics Primitive
    ↓
GPU/Canvas
```

This is called **renderer abstraction**.

---

# Core Goal

Instead of:

```ts
if (entity.type === 'LINE') { ... }
if (entity.type === 'CIRCLE') { ... }
if (entity.type === 'ARC') { ... }
```

You evolve into:

```ts
rendererRegistry.render(entity, context)
```

where each entity owns its specialized renderer.

---

# Recommended Architecture

## High-Level Structure

```text
render/
 ├── RendererRegistry.ts
 ├── RenderContext.ts
 ├── EntityRenderer.ts
 │
 ├── renderers/
 │    ├── LineRenderer.ts
 │    ├── CircleRenderer.ts
 │    ├── ArcRenderer.ts
 │    ├── PolylineRenderer.ts
 │    ├── HatchRenderer.ts
 │    ├── TextRenderer.ts
 │    ├── MTextRenderer.ts
 │    ├── DimensionRenderer.ts
 │    ├── BlockRenderer.ts
 │    └── InsertRenderer.ts
 │
 ├── pipelines/
 │    ├── WireframePipeline.ts
 │    ├── HiddenLinePipeline.ts
 │    ├── SelectionPipeline.ts
 │    └── OverlayPipeline.ts
 │
 ├── geometry/
 ├── materials/
 ├── cache/
 └── picking/
```

---

# Core Interfaces

## 1. Base EntityRenderer Interface

```ts
export interface EntityRenderer<T extends Entity> {
    render(
        entity: T,
        context: RenderContext
    ): RenderNode;

    update?(
        entity: T,
        node: RenderNode,
        context: RenderContext
    ): void;

    dispose?(node: RenderNode): void;
}
```

---

# Why This Matters

This gives:

* polymorphism
* modularity
* hot swapping
* optimized updates
* independent pipelines

instead of a giant monolithic renderer.

---

# RenderContext

The renderer should NEVER access global viewer state directly.

Instead:

```ts
export interface RenderContext {
    scene: THREE.Scene;

    viewport: Viewport;

    layerState: LayerState;

    selectionState: SelectionState;

    renderMode:
        | 'wireframe'
        | 'hidden'
        | 'shaded';

    unitScale: number;

    cache: RenderCache;
}
```

This is critical for:

* multi-viewports
* paperspace
* offscreen rendering
* export rendering

---

# RenderNode

Renderer should NOT directly return Three.js meshes.

Use abstraction.

```ts
export interface RenderNode {
    object3D: THREE.Object3D;

    bounds: BoundingBox;

    entityId: string;

    dirtyFlags?: number;
}
```

This future-proofs:

* switching render engines
* WebGPU
* OpenCascade tessellation
* custom GPU renderer

---

# Renderer Registry

## Core Dispatcher

```ts
class RendererRegistry {

    private renderers = new Map<
        string,
        EntityRenderer<any>
    >();

    register(
        type: string,
        renderer: EntityRenderer<any>
    ) {
        this.renderers.set(type, renderer);
    }

    get(type: string) {
        return this.renderers.get(type);
    }
}
```

Usage:

```ts
const renderer =
    registry.get(entity.type);

renderer.render(entity, context);
```

---

# Example: LineRenderer

```ts
export class LineRenderer
implements EntityRenderer<LineEntity> {

    render(
        entity: LineEntity,
        context: RenderContext
    ): RenderNode {

        const geometry =
            new THREE.BufferGeometry();

        geometry.setFromPoints([
            new THREE.Vector3(
                entity.start.x,
                entity.start.y,
                0
            ),
            new THREE.Vector3(
                entity.end.x,
                entity.end.y,
                0
            )
        ]);

        const material =
            MaterialFactory.getLineMaterial(
                entity
            );

        const line =
            new THREE.Line(
                geometry,
                material
            );

        return {
            object3D: line,
            bounds: entity.getBounds(),
            entityId: entity.id
        };
    }
}
```

---

# Geometry Builder Layer

Eventually separate:

```text
Entity → Geometry Builder → Renderer
```

Example:

```text
CircleEntity
    ↓
CircleGeometryBuilder
    ↓
Three.js Mesh
```

This helps when:

* exporting
* tessellating
* hidden line generation
* snapping
* OpenCascade integration

---

# Recommended Rendering Pipelines

Instead of ONE renderer:

Use multiple passes.

---

# 1. Wireframe Pipeline

Handles:

* lines
* arcs
* circles
* edges

---

# 2. Hidden-Line Pipeline

Handles:

* visibility testing
* edge suppression
* silhouette extraction

---

# 3. Selection Overlay Pipeline

Handles:

* grips
* hover glow
* dashed previews
* snap markers

---

# 4. Annotation Pipeline

Handles:

* text
* dimensions
* leaders
* UI overlays

This is important because annotations behave differently from geometry.

---

# Dirty Flag System

VERY IMPORTANT.

Do NOT regenerate entire scenes every frame.

Use:

```ts
enum DirtyFlags {
    Geometry = 1,
    Material = 2,
    Transform = 4,
    Visibility = 8
}
```

Then:

```ts
if (node.dirtyFlags & DirtyFlags.Geometry) {
    rebuildGeometry();
}
```

Professional CAD systems depend heavily on this.

---

# Render Cache

Without cache:

* CAD becomes slow
* redraw becomes expensive

Implement:

```text
RenderCache
 ├── geometry cache
 ├── material cache
 ├── text glyph cache
 ├── hatch pattern cache
 └── tessellation cache
```

---

# Text Rendering Abstraction

Text is one of the hardest CAD problems.

Separate:

```text
TextEntity
   ↓
TextLayoutEngine
   ↓
GlyphBuilder
   ↓
Renderer
```

Needed for:

* SHX
* TTF
* MTEXT formatting
* Unicode
* stacked fractions
* dimensions

---

# Hatch Rendering Abstraction

Hatch should NOT be just lines.

Architecture:

```text
Boundary Detection
    ↓
Pattern Evaluator
    ↓
Clipper
    ↓
Renderer
```

Future support:

* associative hatch
* solid hatch
* gradient hatch
* ANSI patterns
* custom PAT

---

# Block Rendering

Block references require hierarchy.

```text
Insert
   ↓
Transform Stack
   ↓
Nested Entity Rendering
```

Eventually support:

* nested blocks
* xrefs
* attribute instances

---

# Viewport-Aware Rendering

Renderers must NEVER assume:

```text
1 scene
1 camera
1 projection
```

Every renderer should support:

```ts
render(entity, viewportContext)
```

for:

* modelspace
* paperspace
* layout tabs
* split views

---

# OpenCascade Integration

This abstraction becomes extremely valuable.

Example:

```text
BREP Entity
   ↓
OpenCascade Tessellator
   ↓
Triangle Mesh
   ↓
Renderer
```

Without abstraction this becomes spaghetti.

---

# Future GPU Optimization

Once renderer abstraction exists:

You can later implement:

## Batched Rendering

```text
10000 lines
   ↓
single GPU buffer
```

instead of:

```text
10000 THREE.Line objects
```

This is ESSENTIAL for large CAD files.

---

# Recommended Immediate Refactor

## Step 1

Create:

```text
EntityRenderer.ts
RendererRegistry.ts
RenderContext.ts
```

---

## Step 2

Move rendering logic OUT of Viewer.ts.

---

## Step 3

Create first renderers:

* LineRenderer
* CircleRenderer
* ArcRenderer
* PolylineRenderer

---

## Step 4

Add dirty flags.

---

## Step 5

Add render cache.

---

# Long-Term Ideal Architecture

```text
Document
   ↓
Scene Graph
   ↓
Entity Renderers
   ↓
Render Pipelines
   ↓
GPU Backend
```

This architecture scales toward:

* AutoCAD-like systems
* FreeCAD-like systems
* Fusion360-like systems
* BIM viewers
* WebGPU CAD engines

instead of remaining a canvas-based drawing tool.
