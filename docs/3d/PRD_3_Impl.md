# 📄 Detailed Implementation Plan

# WebCAD 3D System (Three.js + OpenCascade)

---

# 🟩 Phase A — Viewports & Cameras

Goal:

```text id="1m07e0"
Professional engineering viewing system
```

This phase creates the foundation for ALL future 3D work.

---

# A.1 Objectives

Implement:

* orthographic engineering views
* perspective navigation
* multi-viewport layout
* camera synchronization
* navigation controls

---

# A.2 Core Architecture

```text id="j63nm7"
Viewport Manager
        ↓
Camera System
        ↓
Viewport Renderer
        ↓
Input Controller
```

---

# A.3 Viewport Data Model

```typescript id="ehdbgc"
class Viewport {

    id: string

    rect: Rect

    camera: THREE.Camera

    projectionMode:
        "ORTHOGRAPHIC"
        | "PERSPECTIVE"

    renderMode:
        "WIREFRAME"
        | "SHADED"

    viewDirection: Vector3

    target: Vector3

    zoom: number
}
```

---

# A.4 Orthographic Views

Required presets:

| View   | Direction |
| ------ | --------- |
| TOP    | (0,0,1)   |
| FRONT  | (0,-1,0)  |
| RIGHT  | (1,0,0)   |
| LEFT   | (-1,0,0)  |
| BACK   | (0,1,0)   |
| BOTTOM | (0,0,-1)  |

---

# A.5 Orthographic Camera Setup

```typescript id="7n4og7"
camera =
    new THREE.OrthographicCamera(
        left,
        right,
        top,
        bottom,
        near,
        far
    )
```

---

# A.6 Perspective Camera

```typescript id="kv6o7n"
camera =
    new THREE.PerspectiveCamera(
        60,
        aspectRatio,
        0.1,
        100000
    )
```

---

# A.7 Viewport Split System

Support:

* single viewport
* vertical split
* horizontal split
* quad layout

---

# Layout Example

```text id="rddjlwm"
+-----------+-----------+
| TOP       | FRONT     |
+-----------+-----------+
| RIGHT     | ISO       |
+-----------+-----------+
```

---

# A.8 Viewport Manager

Responsibilities:

* create layouts
* resize panels
* activate viewport
* render all viewports

---

## Pseudocode

```pseudo id="91jlwm"
FUNCTION renderAllViewports()

    FOR EACH viewport

        renderer.setViewport()

        renderer.render(
            scene,
            viewport.camera
        )

END FUNCTION
```

---

# A.9 Navigation Controls

Implement:

* orbit
* pan
* zoom

---

# Recommended Approach

Use:

* custom CAD navigation
  OR
* adapted OrbitControls

---

# A.10 CAD Navigation Behavior

| Action | Mouse        |
| ------ | ------------ |
| PAN    | middle drag  |
| ORBIT  | shift+middle |
| ZOOM   | wheel        |

---

# A.11 Camera Target System

```typescript id="e41rt6"
camera.lookAt(
    viewport.target
)
```

---

# A.12 Zoom Extents

Critical CAD feature.

---

## Pseudocode

```pseudo id="jlwmq1"
FUNCTION zoomExtents()

    bounds =
        calculateSceneBounds()

    fitCameraToBounds(bounds)

END FUNCTION
```

---

# A.13 Deliverables

✔ Multi-viewport rendering
✔ Orthographic engineering views
✔ Perspective navigation
✔ Camera interaction system

---

---

# 🟦 Phase B — Basic 3D Primitives

Goal:

```text id="jlwm8m"
Generate real 3D geometry
```

---

# B.1 Objectives

Implement:

* BOX
* CYLINDER
* EXTRUDE
* primitive entity system

---

# B.2 New Entity Types

```typescript id="jlwm6u"
Solid3D
Mesh3D
Profile2D
```

---

# B.3 BOX Command

---

## Workflow

```text id="5jlwm6"
Specify corner
Specify opposite corner
Specify height
```

---

## Pseudocode

```pseudo id="wjlwm8"
FUNCTION createBox()

    width
    depth
    height

    geometry =
        new THREE.BoxGeometry(
            width,
            height,
            depth
        )

END FUNCTION
```

---

# B.4 CYLINDER Command

---

## Parameters

```text id="jlwm3m"
center
radius
height
```

---

## Pseudocode

```pseudo id="jlwm9m"
geometry =
    new THREE.CylinderGeometry(
        radius,
        radius,
        height
    )
```

---

# B.5 EXTRUDE Command

MOST IMPORTANT primitive.

---

# Workflow

```text id="jlwm2w"
Select closed profile
Specify extrusion height
Generate solid
```

---

# Supported Profiles

✔ closed polyline
✔ circle
✔ region

---

# B.6 Geometry Flow

```text id="9jlwmx"
2D profile
    ↓
Shape conversion
    ↓
Extrusion
    ↓
Solid mesh
```

---

# B.7 MVP Extrusion Strategy

Initially:

* use Three.js ExtrudeGeometry

Later:

* migrate to OpenCascade

---

## Pseudocode

```pseudo id="jlwm1m"
shape =
    convertPolylineToShape()

geometry =
    new THREE.ExtrudeGeometry(
        shape,
        {
            depth: height
        }
    )
```

---

# B.8 Primitive Registry

```typescript id="jlwm7r"
PrimitiveFactory {

    createBox()

    createCylinder()

    createExtrusion()
}
```

---

# B.9 Deliverables

✔ Primitive solids
✔ 2D-to-3D workflow
✔ Initial solid entity system

---

---

# 🟨 Phase C — OpenCascade Integration

Goal:

```text id="jlwm0x"
Industrial geometry kernel integration
```

This phase upgrades:

