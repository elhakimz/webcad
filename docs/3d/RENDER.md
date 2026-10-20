RENDER
Module Dir : /render

# WebCAD Rendering Modes — Detailed Pseudocode

## (Three.js + OpenCascade)

Rendering modes control how CAD entities and 3D solids are visually displayed inside viewports.

Classic CAD modes:

* Wireframe
* Hidden Line
* Shaded
* Shaded with Edges
* X-Ray

---

# 1. Rendering Mode Architecture

```text id="s8s9zy"
Viewport
    ↓
Render Mode Manager
    ↓
Entity Render Pipeline
    ↓
Three.js Materials
    ↓
GPU Rendering
```

---

# 2. Supported Rendering Modes

| Mode              | Description          |
| ----------------- | -------------------- |
| 2D Wireframe      | classic drafting     |
| 3D Wireframe      | edges only           |
| Hidden Line       | visible edges only   |
| Flat Shaded       | simple lighting      |
| Smooth Shaded     | interpolated normals |
| Shaded with Edges | CAD standard         |
| X-Ray             | transparent solids   |

---

# 3. Render Mode Enum

```text id="cik6rm"
RENDER_MODE = {

    WIREFRAME_2D,
    WIREFRAME_3D,

    HIDDEN_LINE,

    SHADED_FLAT,
    SHADED_SMOOTH,

    SHADED_WITH_EDGES,

    XRAY
}
```

---

# 4. Viewport Structure

```text id="r4vtmi"
Viewport {

    id

    camera

    renderMode

    scene

    renderer
}
```

---

# 5. Main Render Dispatcher

```text id="jlwm8d"
FUNCTION renderViewport(viewport)

    clearViewport()

    SWITCH viewport.renderMode

        CASE WIREFRAME_2D:

            render2DWireframe()

        CASE WIREFRAME_3D:

            render3DWireframe()

        CASE HIDDEN_LINE:

            renderHiddenLine()

        CASE SHADED_FLAT:

            renderFlatShaded()

        CASE SHADED_SMOOTH:

            renderSmoothShaded()

        CASE SHADED_WITH_EDGES:

            renderShadedWithEdges()

        CASE XRAY:

            renderXRay()

END FUNCTION
```

---

# 6. Shared Rendering Pipeline

```text id="jlwm3k"
CAD Entities
      ↓
Visibility Filtering
      ↓
Render Mode Conversion
      ↓
Three.js Scene
      ↓
GPU Render
```

---

# 7. 2D Wireframe Mode

Classic drafting mode.

---

## Characteristics

* lines only
* no shading
* orthographic
* fastest mode

---

## Pseudocode

```text id="jlwm9r"
FUNCTION render2DWireframe()

    FOR EACH entity

        lineGeometry =
            entity.lineGeometry

        addToScene(lineGeometry)

    renderer.render(scene, camera)

END FUNCTION
```

---

# 8. 3D Wireframe Mode

Display:

* edges only
* no faces

---

## Three.js Material

```text id="jlwmh8"
material =
    MeshBasicMaterial({
        wireframe: TRUE
    })
```

---

## Pseudocode

```text id="jlwm5q"
FUNCTION render3DWireframe()

    FOR EACH solid

        mesh =
            solid.mesh

        mesh.material =
            wireframeMaterial

        addToScene(mesh)

    renderer.render(scene, camera)

END FUNCTION
```

---

# 9. Hidden Line Mode

Classic engineering display.

Visible edges only.

---

# 9.1 MVP Strategy

Use:

* depth buffer
* edge extraction

---

# 9.2 Workflow

```text id="jlwm1m"
Render depth
      ↓
Extract visible edges
      ↓
Hide obscured edges
      ↓
Render line overlay
```

---

# 9.3 Pseudocode

```text id="8rl8ii"
FUNCTION renderHiddenLine()

    hideFaceMaterials()

    visibleEdges =
        computeVisibleEdges()

    renderEdgesOnly(
        visibleEdges
    )

END FUNCTION
```

---

# 10. Edge Extraction

Use:

* OpenCascade topology
* Three.js EdgesGeometry

---

## Example

```text id="jlwm4d"
edges =
    new THREE.EdgesGeometry(
        mesh.geometry
    )
```

---

# 11. Flat Shaded Mode

Simple polygon shading.

---

## Material

```text id="jlwmj3"
material =
    MeshPhongMaterial({
        flatShading: TRUE
    })
```

---

## Pseudocode

```text id="jlwmn6"
FUNCTION renderFlatShaded()

    FOR EACH solid

        solid.material =
            flatMaterial

    renderScene()

END FUNCTION
```

---

# 12. Smooth Shaded Mode

Interpolated normals.

---

## Material

```text id="jlwmq9"
material =
    MeshStandardMaterial({
        flatShading: FALSE
    })
```

---

# 13. Shaded with Edges

MOST IMPORTANT CAD MODE.

Industry-standard appearance.

---

# 13.1 Workflow

