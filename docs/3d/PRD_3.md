# 📄 PRD — Part 3 (Corrected)

# Viewports, Projections & Basic 3D System

## (Three.js + OpenCascade Architecture)

---

# 🎯 1. Objective

Extend WebCAD from:

```
2D drafting system
```

into:

```
2.5D / basic 3D CAD visualization & modeling system
```

while preserving:

- AutoCAD-like workflows
- lightweight browser responsiveness
- command-driven interaction

---

# 🧭 2. Strategic Goal

This phase is NOT intended to build:

- full parametric solid CAD
- Fusion 360 competitor
- full mechanical kernel UI

Instead, the goal is:

```
"Professional lightweight engineering 3D drafting environment"
```

similar to:

- AutoCAD R12 / R13 3D
- IntelliCAD 3D
- early Mechanical Desktop workflows

---

# 🧱 3. Core Technology Stack (Corrected)

| Layer             | Technology                  | Note                                         |
| ----------------- | --------------------------- | -------------------------------------------- |
| Renderer          | Three.js                    | Single renderer, multi-viewport scissor pass |
| Geometry Kernel   | opencascade.js (WASM)       | Async init required; runs in Web Worker      |
| CAD Core          | Existing WebCAD Core        |                                              |
| Projection Engine | Three.js cameras + presets  | Not "custom" — Three.js handles camera math  |
| Orbit Controls    | Custom CAD orbit            | OrbitControls gimbal-locks at top view       |
| Selection Engine  | Existing + 3D ray picking   |                                              |
| Spatial Index     | three-mesh-bvh              | Integrates with BufferGeometry + Raycaster   |
| Export            | DXF + STEP via OCC (Phase G)|                                              |

> ⚠️ The original PRD listed "Custom" for the Projection Engine. Three.js
> handles all camera math. The only custom work is named-view presets and
> UCS coordinate transform logic in the InputRouter.

---

# 🏗 4. High-Level Architecture

```
+------------------------------------------------+
|                 UI Layer                       |
|------------------------------------------------|
| Command Line (extended for x,y,z input)        |
| Viewport Controls                              |
| UCS Controls                                   |
| Projection Tools                               |
+-------------------+----------------------------+
                    |
                    v
+------------------------------------------------+
|              CAD Command Engine                |
|------------------------------------------------|
| VIEW  VPOINT  UCS  ELEV  THICKNESS             |
| EXTRUDE  REVOLVE                               |
| BOX  CYLINDER  CONE  SPHERE                    |
| HIDE  SHADE  WIREFRAME                         |
+-------------------+----------------------------+
                    |
                    v
+------------------------------------------------+
|               CAD Core Model                   |
|------------------------------------------------|
| 2D Entities (with elevation + thickness)       |
| 3D Entities (Solid3D, Surface3D, Mesh3D)       |
| Layers / Selection Sets / Viewports            |
+-------------------+----------------------------+
                    |
                    v
+------------------------------------------------+
|          OCC Worker Bridge (NEW)               |
|------------------------------------------------|
| Web Worker encapsulating opencascade.js        |
| Async message queue                            |
| WASM heap memory manager                       |
| Tessellation engine                            |
+-------------------+----------------------------+
                    |
                    v
+------------------------------------------------+
|               Rendering Engine                 |
|------------------------------------------------|
| Three.js — single WebGL context                |
| Scissor + Viewport multi-pass per frame        |
| Orthographic Camera (4 standard views)         |
| Perspective Camera (ISO / free)                |
| Wireframe / Shaded / Shaded+Edges modes        |
+------------------------------------------------+
```

---

# 🟢 5. Feature Domains

---

## 5.1 Multi-Viewport System

### Goal

Support classic CAD viewport layouts.

---

### Viewport Data Model

```
Viewport {
  id              : String
  camera          : OrthographicCamera | PerspectiveCamera
  projectionMode  : "ORTHO" | "PERSPECTIVE"
  rect            : { x, y, width, height }   -- normalized 0..1
  viewDirection   : Vector3D
  renderMode      : "WIREFRAME" | "SHADED" | "SHADED_EDGES" | "HIDDEN"
  isActive        : Boolean
}
```

---

### Standard Layout

```
+-----------+-----------+
| TOP       | FRONT     |
+-----------+-----------+
| LEFT      | ISO       |
+-----------+-----------+
```

---

### ⚠️ Rendering Strategy — CRITICAL (was missing in original PRD)

**Use a single renderer with scissor + viewport pass per frame.**

Do NOT create multiple Three.js renderers.

