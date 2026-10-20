# WebCAD UCS (User Coordinate System) — Detailed Pseudocode

---

# 1. Purpose of UCS

The UCS allows users to:

* redefine drawing axes
* work on rotated planes
* draw on arbitrary orientations
* simplify 3D drafting

Classic CAD behavior:

* geometry input uses UCS
* geometry storage remains in WCS
* rendering transforms accordingly

---

# 2. Core Concept

Important distinction:

| System | Meaning                 |
| ------ | ----------------------- |
| WCS    | World Coordinate System |
| UCS    | User Coordinate System  |

---

# 3. Recommended Architecture

```text id="1m4rjv"
Mouse/Input
      ↓
UCS Coordinates
      ↓
Transform To WCS
      ↓
Store Geometry
```

Internally:

* entities stored in WCS
* user interacts through UCS

This is VERY important.

---

# 4. UCS Data Structure

```text id="z5o9w6"
UCS {

    origin

    xAxis
    yAxis
    zAxis

    matrix
    inverseMatrix

    name
}
```

---

# 5. Axis Rules

Axes must be:

* normalized
* orthogonal

```text id="3ytjlwm"
xAxis ⟂ yAxis
xAxis × yAxis = zAxis
```

---

# 6. Default World UCS

```text id="jlwm4u"
WORLD_UCS {

    origin = (0,0,0)

    xAxis = (1,0,0)
    yAxis = (0,1,0)
    zAxis = (0,0,1)
}
```

---

# 7. Main UCS Command

```text id="jlwm2v"
Command: UCS

[World/Object/3point/View/X/Y/Z]
```

---

# 8. UCS Command Dispatcher

```text id="jlwm8f"
FUNCTION UCS_COMMAND()

    option = getKeyword()

    SWITCH option

        CASE WORLD:
            setWorldUCS()

        CASE 3POINT:
            createUCSFrom3Points()

        CASE OBJECT:
            createUCSFromObject()

        CASE VIEW:
            createUCSFromView()

        CASE X:
            rotateUCSAroundX()

        CASE Y:
            rotateUCSAroundY()

        CASE Z:
            rotateUCSAroundZ()

END FUNCTION
```

---

# 9. Set World UCS

```text id="jlwmx2"
FUNCTION setWorldUCS()

    activeUCS =
        WORLD_UCS

    updateViewportGrid()

    redrawScene()

END FUNCTION
```

---

# 10. Create UCS From 3 Points

Classic CAD method.

---

## Workflow

```text id="jlwm3f"
Specify origin
Specify point on X axis
Specify point on XY plane
```

---

# 11. Pseudocode

```text id="jlwm4n"
FUNCTION createUCSFrom3Points()

    origin =
        getPoint()

    xPoint =
        getPoint()

    xyPoint =
        getPoint()

    xAxis =
        normalize(
            xPoint - origin
        )

    temporaryVector =
        xyPoint - origin

    zAxis =
        normalize(
            cross(
                xAxis,
                temporaryVector
            )
        )

    yAxis =
        normalize(
            cross(
                zAxis,
                xAxis
            )
        )

    activeUCS =
        createUCS(
            origin,
            xAxis,
            yAxis,
            zAxis
        )

    rebuildUCSMatrices()

END FUNCTION
```

---

# 12. Build UCS Transformation Matrix

Critical step.

---

# 13. UCS Matrix Construction

```text id="jlwm5x"
FUNCTION buildUCSMatrix(ucs)

    matrix = Matrix4()

    matrix.column0 = ucs.xAxis
    matrix.column1 = ucs.yAxis
    matrix.column2 = ucs.zAxis
    matrix.column3 = ucs.origin

    RETURN matrix

END FUNCTION
```

---

# 14. Inverse Matrix

Needed for:

* WCS ↔ UCS conversion

```text id="jlwm9y"
ucs.inverseMatrix =
    inverse(ucs.matrix)
```

---

# 15. UCS → WCS Transformation

When user inputs point:

```text id="jlwm6u"
FUNCTION UCS_to_WCS(pointUCS)

    RETURN transformPoint(
        activeUCS.matrix,
        pointUCS
    )

END FUNCTION
```

---

# 16. WCS → UCS Transformation

For display/grips/input.

```text id="jlwm7j"
FUNCTION WCS_to_UCS(pointWCS)

    RETURN transformPoint(
        activeUCS.inverseMatrix,
        pointWCS
    )

END FUNCTION
```

---

# 17. Input Point Pipeline

Critical CAD workflow.

```text id="jlwm1m"
Mouse Click
      ↓
Screen Ray
      ↓
Intersect UCS Plane
      ↓
UCS Point
      ↓
Convert To WCS
      ↓
Store Entity
```