```text id="jlwm3w"
Render shaded mesh
      ↓
Overlay edge lines
```

---

# 13.2 Pseudocode

```text id="y5jlwm"
FUNCTION renderShadedWithEdges()

    renderShadedPass()

    renderEdgeOverlay()

END FUNCTION
```

---

# 13.3 Edge Overlay

```text id="jlwm8f"
FUNCTION renderEdgeOverlay()

    FOR EACH solid

        edgeGeometry =
            solid.edgeGeometry

        addLineOverlay()

END FUNCTION
```

---

# 14. X-Ray Mode

Transparent solids.

Useful for:

* internal visibility
* assembly inspection

---

## Material

```text id="jlwm2u"
material =
    MeshPhongMaterial({

        transparent: TRUE,

        opacity: 0.3
    })
```

---

# 15. Render Pass System

Recommended architecture.

```text id="jlwm1x"
MAIN PASS
    ↓
EDGE PASS
    ↓
OVERLAY PASS
```

---

# 16. Layer Visibility Filtering

Before rendering:

```text id="jlwmr7"
FUNCTION filterVisibleEntities()

    FOR EACH entity

        IF entity.layer.visible

            visible.add(entity)

END FUNCTION
```

---

# 17. Frustum Culling

Performance optimization.

---

## Pseudocode

```text id="jlwm6d"
FUNCTION cullEntities(camera)

    FOR EACH entity

        IF entityOutsideFrustum()

            skipRendering()

END FUNCTION
```

---

# 18. Render Cache System

Important for CAD performance.

---

## Cache Structure

```text id="jlwm0f"
RenderCache {

    meshCache
    edgeCache
    materialCache
}
```

---

# 19. Dirty Flag Optimization

Avoid rebuilding geometry every frame.

---

## Pseudocode

```text id="jlwmm2"
IF entity.dirty

    rebuildGeometry()

ELSE

    reuseCachedGeometry()
```

---

# 20. OpenCascade Tessellation

---

# Workflow

```text id="jlwm4n"
OCC Shape
      ↓
Triangulation
      ↓
Three.js BufferGeometry
```

---

## Pseudocode

```text id="q8z9mq"
FUNCTION tessellateShape(shape)

    triangles =
        OCC.triangulate(shape)

    geometry =
        buildBufferGeometry(
            triangles
        )

    RETURN geometry

END FUNCTION
```

---

# 21. Hidden Edge Removal (Advanced)

Future feature.

True CAD hidden-line projection:

* expensive
* topology-aware

---

## Future Workflow

```text id="jlwm2j"
Project edges
      ↓
Visibility testing
      ↓
2D vector output
```

---

# 22. Lighting System

For shaded modes.

---

## Basic CAD Lighting

```text id="jlwm9y"
AmbientLight
DirectionalLight
HemisphereLight
```

---

## Example

```text id="jlwm7t"
scene.add(
    new DirectionalLight()
)
```

---

# 23. Selection Highlight Rendering

Important UX feature.

---

## Workflow

```text id="6jlwm4"
Normal render
      ↓
Overlay highlight
```

---

## Highlight Material

```text id="jlwmc7"
highlightMaterial =
    emissiveMaterial
```

---

# 24. Grid & UCS Rendering

Always rendered in overlay pass.

---

## Workflow

```text id="jlwmr1"
Render scene
      ↓
Render UCS icon
      ↓
Render grid
```

---

# 25. Multi-Viewport Rendering

Each viewport:

* separate camera
* separate render mode

---

## Pseudocode

```text id="3jlwm9"
FOR EACH viewport

    setViewportRectangle()

    renderViewport(viewport)
```

---

# 26. Recommended MVP Modes

IMPLEMENT FIRST:

| Mode              | Priority |
| ----------------- | -------- |
| 2D Wireframe      | CRITICAL |
| Shaded with Edges | CRITICAL |
| Wireframe 3D      | HIGH     |
| Hidden Line       | HIGH     |

---

# 27. Recommended Three.js Materials

| Mode      | Material             |
| --------- | -------------------- |
| Wireframe | MeshBasicMaterial    |
| Flat      | MeshPhongMaterial    |
| Smooth    | MeshStandardMaterial |
| XRay      | transparent phong    |

---

# 28. Performance Strategy

For CAD:

* avoid realtime shadows initially
* avoid PBR complexity
* avoid excessive post-processing

Prioritize:

* precision
* responsiveness
* edge clarity

---

# 29. Final Rendering Pipeline

```text id="jlwmv6"
CAD Database
      ↓
Visibility Filter
      ↓
Tessellation Cache
      ↓
Render Mode Conversion
      ↓
Three.js Scene
      ↓
GPU Render
      ↓
Viewport Output
```

---

# 30. Final Recommendation

For WebCAD, the best default mode is probably:

```text id="jlwm6m"
SHADED WITH EDGES
```

because it gives:

* engineering readability
* solid perception
* visible topology
* CAD-like appearance

while preserving:

* performance
* usability
* precision.