**Why:** Each Three.js renderer creates its own WebGL context. Browsers
hard-limit WebGL contexts to 8–16 per page. Exceeding this limit causes
older contexts to be silently destroyed.

```
-- Correct approach: ONE renderer, N camera passes per frame

FUNCTION renderFrame():

  renderer.clear()

  FOR EACH viewport IN activeViewports:

    renderer.setScissorTest(true)
    renderer.setScissor(
      viewport.rect.x      * canvasWidth,
      viewport.rect.y      * canvasHeight,
      viewport.rect.width  * canvasWidth,
      viewport.rect.height * canvasHeight
    )
    renderer.setViewport(
      viewport.rect.x      * canvasWidth,
      viewport.rect.y      * canvasHeight,
      viewport.rect.width  * canvasWidth,
      viewport.rect.height * canvasHeight
    )

    renderer.render(scene, viewport.camera)

  END FOR

  renderer.setScissorTest(false)

END FUNCTION
```

---

### Viewport Synchronization (was missing in original PRD)

When any entity is created or modified, all viewports must update.

```
ON entityModified(entity):
  markSceneDirty()
  requestAnimationFrame(renderFrame)

-- The shared scene graph means one update propagates to all cameras
-- automatically — no per-viewport invalidation needed
```

---

### Deliverable

✔ Multiple synchronized engineering views using a single WebGL context

---

## 5.2 Projection System

### Goal

Provide standard engineering projections.

---

### Projection Modes

**1. Orthographic Projection**

```
camera = new THREE.OrthographicCamera(
  left, right, top, bottom, near, far
)
```

Standard views:

| View   | Direction Vector | VPOINT Input |
| ------ | ---------------- | ------------ |
| TOP    | (0, 0, 1)        | 0,0,1        |
| BOTTOM | (0, 0, −1)       | 0,0,-1       |
| FRONT  | (0, −1, 0)       | 0,-1,0       |
| BACK   | (0, 1, 0)        | 0,1,0        |
| RIGHT  | (1, 0, 0)        | 1,0,0        |
| LEFT   | (−1, 0, 0)       | -1,0,0       |
| ISO    | (1, −1, 1)       | 1,-1,1       |

**2. Perspective Projection**

```
camera = new THREE.PerspectiveCamera(
  fov, aspect, near, far
)
```

---

### VPOINT Command — Corrected Format

> ⚠️ The original PRD said "camera angle" without specifying the input
> format. VPOINT takes a direction vector, not an angle.

```
VPOINT <x,y,z>

-- The camera looks FROM that direction TOWARD the world origin
-- The vector is normalized before applying to the camera
-- lookAt = origin (0,0,0) by default; modified by PAN

Examples:
  VPOINT 0,0,1      → top view
  VPOINT 0,-1,0     → front view
  VPOINT 1,-1,1     → isometric view

-- Alternative rotate mode (compass + altitude):
  VPOINT R
  Enter angle from X axis in XY plane: 315
  Enter angle from XY plane: 35.26
```

---

### Projection Commands

| Command | Purpose                                  |
| ------- | ---------------------------------------- |
| PLAN    | Set top orthographic view (0,0,1)        |
| VPOINT  | Set camera direction by vector or angles |
| VIEW    | Save / restore named camera states       |

---

### Deliverable

✔ Engineering projection workflow with correct VPOINT format

---

## 5.3 UCS (User Coordinate System)

### Goal

Enable working planes for 3D drafting.

---

### UCS Data Structure

```
UCS {
  name   : String
  origin : Point3D
  xAxis  : Vector3D     -- normalized
  yAxis  : Vector3D     -- normalized, perpendicular to xAxis
  zAxis  : Cross(xAxis, yAxis)    -- derived
  matrix : Matrix4                -- world-from-UCS transform (computed)
}
```

---

### ⚠️ UCS Must Transform Coordinate Input — Critical (was missing)

> The original PRD defined the UCS data structure but never specified
> how UCS affects the command engine. Without this, UCS is decorative.

When a UCS is active, ALL coordinate input from the command line is
interpreted in UCS space and must be transformed to world space before
being stored in the entity model.

```
-- In InputRouter.resolvePoint(rawInput):

FUNCTION resolvePoint(rawInput):

  ucsPt   = parseCoordinate(rawInput)   -- parse as UCS-local x,y,z
  worldPt = activeUCS.matrix * ucsPt    -- transform to world space

  RETURN worldPt

END FUNCTION

-- UCS matrix construction:
FUNCTION buildUCSMatrix(ucs):

  RETURN Matrix4{
    col0: [ucs.xAxis.x, ucs.xAxis.y, ucs.xAxis.z, 0],
    col1: [ucs.yAxis.x, ucs.yAxis.y, ucs.yAxis.z, 0],
    col2: [ucs.zAxis.x, ucs.zAxis.y, ucs.zAxis.z, 0],
    col3: [ucs.origin.x, ucs.origin.y, ucs.origin.z, 1]
  }
```