* from mesh modeling
* into actual CAD solids

---

# C.1 Objectives

Implement:

* OpenCascade WASM
* BRep shape wrappers
* tessellation bridge
* OCC ↔ Three.js conversion

---

# C.2 Core Architecture

```text id="jlwm4n"
CAD Entity
      ↓
OpenCascade Shape
      ↓
Tessellation
      ↓
Three.js Mesh
```

---

# C.3 OpenCascade WASM Setup

Recommended:

* opencascade.js

---

# Responsibilities

| Feature     | OCC |
| ----------- | --- |
| BRep        | YES |
| Extrude     | YES |
| Boolean     | YES |
| STEP future | YES |

---

# C.4 Shape Wrapper

```typescript id="jlwm9p"
class OCCShape {

    occShape

    mesh

    metadata
}
```

---

# C.5 OCC Extrusion

```pseudo id="jlwmr8"
shape =
    OCC.makePrism(
        profile,
        vector
    )
```

---

# C.6 Tessellation Bridge

MOST IMPORTANT PART.

---

# Flow

```text id="jlwmk8"
OCC Shape
    ↓
Triangulation
    ↓
Vertex arrays
    ↓
BufferGeometry
```

---

# C.7 Tessellation Pseudocode

```pseudo id="jlwmz8"
meshData =
    OCC.tessellate(shape)

geometry =
    new THREE.BufferGeometry()

geometry.setAttribute(
    "position",
    meshData.vertices
)
```

---

# C.8 Entity Ownership

Store:

* OCC authoritative shape
* Three.js visualization mesh

---

# C.9 Synchronization Rules

```text id="jlwmn9"
OCC shape = source of truth
Three.js mesh = render cache
```

VERY important.

---

# C.10 Deliverables

✔ OpenCascade WASM operational
✔ Real CAD solids
✔ Tessellation pipeline
✔ OCC-backed extrusion

---

---

# 🟥 Phase D — Rendering Modes

Goal:

```text id="jlwm4y"
Professional CAD visualization
```

---

# D.1 Objectives

Implement:

* wireframe
* hidden line
* shaded
* shaded with edges

---

# D.2 Render Mode Architecture

```typescript id="jlwmf9"
enum RenderMode {

    WIREFRAME
    HIDDEN_LINE
    SHADED
    SHADED_EDGES
}
```

---

# D.3 Wireframe Mode

---

## Strategy

Use:

* EdgesGeometry
* LineSegments

---

## Pseudocode

```pseudo id="jlwm7n"
edges =
    new THREE.EdgesGeometry(
        mesh.geometry
    )
```

---

# D.4 Shaded Mode

Standard mesh rendering.

---

## Material

```typescript id="jlwm5c"
MeshPhongMaterial
```

or:

```typescript id="jlwmr4"
MeshStandardMaterial
```

---

# D.5 Hidden Line Mode

MOST IMPORTANT CAD VIEW.

---

# MVP Strategy

Use:

* depth testing
* edge overlay

---

# Pipeline

```text id="jlwm2m"
Solid mesh
    ↓
Depth buffer
    ↓
Visible edges only
```

---

# D.6 Shaded with Edges

Recommended default.

---

# Implementation

```text id="jlwmv5"
Shaded mesh
+
edge overlay
```

---

# D.7 Render Mode Switching

```pseudo id="jlwmw7"
FUNCTION setRenderMode(mode)

    FOR EACH viewport

        viewport.renderMode =
            mode

END FUNCTION
```

---

# D.8 Deliverables

✔ Engineering visualization
✔ Hidden line workflow
✔ Professional viewport display

---

---

# 🟪 Phase E — Boolean Operations

Goal:

```text id="jlwm6m"
Basic solid editing
```

---

# E.1 Objectives

Implement:

* UNION
* SUBTRACT
* INTERSECT

using OpenCascade.

---

# E.2 Boolean Workflow

```text id="jlwm8x"
Select solid A
Select solid B
Apply boolean
Generate result
```

---

# E.3 UNION

---

## Pseudocode

```pseudo id="jlwm3w"
result =
    OCC.booleanFuse(
        solidA,
        solidB
    )
```

---

# E.4 SUBTRACT

---

## Pseudocode

```pseudo id="jlwm5z"
result =
    OCC.booleanCut(
        solidA,
        solidB
    )
```

---

# E.5 INTERSECT

---

## Pseudocode

```pseudo id="jlwm0v"
result =
    OCC.booleanCommon(
        solidA,
        solidB
    )
```

---

# E.6 Boolean Entity Replacement

```text id="jlwm8k"
A + B
    ↓
Result Shape
    ↓
Delete originals
    ↓
Insert new solid
```

---

# E.7 Boolean Validation

Need:

* manifold checks
* shape validity checks

---

# E.8 Shape Regeneration

After boolean:

```text id="jlwm3k"
Re-tessellate shape
```

---

# E.9 Deliverables

✔ Real CAD booleans
✔ Solid editing workflow
✔ OCC boolean pipeline

---

# 🧠 Final Recommended Development Order

---

# FIRST

## Phase A

Because:

* ALL later systems depend on cameras/viewports.

---

# SECOND

## Phase B

Because:

* you need visible 3D entities first.

---

# THIRD

## Phase C

Because:

* OpenCascade integration is foundational.

---

# FOURTH

## Phase D

Because:

* rendering modes depend on solid pipeline.

---

# FIFTH

## Phase E

Because:

* booleans are computationally hardest.

---

# ⚠️ Critical Strategic Recommendation

Initially:

```text id="jlwm1x"
Use Three.js geometry for MVP
```

THEN migrate:

```text id="jlwm7x"
authoritative geometry
→ OpenCascade
```

This dramatically reduces development risk.
