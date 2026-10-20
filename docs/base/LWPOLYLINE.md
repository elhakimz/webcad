# WebCAD LWPOLYLINE — Detailed Pseudocode Design

`LWPOLYLINE` (Lightweight Polyline) is one of the MOST IMPORTANT CAD entities.

In AutoCAD/DXF:

* compact 2D polyline
* supports:

  * straight segments
  * arc segments (bulge)
  * widths
  * closed loops

It is MUCH more important than LINE for real drafting.

---

# 1. LWPOLYLINE Overview

---

## Features

| Feature           | Support      |
| ----------------- | ------------ |
| Multiple vertices | YES          |
| Straight segments | YES          |
| Arc segments      | YES          |
| Closed loops      | YES          |
| Widths            | OPTIONAL MVP |
| Elevation         | OPTIONAL     |

---

# 2. Why LWPOLYLINE Matters

Most CAD operations rely heavily on it:

* OFFSET
* HATCH
* FILLET
* TRIM
* AREA
* EXTRUDE
* REGION
* PLOT

A strong polyline implementation is critical.

---

# 3. Entity Structure

---

## Recommended Data Model

```typescript id="t6xq2v"
class LWPolyline {

    id

    layer

    color

    closed

    elevation

    vertices[]

    bounds

    renderObject
}
```

---

# 4. Vertex Structure

---

## IMPORTANT

Each segment is defined by:

* current vertex
* next vertex
* bulge value

---

## Data Structure

```typescript id="6nmrzy"
class LWVertex {

    x
    y

    startWidth
    endWidth

    bulge
}
```

---

# 5. Bulge Definition

Bulge defines arc segments.

---

# Formula

```text id="jmy7p9"
bulge = tan(theta / 4)
```

Where:

* theta = included arc angle

---

# Bulge Meaning

| Bulge | Meaning       |
| ----- | ------------- |
| 0     | straight line |
| >0    | CCW arc       |
| <0    | CW arc        |

---

# 6. Main Workflow

```text id="j0w5v5"
User creates vertices
        ↓
Segments generated
        ↓
Geometry tessellated
        ↓
Three.js render object
```

---

# 7. Main LWPOLYLINE Command

---

## UX

```text id="t2t3gq"
Command: PLINE

Specify first point:
Specify next point:
Specify next point:
[Close/Undo/Arc]
```

---

# 8. Command State Machine

```text id="h2jz5x"
IDLE
  ↓
FIRST_POINT
  ↓
NEXT_POINT
  ↓
ARC_MODE (optional)
  ↓
COMPLETE
```

---

# 9. Main Command Pseudocode

```pseudo id="fgyjlwm"
FUNCTION PLINE_COMMAND()

    polyline =
        new LWPolyline()

    firstPoint =
        getPoint()

    addVertex(polyline, firstPoint)

    LOOP

        input =
            getPolylineInput()

        SWITCH input.type

            CASE POINT:

                addVertex(
                    polyline,
                    input.point
                )

            CASE ARC:

                enterArcMode()

            CASE CLOSE:

                polyline.closed = TRUE

                BREAK

            CASE ENTER:

                BREAK

    finalizePolyline(polyline)

END FUNCTION
```

---

# 10. Adding Vertices

```pseudo id="jlwmq5"
FUNCTION addVertex(
    polyline,
    point
)

    vertex =
        new LWVertex()

    vertex.x = point.x
    vertex.y = point.y

    vertex.bulge = 0

    polyline.vertices.add(vertex)

END FUNCTION
```

---

# 11. Arc Segment Creation

---

# Workflow

```text id="jlwm7m"
Line mode
    ↓
Switch to arc mode
    ↓
Compute bulge
    ↓
Store in previous vertex
```

---

# 12. Arc Bulge Calculation

```pseudo id="jlwmk7"
FUNCTION calculateBulge(angle)

    RETURN tan(angle / 4)

END FUNCTION
```

---

# 13. Segment Interpretation

Each segment:

```text id="jlwm9x"
vertex[i]
    →
vertex[i+1]
```

uses:

```text id="jlwm3x"
vertex[i].bulge
```

---

# 14. Geometry Generation

MOST IMPORTANT STEP.

---

# Workflow

```text id="jlwm1n"
Vertices
    ↓
Segments
    ↓
Tessellation
    ↓
BufferGeometry
```

---

# 15. Polyline Tessellation

---

## Straight Segment

```pseudo id="jlwm8r"
FUNCTION tessellateLineSegment(
    p1,
    p2
)

    RETURN [p1, p2]

END FUNCTION
```

---

# 16. Arc Tessellation

Convert bulge arc into sampled points.

---

# Workflow

```text id="jlwm6x"
Bulge
    ↓
Arc center
    ↓
Radius
    ↓
Sample points
```

---

# 17. Arc Reconstruction

---

## Inputs

```text id="jlwmw2"
start point
end point
bulge
```

---

## Outputs

```text id="3jlwm0"
center
radius
angles
```

---

# 18. Arc Geometry Pseudocode

```pseudo id="jlwm5y"
FUNCTION bulgeToArc(
    p1,
    p2,
    bulge
)

    chord =
        distance(p1, p2)

    theta =
        4 * atan(bulge)

    radius =
        chord /
        (2 * sin(theta/2))

    computeCenter()

    RETURN arcData

END FUNCTION
```

