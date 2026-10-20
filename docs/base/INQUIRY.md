INQUIRY

# WebCAD INQUIRY Commands — Pseudocode Design

Inquiry commands are CAD tools used to:

* inspect geometry
* measure entities
* analyze coordinates
* retrieve properties
* compute geometric information

Classic AutoCAD inquiry commands include:

* ID
* DIST
* AREA
* LIST
* MASSPROP
* STATUS
* DBLIST

For WebCAD MVP, focus on:

```text id="q0l0hj"
ID
DIST
AREA
LIST
```

These provide most essential CAD inquiry functionality.

---

# 1. Inquiry System Architecture

```text id="r5o4lk"
User Input
    ↓
Inquiry Command
    ↓
Geometry Analyzer
    ↓
Measurement Engine
    ↓
Result Formatter
    ↓
Console / UI Output
```

---

# 2. Shared Utility Functions

---

# 2.1 Distance Between Two Points

```text id="g6o4d0"
FUNCTION distance(p1, p2)

    dx = p2.x - p1.x
    dy = p2.y - p1.y

    RETURN sqrt(dx*dx + dy*dy)

END FUNCTION
```

---

# 2.2 Polygon Area (Shoelace Formula)

Used for:

* AREA
* hatch validation
* region calculations

```text id="5v4vml"
FUNCTION polygonArea(vertices)

    area = 0

    n = vertices.count

    FOR i = 0 TO n-1

        j = (i + 1) MOD n

        area +=
            vertices[i].x * vertices[j].y

        area -=
            vertices[j].x * vertices[i].y

    RETURN abs(area) / 2

END FUNCTION
```

---

# 2.3 Polyline Length

```text id="8q5ru2"
FUNCTION polylineLength(vertices)

    total = 0

    FOR i = 0 TO vertices.count-2

        total +=
            distance(
                vertices[i],
                vertices[i+1]
            )

    RETURN total

END FUNCTION
```

---

# 3. ID Command

Returns coordinate of picked point.

---

## UX

```text id="fg96cw"
Command: ID

Specify point:
```

Result:

```text id="0wlb9v"
X = 120.25
Y = 45.00
Z = 0.00
```

---

## Pseudocode

```text id="kgnvgm"
FUNCTION ID_COMMAND()

    point = getPoint()

    print("X = " + point.x)
    print("Y = " + point.y)
    print("Z = " + point.z)

END FUNCTION
```

---

# 4. DIST Command

Measures distance and angle.

---

## UX

```text id="p6y5xj"
Command: DIST

Specify first point:
Specify second point:
```

---

## Result

```text id="s2pivq"
Distance = 125.55
Angle = 45°
Delta X = 88.75
Delta Y = 88.75
```

---

## Pseudocode

```text id="6rtp40"
FUNCTION DIST_COMMAND()

    p1 = getPoint()

    p2 = getPoint()

    dx = p2.x - p1.x
    dy = p2.y - p1.y

    dist =
        sqrt(dx*dx + dy*dy)

    angle =
        atan2(dy, dx)

    print("Distance = " + dist)

    print("Angle = " + radiansToDegrees(angle))

    print("Delta X = " + dx)

    print("Delta Y = " + dy)

END FUNCTION
```

---

# 5. AREA Command

Measures enclosed area.

Two modes:

* polygon points
* existing closed entity

---

# 5.1 AREA by Points

---

## UX

```text id="b4hnv3"
Command: AREA

Specify first corner:
Specify next corner:
Specify next corner:
[Enter]
```

---

## Pseudocode

```text id="ph80fa"
FUNCTION AREA_BY_POINTS()

    vertices = []

    LOOP

        point = getPoint()

        IF point == ENTER

            BREAK

        vertices.add(point)

    area = polygonArea(vertices)

    perimeter =
        polylineLength(vertices)

    print("Area = " + area)

    print("Perimeter = " + perimeter)

END FUNCTION
```

---

# 5.2 AREA by Entity

---

## Supported Entities

| Entity          | Method       |
| --------------- | ------------ |
| CLOSED POLYLINE | polygon area |
| CIRCLE          | πr²          |
| REGION          | exact region |
| SPLINE          | tessellation |

---

## Pseudocode

```text id="s9t0iq"
FUNCTION AREA_ENTITY(entity)

    SWITCH entity.type

        CASE POLYLINE:

            area =
                polygonArea(entity.vertices)

        CASE CIRCLE:

            area =
                PI * entity.radius^2

        CASE SPLINE:

            area =
                polygonArea(
                    entity.sampledPoints
                )

    print("Area = " + area)

END FUNCTION
```

---

# 6. LIST Command

Displays detailed entity properties.

Equivalent to AutoCAD LIST.

---

## Example Output

```text id="g8qbl5"
LINE
Layer: WALL
Start: (0,0)
End: (100,0)
Length: 100
Color: BYLAYER
```

---

# 6.1 Main LIST Command