---

### UCS Commands

| Command     | Purpose                            |
| ----------- | ---------------------------------- |
| UCS         | Enter UCS submenu                  |
| UCS WORLD   | Restore world coordinate system    |
| UCS ORIGIN  | Move UCS origin                    |
| UCS 3POINT  | Define UCS by 3 points             |
| UCS VIEW    | Align UCS to current view plane    |
| UCSICON     | Toggle UCS origin indicator        |

---

### Deliverable

✔ Localized drafting planes with full coordinate input transformation

---

## 5.4 3D Coordinate Input (New Section — was absent in original PRD)

### Goal

Extend the existing x,y command parser to support 3D input.

---

### Input Formats

The existing parser handles `x,y`, `@dx,dy`, `@dist<angle`.

The 3D extension must additionally support:

```
x,y,z           -- absolute 3D point in active UCS
@dx,dy,dz       -- relative offset from last point
@dist<ang,z     -- relative polar + Z offset

-- Z omitted → inherit current elevation (ELEV setting)
-- Z = 0 is default when ELEV is not set
```

---

### Parser Extension

```
FUNCTION parseCoordinate(raw):

  parts = split(raw, ',')

  IF COUNT(parts) = 3 THEN
    RETURN Point3D{ x:parts[0], y:parts[1], z:parts[2] }

  ELSE IF COUNT(parts) = 2 THEN
    RETURN Point3D{ x:parts[0], y:parts[1], z:currentElevation }

  ELSE IF contains(raw, '<') THEN
    RETURN parsePolar3D(raw)    -- @dist<angle + optional z

  END IF
```

---

## 5.5 Basic 3D Geometry

### Goal

Support AutoCAD R12/R13-style 3D geometry.

---

### ⚠️ ELEV and THICKNESS — Missing from Original PRD

> The original PRD targeted AutoCAD R12/R13 3D but omitted ELEV and
> THICKNESS — the primary 3D mechanisms of that era. These must be
> implemented before EXTRUDE/REVOLVE for genuine R12 compatibility.

```
ELEV command:
  Prompt: "New current elevation <0>:"
  Prompt: "New current thickness <0>:"

  Sets globals:
    currentElevation  : Float   -- Z base for new entities
    currentThickness  : Float   -- extrusion depth for new entities

Entity with thickness:
  Line with thickness=50    → rendered as 2 lines + connecting surface
  Circle with thickness=50  → rendered as cylinder (no OCC required)
  Polyline with thickness   → rendered as extruded ribbon
```

---

### 3D Primitives

All primitives below require OCC integration (Phase B) to be complete first.

> ⚠️ Checkmarks (✅) removed from original PRD — these are not yet
> implemented. Do not mark as done until OCC Worker Bridge (§5.5 OCC)
> exists and the shape can be tessellated and rendered.

**BOX**

```
Input:
  corner1 : Point3D
  corner2 : Point3D    -- or length/width/height mode

OCC: BRepPrimAPI_MakeBox(dx, dy, dz)
```

**CYLINDER**

```
Input:
  center : Point3D
  radius : Float
  height : Float

OCC: BRepPrimAPI_MakeCylinder(radius, height)
```

**CONE**

```
OCC: BRepPrimAPI_MakeCone(r1, r2, height)
```

**SPHERE**

```
OCC: BRepPrimAPI_MakeSphere(radius)
```

**EXTRUDE**

```
Input:
  profile   : ClosedPolyline | Circle | Region
  direction : Vector3D (default = UCS Z-axis)
  height    : Float

OCC: BRepPrimAPI_MakePrism(profile_face, direction_vector)
```

**REVOLVE**

```
Input:
  profile : OpenOrClosedPolyline
  axis    : Line3D
  angle   : Float (degrees, default = 360)

OCC: BRepPrimAPI_MakeRevol(profile_face, axis, angle_radians)
```

---

### Deliverable

✔ ELEV/THICKNESS for R12-compatible 2.5D
✔ OCC-backed solid primitives

---

## 5.6 OpenCascade Integration (Corrected)

### Goal

Use industrial geometry kernel via opencascade.js WASM port.

---

### ⚠️ opencascade.js is Async and Requires a Web Worker