---

# 19. Arc Sampling

```pseudo id="jlwmf1"
FUNCTION sampleArc(
    arc,
    segments
)

    points = []

    FOR i = 0 TO segments

        t = i / segments

        angle =
            lerp(
                arc.startAngle,
                arc.endAngle,
                t
            )

        x =
            arc.center.x +
            cos(angle) * arc.radius

        y =
            arc.center.y +
            sin(angle) * arc.radius

        points.add(x,y)

    RETURN points

END FUNCTION
```

---

# 20. Full Polyline Tessellation

```pseudo id="jlwm8n"
FUNCTION tessellatePolyline(
    polyline
)

    resultPoints = []

    FOR i = 0 TO vertexCount-2

        v1 = vertices[i]
        v2 = vertices[i+1]

        IF v1.bulge == 0

            appendLineSegment()

        ELSE

            appendArcSegment()

    IF polyline.closed

        connectLastToFirst()

    RETURN resultPoints

END FUNCTION
```

---

# 21. Three.js Geometry Build

---

## Recommended

Use:

* BufferGeometry
* LineSegments
* Line2 (optional)

---

## Pseudocode

```pseudo id="jlwmq9"
FUNCTION buildRenderGeometry(
    points
)

    geometry =
        new THREE.BufferGeometry()

    geometry.setFromPoints(points)

    RETURN geometry

END FUNCTION
```

---

# 22. Closed Polyline Handling

---

## Important

Last vertex connects to first.

```pseudo id="jlwm2y"
IF polyline.closed

    addSegment(
        lastVertex,
        firstVertex
    )
```

---

# 23. Bounding Box Calculation

```pseudo id="jlwmv9"
FUNCTION computeBounds(polyline)

    minX = infinity
    minY = infinity

    maxX = -infinity
    maxY = -infinity

    FOR EACH vertex

        updateBounds()

END FUNCTION
```

---

# 24. Snap Points

Important CAD feature.

---

## Snap Types

| Snap | Source           |
| ---- | ---------------- |
| END  | vertices         |
| MID  | segment midpoint |
| CEN  | arc center       |
| QUA  | arc quadrants    |

---

# 25. Selection Handling

---

## Recommended

Store:

* segment cache
* tessellated cache

---

## Picking

```pseudo id="jlwmz3"
FUNCTION hitTestPolyline(
    mouse,
    polyline
)

    testDistanceToSegments()

END FUNCTION
```

---

# 26. Editing Operations

Critical for CAD usability.

---

# Supported Edits

| Edit          | Support |
| ------------- | ------- |
| MOVE vertex   | YES     |
| ADD vertex    | YES     |
| REMOVE vertex | YES     |
| STRETCH       | YES     |
| FILLET        | YES     |
| OFFSET        | YES     |

---

# 27. Vertex Grip Editing

---

## Workflow

```text id="9jlwm1"
Select polyline
    ↓
Display grips
    ↓
Drag grip
    ↓
Rebuild geometry
```

---

## Pseudocode

```pseudo id="7jlwm2"
FUNCTION moveVertexGrip(
    polyline,
    vertexIndex,
    newPosition
)

    vertex =
        polyline.vertices[
            vertexIndex
        ]

    vertex.x = newPosition.x
    vertex.y = newPosition.y

    rebuildPolyline(polyline)

END FUNCTION
```

---

# 28. Width Support (Optional MVP)

LWPOLYLINE supports:

* variable widths

---

## Future Data

```text id="5jlwm4"
startWidth
endWidth
```

---

## Rendering

Requires:

* triangulated strip mesh

NOT simple line rendering.

---

# 29. DXF Serialization

VERY important.

---

# Example

```text id="jlwm5n"
0
LWPOLYLINE
90
4
70
1
10
0.0
20
0.0
42
0.5
```

---

# 30. DXF Parsing

```pseudo id="2jlwm6"
FUNCTION parseLWPolyline()

    WHILE notEnd

        readGroupCode()

        SWITCH code

            CASE 10:
                readX()

            CASE 20:
                readY()

            CASE 42:
                readBulge()

END FUNCTION
```

---

# 31. Recommended Internal Architecture

```text id="7jlwm9"
LWPolyline
      ↓
Segment Cache
      ↓
Tessellation Cache
      ↓
Render Geometry
```

---

# 32. Recommended MVP Scope

IMPLEMENT FIRST:

✔ straight segments
✔ arc bulges
✔ closed polylines
✔ vertex editing
✔ DXF support

SKIP INITIALLY:

❌ variable widths
❌ linetype generation
❌ elevation/thickness

---

# 33. Performance Optimization

For large drawings:

Use:

* dirty rebuilds
* cached tessellation
* spatial indexing

---

# 34. Final Recommended Design

```text id="4jlwm2"
Vertices
    ↓
Segment Interpretation
    ↓
Bulge Arc Resolution
    ↓
Tessellation
    ↓
Three.js Geometry
```

This architecture is:

* compatible with AutoCAD DXF
* performant
* editable
* suitable for advanced CAD operations
* extensible toward OpenCascade later.
