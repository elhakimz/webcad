BASIC 3D ENTITIES

# WebCAD — Basic 3D Geometry System Pseudocode

## (Three.js + OpenCascade Architecture)

This pseudocode covers the foundational 3D geometry layer for WebCAD.

Goal:

* simple engineering solids
* browser-friendly
* CAD-style architecture
* OpenCascade-backed geometry
* Three.js rendering

---

# 1. 3D Geometry Architecture

```text id="1w0xj9"
CAD Command
      ↓
3D Geometry Builder
      ↓
OpenCascade Shape
      ↓
Tessellation
      ↓
Three.js Mesh
      ↓
Scene Graph
```

---

# 2. Core 3D Entity Model

---

# Base Entity

```text id="lhdbjl"
ENTITY_3D {

    id
    type

    transform

    occShape

    mesh

    bounds

    layer

    metadata
}
```

---

# Transform Structure

```text id="5b0n06"
TRANSFORM {

    position
    rotation
    scale
}
```

---

# 3. Geometry Kernel Wrapper

Abstract OpenCascade access.

```text id="uyv8g0"
CLASS OCC_KERNEL

    FUNCTION makeBox()

    FUNCTION makeCylinder()

    FUNCTION makeSphere()

    FUNCTION extrude()

    FUNCTION revolve()

    FUNCTION booleanUnion()

    FUNCTION tessellate()

END CLASS
```

---

# 4. BOX Command

Creates rectangular prism.

---

# Workflow

```text id="k1qy1n"
BOX
  ↓
Get corner
  ↓
Get dimensions
  ↓
Create OCC box
  ↓
Tessellate
  ↓
Create mesh
```

---

# Main BOX Command

```text id="v0jjlwm"
FUNCTION BOX_COMMAND()

    corner =
        getPoint3D(
            "Specify corner:"
        )

    length =
        getDistance("Length:")

    width =
        getDistance("Width:")

    height =
        getDistance("Height:")

    entity =
        createBoxEntity(
            corner,
            length,
            width,
            height
        )

    addEntityToDrawing(entity)

    redrawScene()

END FUNCTION
```

---

# Create Box Entity

```text id="jlwm50"
FUNCTION createBoxEntity(
    corner,
    length,
    width,
    height
)

    occShape =
        OCC.makeBox(
            corner,
            length,
            width,
            height
        )

    mesh =
        tessellateShape(
            occShape
        )

    entity =
        new ENTITY_3D()

    entity.type = BOX
    entity.occShape = occShape
    entity.mesh = mesh

    RETURN entity

END FUNCTION
```

---

# 5. CYLINDER Command

---

# Workflow

```text id="jlwm33"
Center
  ↓
Radius
  ↓
Height
  ↓
Create OCC cylinder
```

---

# Main Command

```text id="6jlwmf"
FUNCTION CYLINDER_COMMAND()

    center =
        getPoint3D()

    radius =
        getDistance()

    height =
        getDistance()

    occShape =
        OCC.makeCylinder(
            center,
            radius,
            height
        )

    entity =
        buildSolidEntity(
            occShape
        )

    addEntityToDrawing(entity)

END FUNCTION
```

---

# 6. SPHERE Command

```text id="5jlwmn"
FUNCTION SPHERE_COMMAND()

    center = getPoint3D()

    radius = getDistance()

    occShape =
        OCC.makeSphere(
            center,
            radius
        )

    entity =
        buildSolidEntity(
            occShape
        )

    addEntityToDrawing(entity)

END FUNCTION
```

---

# 7. CONE Command

```text id="jlwm7h"
FUNCTION CONE_COMMAND()

    center = getPoint3D()

    baseRadius =
        getDistance()

    topRadius =
        getDistance()

    height =
        getDistance()

    occShape =
        OCC.makeCone(
            center,
            baseRadius,
            topRadius,
            height
        )

END FUNCTION
```

---

# 8. EXTRUDE Command

Most important basic 3D operation.

---

# Workflow

```text id="jlwm9j"
2D profile
      ↓
Height vector
      ↓
OpenCascade prism
      ↓
Solid
```

---

# Supported Inputs

| Entity          | Supported |
| --------------- | --------- |
| Closed polyline | YES       |
| Circle          | YES       |
| Region          | YES       |
| Open polyline   | NO        |

---

# Main EXTRUDE Command

```text id="jlwm1u"
FUNCTION EXTRUDE_COMMAND()

    profile =
        selectClosedProfile()

    height =
        getDistance(
            "Extrusion height:"
        )

    occWire =
        convertProfileToWire(
            profile
        )

    occFace =
        OCC.makeFace(
            occWire
        )

    occSolid =
        OCC.extrude(
            occFace,
            VECTOR(0,0,height)
        )

    entity =
        buildSolidEntity(
            occSolid
        )

    addEntityToDrawing(entity)

    redrawScene()

END FUNCTION
```

---

# 9. REVOLVE Command

---

# Workflow

```text id="jlwm7d"
2D profile
      ↓
Rotation axis
      ↓
Sweep angle
      ↓
Solid of revolution
```

---

# Pseudocode

```text id="jlwmn0"
FUNCTION REVOLVE_COMMAND()

    profile =
        selectProfile()

    axis =
        getAxis()

    angle =
        getAngle()

    occSolid =
        OCC.revolve(
            profile,
            axis,
            angle
        )

    entity =
        buildSolidEntity(
            occSolid
        )

    addEntityToDrawing(entity)

END FUNCTION
```