> The original PRD showed `OpenCascade.extrude(profile, direction, height)`.
> This API does not exist. The real API is C++-style and the entire
> module must run off the main thread. All of the following is required.

---

### Initialization (Async — happens once at startup)

```
FUNCTION initOCC():

  -- opencascade.js is ~25 MB WASM — load asynchronously
  module = AWAIT import("opencascade.js")
  oc     = AWAIT module()

  -- Pass oc instance to the Worker (see below)
  RETURN oc

END FUNCTION

-- Block all 3D commands until init is complete
-- Show "Loading geometry kernel…" in status bar during init
```

---

### Web Worker Architecture

All geometry operations must run in a Web Worker to avoid
blocking the UI thread. Booleans and tessellation of complex
shapes can take 100ms–2000ms.

```
-- Main thread
FUNCTION requestShape(type, params):

  messageId = generateId()
  worker.postMessage({ id: messageId, type: type, params: params })

  RETURN Promise resolved when worker.onmessage id matches

-- Worker thread
onmessage = FUNCTION(msg):

  SWITCH msg.type:

    CASE "makeBox":
      result = makeBox(msg.params)

    CASE "makeExtrude":
      result = makeExtrude(msg.params)

    CASE "booleanSubtract":
      result = booleanSubtract(msg.params)

  END SWITCH

  postMessage({ id: msg.id, mesh: result })
```

---

### Correct OCC API Examples

```
-- Box
FUNCTION makeBox(w, h, d):

  builder = new oc.BRepPrimAPI_MakeBox_1(w, h, d)
  shape   = builder.Shape()
  mesh    = tessellate(shape)
  builder.delete()
  shape.delete()                -- REQUIRED: explicit WASM heap cleanup
  RETURN mesh

-- Cylinder
FUNCTION makeCylinder(radius, height):

  axes    = new oc.gp_Ax2_1()
  builder = new oc.BRepPrimAPI_MakeCylinder_2(axes, radius, height)
  shape   = builder.Shape()
  mesh    = tessellate(shape)
  builder.delete()
  axes.delete()
  shape.delete()
  RETURN mesh

-- Extrude
FUNCTION makeExtrude(profileWire, directionVec, height):

  dir     = new oc.gp_Vec_4(directionVec.x, directionVec.y, height)
  builder = new oc.BRepPrimAPI_MakePrism_1(profileWire, dir, false, true)
  shape   = builder.Shape()
  mesh    = tessellate(shape)
  dir.delete()
  builder.delete()
  shape.delete()
  RETURN mesh
```

---

### Memory Management Rule

> Every OCC object created with `new oc.*` must be explicitly `.delete()`'d
> after use. Failing to do so leaks WASM heap memory permanently for the
> duration of the session. Wrap all OCC calls in try/finally.

```
FUNCTION withOCC(occObject, fn):

  TRY
    RETURN fn(occObject)
  FINALLY
    occObject.delete()
  END TRY
```

---

### Tessellation

```
FUNCTION tessellate(shape, linearDeflection, angularDeflection):

  -- Default quality levels:
  --   Preview:  linearDeflection = 0.5,  angularDeflection = 0.5
  --   Standard: linearDeflection = 0.1,  angularDeflection = 0.3
  --   Fine:     linearDeflection = 0.01, angularDeflection = 0.1

  mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape,
    linearDeflection,
    false,
    angularDeflection,
    true
  )

  vertices = []
  normals  = []
  indices  = []

  -- Walk faces
  explorer = new oc.TopExp_Explorer_1(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE)

  WHILE explorer.More():
    face = oc.TopoDS.Face_1(explorer.Current())
    tri  = oc.BRep_Tool.Triangulation(face, location)
    -- extract nodes, normals, triangles → push to arrays
    explorer.Next()
  END WHILE

  explorer.delete()
  mesher.delete()

  RETURN { vertices, normals, indices }

END FUNCTION
```

---

### When to Re-tessellate

```
- After boolean operations (shape has changed)
- After ELEV/THICKNESS change on 2D entity
- NOT on zoom/pan/rotate — cache the mesh
- Use shape hash as cache key to avoid redundant tessellation
```

---

### Responsibilities

| Feature      | OpenCascade | Note                          |
| ------------ | ----------- | ----------------------------- |
| BRep solids  | YES         | Core primitives               |
| Extrusion    | YES         | BRepPrimAPI_MakePrism         |
| Revolution   | YES         | BRepPrimAPI_MakeRevol         |
| Booleans     | YES         | With error handling (see §5.9)|
| Tessellation | YES         | BRepMesh_IncrementalMesh      |
| True HLR     | YES         | HLRBRep_Algo — Phase G        |
| STEP export  | YES         | STEPControl_Writer — Phase G  |