```text id="yv0iqh"
FUNCTION LIST_COMMAND()

    entity = selectEntity()

    properties =
        getEntityProperties(entity)

    displayProperties(properties)

END FUNCTION
```

---

# 6.2 Entity Property Extraction

```text id="4c1ujz"
FUNCTION getEntityProperties(entity)

    props = {}

    props.id = entity.id
    props.type = entity.type
    props.layer = entity.layer
    props.color = entity.color

    SWITCH entity.type

        CASE LINE:

            props.start =
                entity.startPoint

            props.end =
                entity.endPoint

            props.length =
                distance(
                    entity.startPoint,
                    entity.endPoint
                )

        CASE CIRCLE:

            props.center =
                entity.center

            props.radius =
                entity.radius

            props.area =
                PI * radius^2

    RETURN props

END FUNCTION
```

---

# 7. Entity Measurement Dispatcher

Shared inquiry backend.

```text id="r74p7e"
FUNCTION measureEntity(entity)

    SWITCH entity.type

        CASE LINE:
            RETURN measureLine(entity)

        CASE POLYLINE:
            RETURN measurePolyline(entity)

        CASE CIRCLE:
            RETURN measureCircle(entity)

        CASE SPLINE:
            RETURN measureSpline(entity)

END FUNCTION
```

---

# 8. SPLINE Measurement

Approximate using tessellation.

```text id="eybrp4"
FUNCTION measureSpline(spline)

    length =
        polylineLength(
            spline.sampledPoints
        )

    RETURN {
        length: length
    }

END FUNCTION
```

---

# 9. Arc Measurement

```text id="qk4f6k"
FUNCTION measureArc(arc)

    angle =
        arc.endAngle - arc.startAngle

    length =
        arc.radius * angle

    RETURN {
        arcLength: length
    }

END FUNCTION
```

---

# 10. Nearest Point Inquiry

Useful for snaps/debugging.

```text id="f41o0w"
FUNCTION nearestPoint(entity, point)

    SWITCH entity.type

        CASE LINE:
            RETURN nearestPointOnLine()

        CASE SPLINE:
            RETURN nearestPointOnSpline()

END FUNCTION
```

---

# 11. Bounding Box Inquiry

Useful internally and for LIST.

```text id="f7zz8t"
FUNCTION entityBoundingBox(entity)

    minX = infinity
    minY = infinity

    maxX = -infinity
    maxY = -infinity

    FOR EACH vertex

        updateBounds()

    RETURN bounds

END FUNCTION
```

---

# 12. Coordinate Formatting

Important CAD feature.

---

## Decimal

```text id="6hq6fc"
120.55
```

---

## Architectural

```text id="g9k5di"
10'-6 1/4"
```

---

## Engineering

```text id="5jjjls"
10.52'
```

---

## Pseudocode

```text id="j0qzt7"
FUNCTION formatCoordinate(value, mode)

    SWITCH mode

        CASE DECIMAL:
            RETURN decimalFormat()

        CASE ARCHITECTURAL:
            RETURN feetInchesFormat()

END FUNCTION
```

---

# 13. Inquiry Console Output

Recommended CAD console.

```text id="y0vrwo"
--------------------------------
Entity: LINE
Length: 150.00
Angle: 35°
Layer: WALL
--------------------------------
```

---

# 14. Floating Measurement HUD (Optional)

Modern WebCAD enhancement.

```text id="8ekggd"
Mouse hover
    ↓
Display mini tooltip:
Length
Radius
Area
Coordinates
```

---

# 15. Precision Handling

Important in CAD.

```text id="ggq9vu"
EPSILON = 0.000001
```

Avoid:

* floating-point instability
* equality errors

---

# 16. Spatial Query Optimization

For large drawings:

Use:

* quadtree
* R-tree
* BVH

---

## Fast Picking

```text id="5xkrdy"
FUNCTION selectEntity(mousePosition)

    candidates =
        spatialIndex.query(mouseArea)

    RETURN nearestEntity(candidates)

END FUNCTION
```

---

# 17. Recommended MVP Inquiry Commands

IMPLEMENT FIRST:

| Command | Priority |
| ------- | -------- |
| ID      | HIGH     |
| DIST    | HIGH     |
| AREA    | HIGH     |
| LIST    | HIGH     |

Later:

* MASSPROP
* REGION analysis
* curvature analysis
* volume

---

# 18. AutoCAD-Like UX Flow

```text id="8sm1j8"
Command: DIST

Specify first point:
Specify second point:

Distance = 152.5000
Angle in XY Plane = 45
Delta X = 107.83
Delta Y = 107.83
```

---

# 19. Final Recommended Architecture

```text id="kv26u5"
Inquiry Command
        ↓
Geometry Analyzer
        ↓
Measurement Engine
        ↓
Formatter
        ↓
Console/UI Output
```

This architecture is:

* modular
* extensible
* compatible with classic CAD workflows
* efficient for browser-based WebCAD systems.