---

# 10. Build Solid Entity

Shared solid constructor.

```text id="jlwm1x"
FUNCTION buildSolidEntity(
    occShape
)

    mesh =
        tessellateShape(
            occShape
        )

    entity =
        new ENTITY_3D()

    entity.type = SOLID3D

    entity.occShape =
        occShape

    entity.mesh =
        mesh

    computeBounds(entity)

    RETURN entity

END FUNCTION
```

---

# 11. Tessellation Pipeline

Critical bridge:
OpenCascade → Three.js

---

# Workflow

```text id="3jlwm4"
OCC Shape
    ↓
Triangulation
    ↓
Vertex arrays
    ↓
BufferGeometry
    ↓
Mesh
```

---

# Main Tessellation

```text id="9jlwmw"
FUNCTION tessellateShape(
    occShape
)

    triangles =
        OCC.tessellate(
            occShape
        )

    geometry =
        new BufferGeometry()

    geometry.vertices =
        triangles.vertices

    geometry.normals =
        triangles.normals

    mesh =
        new Mesh(
            geometry,
            defaultMaterial
        )

    RETURN mesh

END FUNCTION
```

---

# 12. Wireframe Generation

CAD default visualization.

```text id="8jlwm0"
FUNCTION createWireframe(mesh)

    edges =
        new EdgesGeometry(
            mesh.geometry
        )

    lineSegments =
        new LineSegments(edges)

    RETURN lineSegments

END FUNCTION
```

---

# 13. Rendering Modes

---

# Render Mode Dispatcher

```text id="5jlwmj"
FUNCTION applyRenderMode(
    entity,
    mode
)

    SWITCH mode

        CASE WIREFRAME:

            showWireframe()

        CASE SHADED:

            showShaded()

        CASE SHADED_EDGES:

            showShadedAndEdges()

END FUNCTION
```

---

# 14. Boolean Operations

---

# UNION

```text id="jlwmf4"
FUNCTION UNION_COMMAND()

    solidA =
        selectSolid()

    solidB =
        selectSolid()

    result =
        OCC.booleanUnion(
            solidA.occShape,
            solidB.occShape
        )

    entity =
        buildSolidEntity(result)

    replaceEntities(
        solidA,
        solidB,
        entity
    )

END FUNCTION
```

---

# SUBTRACT

```text id="jlwm67"
FUNCTION SUBTRACT_COMMAND()

    target =
        selectSolid()

    cutter =
        selectSolid()

    result =
        OCC.booleanSubtract(
            target.occShape,
            cutter.occShape
        )

END FUNCTION
```

---

# 15. 3D Selection System

---

# Raycast Picking

```text id="jlwm7w"
FUNCTION pick3DEntity(mouse)

    ray =
        viewport.camera
            .createRay(mouse)

    hits =
        raycastScene(ray)

    RETURN nearestHit(hits)

END FUNCTION
```

---

# 16. Orbit Navigation

---

# Orbit Camera

```text id="jlwm2v"
FUNCTION orbitCamera(
    deltaX,
    deltaY
)

    camera.theta += deltaX

    camera.phi += deltaY

    updateCameraPosition()

END FUNCTION
```

---

# 17. Orthographic Views

---

# TOP View

```text id="jlwm5q"
FUNCTION setTopView()

    camera.position =
        (0,0,+distance)

    camera.lookAt(0,0,0)

END FUNCTION
```

---

# ISOMETRIC View

```text id="jlwm0f"
FUNCTION setIsometricView()

    camera.position =
        (1,1,1) * distance

    camera.lookAt(0,0,0)

END FUNCTION
```

---

# 18. Hidden-Line Rendering

MVP approach.

```text id="jlwm9v"
FUNCTION renderHiddenLine()

    enableDepthTest()

    renderEdgesOnly()

END FUNCTION
```

---

# 19. Bounding Box Computation

```text id="jlwmr7"
FUNCTION computeBounds(entity)

    bounds =
        Box3.fromObject(
            entity.mesh
        )

    entity.bounds = bounds

END FUNCTION
```

---

# 20. Scene Graph Integration

```text id="1jlwm8"
FUNCTION addEntityToDrawing(entity)

    drawing.entities.add(entity)

    scene.add(entity.mesh)

END FUNCTION
```

---

# 21. Undo Support

```text id="3jlwm2"
FUNCTION beginUndoGroup()

    snapshotDrawingState()

END FUNCTION
```

---

# 22. Recommended MVP Scope

IMPLEMENT FIRST:

| Feature            | Priority  |
| ------------------ | --------- |
| BOX                | HIGH      |
| CYLINDER           | HIGH      |
| EXTRUDE            | VERY HIGH |
| Orbit              | HIGH      |
| Orthographic views | HIGH      |
| Wireframe          | HIGH      |
| Shaded mode        | HIGH      |

---

# 23. Features to Delay

DEFER:

* NURBS surfaces
* filleted solids
* shelling
* chamfer solids
* assemblies
* constraints
* parametric history

---

# 24. Recommended Final Architecture

```text id="jlwmw0"
2D Geometry
      ↓
OpenCascade Shape
      ↓
Tessellation
      ↓
Three.js Mesh
      ↓
Viewport Renderer
```

This architecture is:

* industrial-grade
* browser-compatible
* scalable
* CAD-oriented
* suitable for future STEP/BREP support.
