OpenCascade Integration

Module/Code Directory : /oci

# OpenCascade Integration — WebCAD Pseudocode Architecture

## (Three.js + OpenCascade + Browser CAD)

---

# 1. Integration Goal

OpenCascade will act as:

```text id="vaxlpr"
Geometry Kernel Layer
```

responsible for:

* BRep solids
* extrusion
* boolean operations
* topology
* tessellation
* STEP/IGES support (future)

while Three.js handles:

* rendering
* viewport interaction
* selection visualization

---

# 2. High-Level Architecture

```text id="v9p2nn"
2D CAD Entities
        ↓
Geometry Converter
        ↓
OpenCascade Shape Builder
        ↓
TopoDS_Shape
        ↓
Mesh Tessellation
        ↓
Three.js BufferGeometry
        ↓
Viewport Rendering
```

---

# 3. Core System Layers

```text id="mf6e4v"
+----------------------------------+
| WebCAD Command System            |
+----------------------------------+
                ↓
+----------------------------------+
| CAD Entity Database              |
+----------------------------------+
                ↓
+----------------------------------+
| OCC Integration Layer            |
|----------------------------------|
| Shape Builder                    |
| Tessellator                      |
| Boolean Engine                   |
| Shape Cache                      |
+----------------------------------+
                ↓
+----------------------------------+
| OpenCascade WASM                 |
+----------------------------------+
                ↓
+----------------------------------+
| Three.js Renderer                |
+----------------------------------+
```

---

# 4. OpenCascade Runtime Initialization

Usually:

* OpenCascade compiled to WASM
* loaded asynchronously

---

# 5. OCC Runtime Loader

```text id="jlwmr9"
GLOBAL occRuntime

FUNCTION initializeOCC()

    occRuntime =
        loadOpenCascadeWASM()

    waitUntilInitialized()

    print("OpenCascade Ready")

END FUNCTION
```

---

# 6. Shape Wrapper Object

VERY important abstraction.

---

## Shape Structure

```text id="jlwm3f"
Shape3D {

    id

    occShape

    mesh

    topology

    metadata

    dirty

}
```

---

# 7. Geometry Ownership Flow

```text id="jlwmq0"
CAD Entity
      ↓
OpenCascade Shape
      ↓
Three.js Mesh
```

OpenCascade is authoritative geometry source.

NOT Three.js mesh.

This is VERY important.

---

# 8. Example — BOX Command

---

## User Flow

```text id="jlwmx8"
BOX
Specify corner
Specify dimensions
```

---

## Command Pseudocode

```text id="jlwmv4"
FUNCTION BOX_COMMAND()

    origin =
        getPoint()

    width =
        getDistance()

    height =
        getDistance()

    depth =
        getDistance()

    shape =
        OCC_CREATE_BOX(
            origin,
            width,
            height,
            depth
        )

    entity =
        createSolidEntity(shape)

    addEntity(entity)

END FUNCTION
```

---

# 9. OpenCascade Box Creation

---

## OCC Box Builder

```text id="jlwmw3"
FUNCTION OCC_CREATE_BOX(
    origin,
    width,
    height,
    depth
)

    boxMaker =
        new occRuntime.BRepPrimAPI_MakeBox(
            width,
            height,
            depth
        )

    shape =
        boxMaker.Shape()

    translateShape(shape, origin)

    RETURN shape

END FUNCTION
```

---

# 10. Entity Creation

```text id="jlwm7n"
FUNCTION createSolidEntity(occShape)

    mesh =
        tessellateShape(occShape)

    entity = {
        type: "SOLID3D",
        occShape: occShape,
        mesh: mesh
    }

    RETURN entity

END FUNCTION
```

---

# 11. Tessellation Pipeline

Most important rendering bridge.

---

# OCC Shape → Triangle Mesh

```text id="jlwmk7"
TopoDS_Shape
      ↓
BRepMesh_IncrementalMesh
      ↓
Face Triangles
      ↓
BufferGeometry
      ↓
Three.js Mesh
```

---

# 12. Tessellate Shape

```text id="jlwm2r"
FUNCTION tessellateShape(shape)

    performIncrementalMesh(shape)

    triangles =
        extractTriangles(shape)

    geometry =
        createBufferGeometry(
            triangles
        )

    mesh =
        new THREE.Mesh(
            geometry,
            defaultMaterial
        )

    RETURN mesh

END FUNCTION
```

---

# 13. Incremental Meshing

Controls tessellation quality.

---

## OCC Mesher

```text id="jlwmc8"
FUNCTION performIncrementalMesh(shape)

    mesher =
        new occRuntime.BRepMesh_IncrementalMesh(

            shape,

            DEFLECTION,

            ANGULAR_DEFLECTION

        )

END FUNCTION
```

---

# 14. Extract Triangle Data

---

## Triangle Traversal

```text id="jlwm9d"
FUNCTION extractTriangles(shape)

    triangles = []

    faces =
        getShapeFaces(shape)

    FOR EACH face

        triangulation =
            getFaceTriangulation(face)

        FOR EACH triangle

            triangles.add(
                convertTriangle()
            )

    RETURN triangles

END FUNCTION
```

---

# 15. Convert to Three.js Geometry

```text id="jlwm4m"
FUNCTION createBufferGeometry(
    triangles
)

    positions = []
    normals = []

    FOR EACH triangle

        appendVertices()

        appendNormals()

    geometry =
        new THREE.BufferGeometry()

    geometry.setAttribute(
        "position",
        positions
    )

    geometry.setAttribute(
        "normal",
        normals
    )

    RETURN geometry

END FUNCTION
```

