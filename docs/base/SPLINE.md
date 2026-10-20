SPLINE

# WebCAD SPLINE Feature — Pseudocode Design

A SPLINE in CAD is usually a:

* NURBS curve
* B-spline curve
* Bézier-like interpolated curve

For WebCAD MVP, the best approach is:

```text id="yhh8g8"
Control-point based cubic B-spline
```

This gives:

* smooth CAD-quality curves
* editable control vertices
* efficient rendering
* AutoCAD-like behavior

---

# 1. SPLINE Overview

User workflow:

```text id="h1hjh7"
Command: SPLINE

Specify first point:
Specify next point:
Specify next point:
Specify next point:
[Enter]
```

Result:

* smooth curve passing near/through points

---

# 2. Recommended Architecture

```text id="j6g7ev"
Spline Entity
    ↓
Control Points
    ↓
Spline Evaluator
    ↓
Curve Sampling
    ↓
Polyline Approximation
    ↓
Three.js Rendering
```

---

# 3. Internal Entity Structure

```text id="jlwmme"
ENTITY {
    id
    type: "SPLINE"

    controlPoints[]
    degree

    knots[]
    weights[]

    sampledPoints[]

    closed
    layer
}
```

---

# 4. MVP Recommendation

For initial WebCAD:

Use:

* cubic B-spline
* uniform knot vector
* polyline tessellation

Avoid initially:

* full NURBS
* rational weights
* advanced constraints

---

# 5. Main SPLINE Command

```text id="u7n0qs"
FUNCTION SPLINE_COMMAND()

    spline = createEmptySpline()

    LOOP

        point = getPoint("Specify point:")

        IF point == ENTER

            BREAK

        spline.controlPoints.add(point)

        previewSpline(spline)

    END LOOP

    spline.degree = 3

    spline.knots = generateUniformKnots()

    spline.sampledPoints =
        evaluateSplineCurve(spline)

    addEntityToDrawing(spline)

    redrawScene()

END FUNCTION
```

---

# 6. Knot Vector Generation

For cubic spline:

```text id="oyr7zb"
FUNCTION generateUniformKnots(controlPointCount, degree)

    knotCount =
        controlPointCount + degree + 1

    knots = []

    FOR i = 0 TO knotCount-1

        knots.add(i)

    RETURN knots

END FUNCTION
```

---

# 7. Core B-Spline Evaluation

Most important algorithm.

Uses:

* Cox-De Boor recursion

---

# 8. Basis Function

---

## Recursive Basis

```text id="nyu0sx"
FUNCTION basisFunction(i, degree, t, knots)

    IF degree == 0

        IF knots[i] <= t < knots[i+1]

            RETURN 1

        ELSE

            RETURN 0

    leftDenominator =
        knots[i+degree] - knots[i]

    rightDenominator =
        knots[i+degree+1] - knots[i+1]

    leftTerm = 0
    rightTerm = 0

    IF leftDenominator != 0

        leftTerm =
            ((t - knots[i]) / leftDenominator)
            *
            basisFunction(i, degree-1, t, knots)

    IF rightDenominator != 0

        rightTerm =
            ((knots[i+degree+1] - t)
            /
            rightDenominator)
            *
            basisFunction(i+1, degree-1, t, knots)

    RETURN leftTerm + rightTerm

END FUNCTION
```

---

# 9. Evaluate Single Curve Point

```text id="91u1w2"
FUNCTION evaluateSplinePoint(spline, t)

    point = (0,0)

    FOR i = 0 TO spline.controlPoints.count-1

        basis =
            basisFunction(
                i,
                spline.degree,
                t,
                spline.knots
            )

        point +=
            spline.controlPoints[i] * basis

    RETURN point

END FUNCTION
```

---

# 10. Sample Entire Curve

CAD systems render spline as many line segments.

---

## Tessellation

```text id="ib6gt3"
FUNCTION evaluateSplineCurve(spline)

    sampledPoints = []

    tMin = spline.knots[spline.degree]

    tMax =
        spline.knots[
            spline.controlPoints.count
        ]

    segments = 100

    FOR s = 0 TO segments

        t = lerp(tMin, tMax, s / segments)

        point =
            evaluateSplinePoint(spline, t)

        sampledPoints.add(point)

    RETURN sampledPoints

END FUNCTION
```