---

### Deliverable

✔ Async OCC Worker bridge with correct API, memory management, tessellation

---

## 5.7 Rendering Modes (Corrected)

### Goal

Support CAD visualization workflows.

---

### ⚠️ "Hidden Line" vs "Hidden Surface" Clarification

> The original PRD said "GPU depth-based hidden line." This is a
> terminology error. Two distinct techniques exist:

**Mode A — Hidden Surface Removal (GPU, available in Phase E)**

- Uses GPU z-buffer to discard occluded fragments
- Implemented as: `THREE.MeshPhongMaterial` + `EdgesGeometry` overlay
- Produces a shaded view with visible edges
- NOT true hidden-line — it is a shaded image, not vector linework
- Call this "Shaded with Edges" — not "hidden line"

**Mode B — True Hidden Line Removal (vector, Phase G)**

- OCC `HLRBRep_Algo` projects all edges to 2D
- Computes which edge segments are occluded by faces
- Outputs clean 2D visible/hidden line geometry (dashed for hidden)
- Required for engineering drawing output, title blocks, section views
- Expensive — runs in Worker, result cached per view angle change
- NOT a GPU operation

---

### Rendering Mode Implementation

```
RenderMode = "WIREFRAME" | "SHADED" | "SHADED_EDGES" | "HLR"

FUNCTION applyRenderMode(entity3D, mode):

  SWITCH mode:

    CASE "WIREFRAME":
      mesh.material = new THREE.MeshBasicMaterial({ wireframe: true })

    CASE "SHADED":
      mesh.material = new THREE.MeshPhongMaterial({ color: entityColor })

    CASE "SHADED_EDGES":
      mesh.material = new THREE.MeshPhongMaterial({ color: entityColor })
      edges = new THREE.EdgesGeometry(mesh.geometry)
      edgeMesh = new THREE.LineSegments(edges, edgeMaterial)
      scene.add(edgeMesh)

    CASE "HLR":
      -- Phase G: run HLRBRep_Algo in Worker
      -- Replace 3D mesh with 2D projected line geometry

END FUNCTION
```

---

### Deliverable

✔ Wireframe, Shaded, Shaded+Edges (Phase E)
✔ True HLR vector output (Phase G)

---

## 5.8 Selection System (3D)

### Goal

Extend existing 2D selection to 3D.

---

### Ray Picking

```
FUNCTION pick3D(mouseX, mouseY, camera):

  raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(
    normalizedMouseCoords(mouseX, mouseY),
    camera
  )

  -- three-mesh-bvh accelerates this for complex geometry
  intersects = raycaster.intersectObjects(scene.children, recursive: true)

  IF COUNT(intersects) > 0 THEN
    RETURN intersects[0].object.userData.entityId
  END IF

  RETURN null
```

---

### Subobject Selection (Phase F+)

Future:
- face selection (highlight one TopoDS_Face)
- edge selection (highlight one TopoDS_Edge)
- vertex selection

---

### Deliverable

✔ Interactive 3D entity selection via ray picking

---

## 5.9 Navigation Controls (Corrected)

### Goal

Professional CAD navigation without gimbal lock.

---

### ⚠️ OrbitControls Is Wrong for CAD Top View

> THREE.OrbitControls maintains a fixed up-vector. When the camera
> approaches the top view (looking straight down), it gimbal-locks
> and mouse behavior becomes erratic. Do not use OrbitControls.

---

### Correct Orbit Implementation

```
-- Per-viewport navigation constraints:

Orthographic viewports (TOP, FRONT, LEFT, RIGHT):
  DISABLE orbit rotation — rotation breaks the standard view definition
  ALLOW: PAN (middle mouse / two-finger drag)
  ALLOW: ZOOM (scroll wheel / pinch)
  DISALLOW: ORBIT

Perspective / ISO viewport:
  Implement orbit as spherical coordinates:
    theta : Float    -- azimuth angle (0..2π)
    phi   : Float    -- elevation angle, CLAMPED to (0.01, π - 0.01)
    -- Clamping phi prevents pole-flip / gimbal lock

  ON mouseDrag(dx, dy):
    theta += dx * sensitivity
    phi   += dy * sensitivity
    phi    = CLAMP(phi, 0.01, PI - 0.01)
    camera.position = sphericalToCartesian(theta, phi, orbitRadius)
    camera.lookAt(orbitTarget)
```