---

# 18. UCS Plane Definition

```text id="jlwmz7"
PLANE {

    origin = ucs.origin

    normal = ucs.zAxis
}
```

---

# 19. Mouse Ray → UCS Plane Intersection

---

## Pseudocode

```text id="jlwm4p"
FUNCTION screenToUCSPlane(mouse)

    ray =
        cameraRay(mouse)

    intersection =
        intersectRayPlane(
            ray,
            ucsPlane
        )

    RETURN intersection

END FUNCTION
```

---

# 20. Drawing in UCS

Example:

* LINE command

---

## Pseudocode

```text id="jlwm2s"
FUNCTION LINE_COMMAND()

    point1_UCS =
        getUCSPoint()

    point2_UCS =
        getUCSPoint()

    point1_WCS =
        UCS_to_WCS(point1_UCS)

    point2_WCS =
        UCS_to_WCS(point2_UCS)

    createLine(
        point1_WCS,
        point2_WCS
    )

END FUNCTION
```

---

# 21. UCS Grid Rendering

Grid aligns with active UCS.

---

# 22. Grid Generation

```text id="jlwm8x"
FUNCTION renderUCSGrid()

    FOR x = -gridSize TO gridSize

        createGridLine()

    rotateGridToUCS()

END FUNCTION
```

---

# 23. UCS Icon

Classic CAD feature.

---

## Display

```text id="jlwm0y"
X → red
Y → green
Z → blue
```

---

# 24. UCS Rotation Commands

---

# Rotate Around Z

```text id="jlwm5m"
FUNCTION rotateUCSAroundZ(angle)

    rotation =
        matrixRotationZ(angle)

    activeUCS.xAxis =
        rotateVector(
            activeUCS.xAxis,
            rotation
        )

    activeUCS.yAxis =
        rotateVector(
            activeUCS.yAxis,
            rotation
        )

    rebuildUCSMatrices()

END FUNCTION
```

---

# 25. UCS By Object

Align UCS to:

* line
* face
* polyline edge

---

## Example

```text id="jlwm3t"
Select object:
```

---

## Pseudocode

```text id="jlwm1u"
FUNCTION createUCSFromObject(entity)

    xAxis =
        entity.direction

    zAxis =
        worldUp()

    yAxis =
        cross(zAxis, xAxis)

    activeUCS =
        createUCS()

END FUNCTION
```

---

# 26. UCS From View

Align XY plane to camera.

Useful for sketching.

---

# 27. Pseudocode

```text id="jlwm7s"
FUNCTION createUCSFromView(camera)

    zAxis =
        camera.forward

    xAxis =
        camera.right

    yAxis =
        camera.up

    activeUCS =
        createUCS()

END FUNCTION
```

---

# 28. Object Snap in UCS

Snaps should:

* display in UCS
* store in WCS

---

# 29. Rubberband Preview

Preview lines should use:

* UCS plane
* UCS transforms

---

# 30. Recommended Rendering Architecture

```text id="jlwm6x"
Stored Geometry = WCS

Displayed Interaction = UCS
```

VERY important.

---

# 31. Viewport-Specific UCS

Each viewport may have:

* independent UCS

---

## Example

```text id="jlwm4w"
TOP viewport → world UCS

FRONT viewport → rotated UCS
```

---

# 32. Named UCS Support

Useful future feature.

---

## Structure

```text id="jlwm0m"
UCS_TABLE {

    "WORLD"
    "FRONT"
    "MECHANICAL_A"
}
```

---

# 33. Save UCS

```text id="jlwm9n"
FUNCTION saveUCS(name)

    ucsTable[name] =
        clone(activeUCS)

END FUNCTION
```

---

# 34. Restore UCS

```text id="jlwm2q"
FUNCTION restoreUCS(name)

    activeUCS =
        clone(ucsTable[name])

END FUNCTION
```

---

# 35. Precision Concerns

Axes must remain:

* orthogonal
* normalized

Use:

* Gram-Schmidt orthogonalization

occasionally.

---

# 36. Recommended MVP Scope

IMPLEMENT FIRST:

* WORLD UCS
* 3-point UCS
* Z rotation
* UCS grid
* UCS icon

LATER:

* object UCS
* face UCS
* dynamic UCS
* per-viewport UCS

---

# 37. Final Recommended Architecture

```text id="jlwm8k"
User Input
      ↓
UCS Coordinates
      ↓
UCS Transform
      ↓
WCS Geometry Storage
      ↓
Three.js Rendering
```

This architecture is:

* compatible with classic CAD
* suitable for OpenCascade
* scalable to 3D
* correct for engineering drafting workflows.