---

# 16. EXTRUDE Integration

---

# Workflow

```text id="jlwmk0"
2D Polyline
      ↓
Wire
      ↓
Face
      ↓
Prism Extrusion
      ↓
Solid
```

---

## Extrude Pseudocode

```text id="jlwm2u"
FUNCTION OCC_EXTRUDE(
    profile,
    direction,
    height
)

    wire =
        createWire(profile)

    face =
        createFace(wire)

    vector =
        direction * height

    prism =
        new occRuntime.BRepPrimAPI_MakePrism(
            face,
            vector
        )

    RETURN prism.Shape()

END FUNCTION
```

---

# 17. Polyline → OCC Wire

---

## Wire Builder

```text id="jlwm0s"
FUNCTION createWire(polyline)

    wireBuilder =
        new occRuntime.BRepBuilderAPI_MakeWire()

    vertices =
        polyline.vertices

    FOR i = 0 TO vertices.count-2

        edge =
            createEdge(
                vertices[i],
                vertices[i+1]
            )

        wireBuilder.Add(edge)

    RETURN wireBuilder.Wire()

END FUNCTION
```

---

# 18. Boolean Operations

---

# UNION

```text id="jlwm1s"
FUNCTION OCC_UNION(a, b)

    fuse =
        new occRuntime.BRepAlgoAPI_Fuse(
            a,
            b
        )

    RETURN fuse.Shape()

END FUNCTION
```

---

# SUBTRACT

```text id="jlwmv0"
FUNCTION OCC_SUBTRACT(a, b)

    cut =
        new occRuntime.BRepAlgoAPI_Cut(
            a,
            b
        )

    RETURN cut.Shape()

END FUNCTION
```

---

# INTERSECT

```text id="jlwmh3"
FUNCTION OCC_INTERSECT(a, b)

    common =
        new occRuntime.BRepAlgoAPI_Common(
            a,
            b
        )

    RETURN common.Shape()

END FUNCTION
```

---

# 19. Shape Update Pipeline

When geometry changes:

```text id="jlwm5j"
Modify OCC Shape
        ↓
Retessellate
        ↓
Replace Three.js Geometry
        ↓
Redraw
```

---

# 20. Mesh Replacement

```text id="jlwmk2"
FUNCTION updateEntityMesh(entity)

    oldMesh =
        entity.mesh

    removeFromScene(oldMesh)

    newMesh =
        tessellateShape(
            entity.occShape
        )

    entity.mesh =
        newMesh

    addToScene(newMesh)

END FUNCTION
```

---

# 21. Hidden Line Rendering

---

## MVP Approach

Use:

* mesh edges
* depth testing

---

## Advanced Future

True OCC projection.

---

# 22. Edge Extraction

```text id="jlwm6p"
FUNCTION extractEdges(shape)

    edges =
        getShapeEdges(shape)

    lineGeometry =
        convertEdgesToLines()

    RETURN lineGeometry

END FUNCTION
```

---

# 23. Shape Cache System

Very important for performance.

---

## Cache Structure

```text id="jlwm3n"
ShapeCache {

    shapeHash

    tessellation

    edgeGeometry

}
```

---

# 24. Dirty Flag System

Avoid unnecessary retessellation.

```text id="jlwms4"
IF entity.dirty

    retessellate()
```

---

# 25. Shape Serialization

Future feature.

---

## STEP Export

```text id="jlwm9m"
FUNCTION exportSTEP(shape)
```

---

## BREP Export

```text id="jlwmq9"
FUNCTION exportBREP(shape)
```

---

# 26. Selection Integration

Three.js raycasting:

* selects mesh
* maps back to OCC shape

---

## Selection Flow

```text id="jlwm2w"
Raycast
    ↓
Three.js Mesh
    ↓
Entity ID
    ↓
OpenCascade Shape
```

---

# 27. Memory Management

VERY important with OCC WASM.

---

## Dispose Shapes

```text id="jlwm0d"
FUNCTION disposeShape(shape)

    shape.delete()

END FUNCTION
```

Failure causes:

* WASM memory leaks

---

# 28. Recommended MVP Scope

IMPLEMENT FIRST:

✔ BOX
✔ CYLINDER
✔ EXTRUDE
✔ UNION
✔ SUBTRACT
✔ Tessellation
✔ Orthographic Viewports

---

SKIP INITIALLY:

❌ filleted solids
❌ NURBS surfaces
❌ shelling
❌ advanced healing
❌ topology naming

---

# 29. Recommended Three.js Rendering

Use:

```text id="jlwmu5"
MeshPhongMaterial
```

or:

```text id="jlwm7d"
MeshStandardMaterial
```

with:

* edge overlays
* CAD colors
* orthographic camera

---

# 30. Recommended Rendering Style

BEST CAD LOOK:

```text id="jlwmm2"
Shaded + visible edges
```

Like:

* Fusion 360
* SolidWorks
* AutoCAD Conceptual

---

# 31. Final Recommended Architecture

```text id="jlwmf3"
CAD Entities
      ↓
OpenCascade Shapes
      ↓
Tessellation Layer
      ↓
Three.js Geometry
      ↓
Viewport Renderer
```

---

# 32. Most Important Architectural Principle

NEVER treat:

* Three.js mesh

as the real geometry.

Always:

```text id="jlwm7m"
OpenCascade shape
=
authoritative geometry
```

Three.js is only:

* visualization
* interaction layer
* viewport renderer

This principle will save your architecture later.