---

### Navigation Commands

| Command      | Input                        |
| ------------ | -------------------------    |
| PAN          | Middle mouse drag            |
| ZOOM         | Scroll wheel                 |
| ORBIT        | Right mouse drag (persp only)|
| ZOOM EXTENTS | Z + E                        |
| VIEW CUBE    | Future                       |

---

### Deliverable

✔ Gimbal-lock-free 3D navigation with per-viewport constraints

---

## 5.10 2D ↔ 3D Interoperability

### Forward Workflow

```
Draw 2D profile (POLYLINE / CIRCLE)
      ↓
EXTRUDE → OCC prism → tessellate → Three.js Mesh
      ↓
Result exists in both entity store (as Solid3D)
and scene graph (as Mesh)
```

### ELEV/THICKNESS Workflow (R12 Compatible)

```
Set ELEV 100           -- entities created at Z=100
Set THICKNESS 50       -- entities have 50 units of depth

Draw LINE              -- stored with elevation=100, thickness=50
                       -- rendered as 3D face without OCC
```

### Reverse Workflow (Phase G)

```
3D solid view
      ↓
HLRBRep_Algo (in Worker)
      ↓
2D projected visible/hidden line geometry
      ↓
Can be output to 2D viewport or DXF
```

---

## 5.11 Boolean Operations (Corrected)

### Goal

Simple solid editing with robust error handling.

---

### ⚠️ OCC Booleans Can Fail — Error Handling Required

> The original PRD showed only the happy path. OCC boolean operations
> fail silently or produce invalid shapes on degenerate/near-tangent
> input. A production implementation must handle all failure modes.

```
FUNCTION booleanSubtract(shapeA, shapeB):

  op = new oc.BRepAlgoAPI_Cut_3(shapeA, shapeB, new oc.Message_ProgressRange_1())
  op.Build(new oc.Message_ProgressRange_1())

  -- Check 1: operation completed
  IF NOT op.IsDone() THEN
    op.delete()
    RETURN { error: "Boolean subtract failed — shapes may be non-manifold" }
  END IF

  result = op.Shape()

  -- Check 2: result is non-null
  IF result.IsNull() THEN
    op.delete()
    RETURN { error: "Boolean result is null — check for coincident faces" }
  END IF

  -- Check 3: result is valid
  checker = new oc.BRepCheck_Analyzer(result, true)
  IF NOT checker.IsValid() THEN
    op.delete()
    checker.delete()
    RETURN { error: "Boolean result shape is invalid" }
  END IF

  mesh = tessellate(result)
  op.delete()
  result.delete()
  checker.delete()

  RETURN { mesh: mesh }

END FUNCTION
```

---

### Boolean Commands

| Command   | OCC Class                   |
| --------- | --------------------------- |
| UNION     | BRepAlgoAPI_Fuse            |
| SUBTRACT  | BRepAlgoAPI_Cut             |
| INTERSECT | BRepAlgoAPI_Common          |

---

### Deliverable

✔ Basic mechanical modeling with validated boolean output

---

## 5.12 Rendering Performance

### Goal

Maintain responsive browser CAD at medium model complexity.

---

### Optimizations

**1. Geometry Caching**

```
-- Key tessellated meshes by OCC shape hash
meshCache : Map<ShapeHash, BufferGeometry>

FUNCTION getOrTessellate(shape):
  hash = computeShapeHash(shape)
  IF meshCache.has(hash) THEN RETURN meshCache.get(hash)
  mesh = tessellate(shape)
  meshCache.set(hash, mesh)
  RETURN mesh
```

**2. three-mesh-bvh for picking**

```
-- After creating geometry:
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
geometry.computeBoundsTree()
-- Raycaster.intersectObject now uses BVH acceleration
```

**3. Dirty Render**

```
-- Do not render every animation frame if nothing changed
FUNCTION onEntityChanged():
  needsRender = true

FUNCTION animate():
  IF needsRender THEN
    renderFrame()
    needsRender = false
  END IF
  requestAnimationFrame(animate)
```

**4. Instanced Rendering**

For repeated geometry (bolts, screws, repeated parts):

```
THREE.InstancedMesh(geometry, material, count)
```

**5. Frustum Culling**

Three.js does this automatically per mesh. Ensure each
solid is one Mesh object, not a collection of sub-meshes.

---

### Performance Targets

| Entity Type       | Target Count | Notes                          |
| ----------------- | ------------ | ------------------------------ |
| 2D entities       | 50,000+      | Line batching, existing system |
| 3D solid meshes   | 500–2,000    | Depends on tessellation quality|
| Triangle count    | < 2M total   | Above this, LOD required       |