---

# 11. Three.js Rendering

---

## Polyline Approximation

```text id="77x2ji"
FUNCTION renderSpline(spline)

    geometry = new BufferGeometry()

    geometry.setFromPoints(
        spline.sampledPoints
    )

    line =
        new THREE.Line(
            geometry,
            splineMaterial
        )

    scene.add(line)

END FUNCTION
```

---

# 12. Live Preview While Drawing

Important CAD behavior.

```text id="qzpyhm"
FUNCTION previewSpline(spline)

    temporarySpline =
        evaluateSplineCurve(spline)

    renderTemporaryGeometry(
        temporarySpline
    )

END FUNCTION
```

---

# 13. Grip Editing

Modern CAD behavior.

---

## Move Control Point

```text id="e2zh73"
FUNCTION moveSplineGrip(
    spline,
    gripIndex,
    newPosition
)

    spline.controlPoints[gripIndex] =
        newPosition

    spline.sampledPoints =
        evaluateSplineCurve(spline)

    updateSplineGeometry(spline)

END FUNCTION
```

---

# 14. Closed SPLINE

Optional future feature.

```text id="3dk8m4"
IF spline.closed == TRUE

    duplicateFirstControlPoints()

    regenerateKnots()
```

---

# 15. Fit-Point Spline (AutoCAD-like)

Two spline modes exist:

---

## Control Vertex (CV)

Curve approximates points.

---

## Fit Spline

Curve passes through points.

More complicated:

* interpolation system
* matrix solving

For MVP:

* use CV spline only

---

# 16. Selection & Snapping

---

## Object Snap

Need:

* nearest point
* endpoint
* tangent
* control vertex

---

## Closest Point

```text id="e9smng"
FUNCTION nearestPointOnSpline(mousePoint)

    minDistance = infinity

    FOR EACH sampledPoint

        distance =
            computeDistance(
                mousePoint,
                sampledPoint
            )

        IF distance < minDistance

            bestPoint = sampledPoint

    RETURN bestPoint

END FUNCTION
```

---

# 17. Stretching SPLINE

Spline stretch means:

* moving control points

```text id="l8g6g8"
FOR EACH controlPoint

    IF insideCrossingWindow

        controlPoint += displacement
```

Then:

* reevaluate spline
* rebuild geometry

---

# 18. Offset SPLINE (Advanced)

Hard problem.

True spline offset:

* mathematically complex

Recommended:

* approximate via sampled polyline
* offset polyline
* rebuild spline

---

# 19. Explode SPLINE

Convert to polyline.

```text id="jqbxg8"
FUNCTION explodeSpline(spline)

    polyline.vertices =
        spline.sampledPoints

    replaceEntity(polyline)

END FUNCTION
```

---

# 20. DXF-Like Serialization

```text id="zcv2m2"
SPLINE
    degree
    knots[]
    controlPoints[]
    weights[]
```

Compatible with DXF export later.

---

# 21. Spatial Indexing

Bounding box:

```text id="5jlwm8"
FUNCTION splineBoundingBox(spline)

    bounds =
        computeBounds(
            spline.sampledPoints
        )

    RETURN bounds

END FUNCTION
```

---

# 22. Performance Optimization

Important for large CAD files.

---

## Cache Sampled Geometry

Only recompute when:

* control points changed
* degree changed

---

## Adaptive Tessellation

More segments in curved regions.

---

# 23. Recommended MVP Scope

IMPLEMENT:

* cubic B-spline
* control points
* live preview
* grip editing
* explode
* DXF export support

SKIP INITIALLY:

* rational NURBS
* surface splines
* constraints
* exact offset

---

# 24. Suggested CAD UX

```text id="hrjicn"
Command: SPLINE

Specify first point:
Specify next point:
Specify next point:
Specify tangent:
Specify end tangent:
```

---

# 25. Final Recommended Architecture

```text id="mhrpc2"
Spline Entity
    ↓
Control Points
    ↓
Basis Function Evaluation
    ↓
Curve Sampling
    ↓
Polyline Approximation
    ↓
Three.js Rendering
```

This architecture is:

* compatible with classic CAD
* performant in browser
* easy to serialize
* editable
* suitable for WebCAD + Three.js systems.