> Note: "10k+ 3D entities" from the original PRD is unrealistic for
> OCC-tessellated solids at standard quality. 500–2,000 medium-complexity
> solids is a more accurate browser-WebGL target.

---

# 🧩 6. Data Model Extensions

## 6.1 3D Entity Types

```
Solid3D {
  id         : String
  type       : "BOX" | "CYLINDER" | "CONE" | "SPHERE" | "EXTRUSION" | "REVOLUTION" | "BOOLEAN"
  layer      : String
  transform  : Transform
  occShape   : TopoDS_Shape    -- live OCC object (Worker-side only)
  mesh       : BufferGeometry  -- tessellated Three.js geometry (main thread)
  metadata   : Object
}

Surface3D {
  id         : String
  layer      : String
  transform  : Transform
  mesh       : BufferGeometry
}
```

## 6.2 Extended 2D Entity Properties

```
-- Added to all existing 2D entities for R12 compatibility:
Entity {
  ...existing fields...
  elevation  : Float     -- Z base (set by ELEV command), default 0
  thickness  : Float     -- extrusion depth (set by ELEV command), default 0
}
```

## 6.3 Transform System

```
Transform {
  position : Vector3D
  rotation : Euler3D    -- or Quaternion
  scale    : Vector3D
}
```

---

# 🧠 7. Command Additions

## View Commands

| Command     | Purpose                                   |
| ----------- | ----------------------------------------- |
| VIEW        | Save / restore named camera states        |
| PLAN        | Set top orthographic view                 |
| VPOINT      | Set camera direction (vector or angles)   |
| UCS         | Manage user coordinate systems            |
| UCSICON     | Toggle UCS indicator display              |

## 3D Geometry Commands

| Command    | Purpose                                   |
| ---------- | ----------------------------------------- |
| ELEV       | Set elevation and thickness for 2D entities |
| BOX        | Create box primitive                      |
| CYLINDER   | Create cylinder primitive                 |
| CONE       | Create cone primitive                     |
| SPHERE     | Create sphere primitive                   |
| EXTRUDE    | Extrude 2D profile to solid               |
| REVOLVE    | Revolve 2D profile around axis            |

## Visual Commands

| Command     | Purpose                                   |
| ----------- | ----------------------------------------- |
| WIREFRAME   | Set wireframe render mode                 |
| SHADE       | Set shaded render mode (hidden surface)   |
| HIDE        | Set shaded + edges mode                   |

> Note: HIDE in AutoCAD R12 performed true hidden-line projection.
> In this implementation, Phase E HIDE = "Shaded with Edges" (Mode A).
> True vector HLR is Phase G.

## Boolean Commands

| Command   | Purpose                              |
| --------- | ------------------------------------ |
| UNION     | Fuse two solids                      |
| SUBTRACT  | Subtract solid B from solid A        |
| INTERSECT | Intersection of two solids           |

---

# 📐 8. Viewport Rendering Pipeline

```
CAD Entities (2D + 3D)
      |
      +-- 2D entities → existing line/arc geometry → BufferGeometry
      |
      +-- 3D entities → OCC shape (Worker) → tessellate → BufferGeometry
      |
      v
Three.js Scene (shared across all viewports)
      |
      v
Per-frame: FOR EACH viewport
  setScissor + setViewport
  renderer.render(scene, viewport.camera)
      |
      v
Canvas (single WebGL context)
```

---

# 🚀 9. Implementation Phases (Corrected Order)

> ⚠️ The original PRD had Phase B (3D Primitives) before Phase C
> (OpenCascade Integration). This is wrong — primitives require OCC.
> The corrected order is below.

---

## Phase A — Viewports & Cameras

**Implement:**

- Single renderer + scissor/viewport multi-pass
- Orthographic camera (4 standard views: TOP, FRONT, LEFT, ISO)
- Perspective camera (free view)
- Named view presets with VPOINT and PLAN commands
- Custom orbit (spherical coords, no gimbal lock)
- Cross-viewport entity synchronization

---

## Phase B — OCC Worker Bridge

**Implement:**

- opencascade.js WASM initialization (async)
- Web Worker message queue
- Tessellation engine (configurable deflection)
- Memory management wrappers (auto .delete())
- Shape hash cache for tessellated meshes
- Status bar feedback during OCC init and long operations

---

## Phase C — 3D Primitives (requires Phase B)

**Implement:**

- ELEV / THICKNESS commands (2D entity Z extension, no OCC)
- BOX via BRepPrimAPI_MakeBox
- CYLINDER via BRepPrimAPI_MakeCylinder
- CONE via BRepPrimAPI_MakeCone
- SPHERE via BRepPrimAPI_MakeSphere
- 3D Coordinate input parser (x,y,z and @dx,dy,dz)
- UCS origin indicator rendering

---

## Phase D — Profile Operations (requires Phase B + C)

**Implement:**

- EXTRUDE — closed polyline/circle → OCC prism
- REVOLVE — profile + axis → OCC revolution
- 2D-to-OCC profile converter (polyline → wire → face)

---

## Phase E — Rendering Modes

**Implement:**

- WIREFRAME mode
- SHADED mode (MeshPhongMaterial)
- SHADED_EDGES mode (shaded + EdgesGeometry overlay)
- SHADE / HIDE / WIREFRAME commands
- Per-viewport render mode setting

---

## Phase F — Boolean Operations (requires Phase B)

**Implement:**

- UNION (BRepAlgoAPI_Fuse)
- SUBTRACT (BRepAlgoAPI_Cut)
- INTERSECT (BRepAlgoAPI_Common)
- Full error handling + shape validation
- Undo/redo for boolean results

---

## Phase G — True HLR + STEP Export (optional)

**Implement:**

- HLRBRep_Algo → 2D projected linework in Worker
- Visible / hidden line output (dashed hidden lines)
- STEPControl_Writer → STEP file download

---

# ⚠️ 10. Engineering Risks (Updated)

## 1. opencascade.js Bundle Size

- ~25 MB WASM download on first load
- Mitigation: lazy-load only when first 3D command is issued
- Show progress in status bar: "Loading geometry kernel (12 MB / 25 MB)"
- Cache in browser via Service Worker or IndexedDB

## 2. Boolean Operation Reliability

- OCC booleans fail on near-tangent, coincident-face, or
  non-manifold input geometry
- Mitigation: validate all inputs before boolean, wrap in
  try/catch + IsDone() check, never commit failed results

## 3. WASM Memory Exhaustion

- Every un-deleted OCC object leaks WASM heap
- Mitigation: withOCC() wrapper enforces cleanup,
  monitor heap usage in development builds

## 4. Tessellation Performance

- Complex solids (many faces) can take 500ms–2000ms to tessellate
- Mitigation: run in Worker, cache by shape hash,
  use coarse preview deflection during interactive commands

## 5. True HLR Cost

- HLRBRep_Algo projection is expensive for complex assemblies
- Mitigation: cache per view angle, only recompute on
  camera or model change, make it an explicit user-triggered command

## 6. 2D / 3D Entity Synchronization

- Modifying a 2D entity that was used as an extrusion profile
  does not automatically update the resulting solid
- Mitigation: store the profile entity ID in the Solid3D metadata,
  flag the solid as "profile modified" for user review

---

# 🎯 11. Success Criteria

## Functional

✔ User can create 3D primitives (BOX, CYLINDER, SPHERE)
✔ User can extrude and revolve 2D profiles
✔ User can switch between 4 standard orthographic views
✔ User can navigate in 3D without gimbal lock
✔ User can use multiple synchronized viewports
✔ User can perform basic boolean operations
✔ UCS coordinate input transforms correctly to world space
✔ ELEV/THICKNESS works for R12-style 2.5D

## Performance

✔ Viewport render: ≥ 30 fps with up to 2,000 solid objects
✔ Boolean operation: feedback within 3 seconds on medium solids
✔ OCC initialization: status bar progress, non-blocking

## Robustness

✔ Boolean failures produce user-facing error messages
✔ OCC objects are always cleaned up (no WASM heap leak)
✔ Top-view orbit does not gimbal-lock

---

# 🧭 12. Strategic Scope Limitations

This PRD intentionally excludes:

❌ Full history-based parametrics
❌ Assembly constraints
❌ Full BIM
❌ Advanced surfacing (NURBS)
❌ Manufacturing CAM
❌ FEA simulation
❌ Full AutoCAD ACIS solid kernel compatibility
❌ Real-time ray tracing

---

# 🧭 13. Final Positioning

After this PRD:

```
WebCAD evolves from:

  "2D drafting system"

into:

  "Lightweight browser-native engineering CAD platform"
```

with:

- real geometry kernel (opencascade.js)
- real multi-viewport rendering (scissor-based, single GL context)
- real projections (VPOINT vector format, named views)
- real 3D solids (OCC BRep with tessellation)
- real UCS (coordinate input transformation)
- browser deployment
- STEP export ready (Phase G)
