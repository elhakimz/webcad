STRETCH

# WebCAD STRETCH Command — Detailed Pseudocode

The STRETCH command modifies only the portions of entities inside a crossing selection window while preserving the rest of the geometry.

Classic CAD behavior:

* crossing selection only
* vertices inside crossing window move
* outside vertices remain fixed
* fully selected entities move entirely

---

# 1. STRETCH Workflow

```text id="shz4j9"
Command: STRETCH

Select objects by crossing-window
Specify base point
Specify second point

→ Stretch affected vertices
→ Rebuild geometry
→ Redraw scene
```

---

# 2. High-Level Architecture

```text id="pm5m91"
Selection System
    ↓
Crossing Detector
    ↓
Stretch Processor
    ↓
Vertex Modifier
    ↓
Geometry Rebuilder
    ↓
Renderer Sync
```

---

# 3. Main STRETCH Command

```text id="1oqdb7"
FUNCTION STRETCH_COMMAND()

    crossingWindow =
        getCrossingWindow()

    selectedEntities =
        findEntitiesCrossingWindow(
            crossingWindow
        )

    IF selectedEntities is empty

        print("Nothing selected")
        RETURN

    basePoint =
        getPoint("Specify base point:")

    targetPoint =
        getPoint("Specify second point:")

    displacement =
        targetPoint - basePoint

    beginUndoGroup()

    FOR EACH entity IN selectedEntities

        stretchEntity(
            entity,
            crossingWindow,
            displacement
        )

    rebuildSpatialIndex()

    redrawScene()

    endUndoGroup()

END FUNCTION
```

---

# 4. Crossing Window Selection

Unlike normal selection:

* entity crossing window edges is included
* vertices inside window are stretch candidates

---

## Crossing Window Structure

```text id="90v5wr"
WINDOW {
    minX
    minY
    maxX
    maxY
}
```

---

# 5. Spatial Query Optimization

Use spatial index first.

```text id="3yzt4d"
FUNCTION findEntitiesCrossingWindow(window)

    candidates =
        spatialIndex.query(window)

    results = []

    FOR EACH entity IN candidates

        IF entityCrossesWindow(entity, window)

            results.add(entity)

    RETURN results

END FUNCTION
```

---

# 6. Entity Crossing Detection

---

# 6.1 Generic Dispatcher

```text id="p1vd8o"
FUNCTION entityCrossesWindow(entity, window)

    SWITCH entity.type

        CASE LINE:
            RETURN lineCrossesWindow(
                entity,
                window
            )

        CASE POLYLINE:
            RETURN polylineCrossesWindow()

        CASE SPLINE:
            RETURN splineCrossesWindow()

        CASE ARC:
            RETURN arcCrossesWindow()

END FUNCTION
```

---

# 7. Point Inside Window Test

```text id="wmjlwm"
FUNCTION pointInsideWindow(point, window)

    RETURN (
        point.x >= window.minX
        AND
        point.x <= window.maxX
        AND
        point.y >= window.minY
        AND
        point.y <= window.maxY
    )

END FUNCTION
```

---

# 8. Stretch Dispatcher

```text id="s56v7z"
FUNCTION stretchEntity(
    entity,
    crossingWindow,
    displacement
)

    IF shouldMoveWholeEntity(
        entity,
        crossingWindow
    )

        moveEntireEntity(
            entity,
            displacement
        )

        RETURN

    SWITCH entity.type

        CASE LINE:
            stretchLine()

        CASE POLYLINE:
            stretchPolyline()

        CASE SPLINE:
            stretchSpline()

        CASE ARC:
            stretchArc()

        CASE TEXT:
            stretchText()

END FUNCTION
```

---

# 9. Whole Entity Move Detection

If ALL editable points are inside:

* move whole entity instead

```text id="5ngwh9"
FUNCTION shouldMoveWholeEntity(
    entity,
    window
)

    editablePoints =
        getEditablePoints(entity)

    insideCount = 0

    FOR EACH point IN editablePoints

        IF pointInsideWindow(point, window)

            insideCount += 1

    RETURN (
        insideCount ==
        editablePoints.count
    )

END FUNCTION
```

---

# 10. LINE Stretch

---

## Behavior

Move only endpoints inside crossing window.

---

## Pseudocode

```text id="ux29nr"
FUNCTION stretchLine(
    line,
    window,
    displacement
)

    IF pointInsideWindow(
        line.startPoint,
        window
    )

        line.startPoint += displacement

    IF pointInsideWindow(
        line.endPoint,
        window
    )

        line.endPoint += displacement

    rebuildLineGeometry(line)

END FUNCTION
```

---

# 11. POLYLINE Stretch

Most important STRETCH case.

---

## Pseudocode

```text id="0pvftm"
FUNCTION stretchPolyline(
    polyline,
    window,
    displacement
)

    FOR EACH vertex
        IN polyline.vertices

        IF pointInsideWindow(
            vertex,
            window
        )

            vertex += displacement

    recomputePolylineSegments(
        polyline
    )

    rebuildPolylineGeometry(
        polyline
    )

END FUNCTION
```

---

# 12. SPLINE Stretch

Spline stretch modifies control vertices.

```text id="v2x7v5"
FUNCTION stretchSpline(
    spline,
    window,
    displacement
)

    FOR EACH controlPoint
        IN spline.controlPoints

        IF pointInsideWindow(
            controlPoint,
            window
        )

            controlPoint += displacement

    spline.sampledPoints =
        evaluateSplineCurve(spline)

    rebuildSplineGeometry(spline)

END FUNCTION
```

---

# 13. ARC Stretch

More difficult.

Simplified MVP:

* move start/end points
* reconstruct arc

---

## Pseudocode

```text id="8b1n4j"
FUNCTION stretchArc(
    arc,
    window,
    displacement
)

    moved = FALSE

    IF pointInsideWindow(
        arc.startPoint,
        window
    )

        arc.startPoint += displacement
        moved = TRUE

    IF pointInsideWindow(
        arc.endPoint,
        window
    )

        arc.endPoint += displacement
        moved = TRUE

    IF moved

        reconstructArc(arc)

END FUNCTION
```

---

# 14. TEXT Stretch

Classic CAD behavior:

* text insertion point moves

```text id="1bwhsu"
FUNCTION stretchText(
    text,
    window,
    displacement
)

    IF pointInsideWindow(
        text.insertionPoint,
        window
    )

        text.insertionPoint += displacement

    rebuildTextGeometry(text)

END FUNCTION
```

---

# 15. Entity Geometry Rebuild

---

## Generic Rebuilder

```text id="vk6qz0"
FUNCTION rebuildEntity(entity)

    recomputeBoundingBox(entity)

    recomputeSnapPoints(entity)

    recomputeSpatialIndex(entity)

    updateRendererGeometry(entity)

END FUNCTION
```

---

# 16. Three.js Geometry Update

---

## LINE Example

```text id="iy4t9t"
FUNCTION rebuildLineGeometry(line)

    geometry =
        line.renderObject.geometry

    geometry.position[0] =
        line.startPoint.x

    geometry.position[1] =
        line.startPoint.y

    geometry.position[2] =
        line.endPoint.x

    geometry.position[3] =
        line.endPoint.y

    geometry.attributes.position
        .needsUpdate = TRUE

END FUNCTION
```

---

# 17. Preview During Stretch

Important CAD UX.

```text id="3zjlwm"
FUNCTION previewStretch(
    entities,
    displacement
)

    temporaryGeometry =
        cloneEntities(entities)

    applyTemporaryStretch(
        temporaryGeometry,
        displacement
    )

    renderPreviewGeometry()

END FUNCTION
```

---

# 18. Grip-Based Stretch

Modern CAD feature.

---

## Workflow

```text id="epjlwm"
User selects grip
    ↓
Drag grip
    ↓
Modify vertex
    ↓
Realtime rebuild
```

---

## Pseudocode

```text id="dzow67"
FUNCTION moveGrip(
    entity,
    gripIndex,
    newPosition
)

    editablePoints =
        getEditablePoints(entity)

    editablePoints[gripIndex] =
        newPosition

    rebuildEntity(entity)

END FUNCTION
```

---

# 19. Topology Considerations

Important for advanced CAD.

---

## Shared Vertices

If multiple entities share same node:

* stretch all connected geometry

---

## Constraints

May require:

* perpendicular preservation
* tangent continuity
* dimensional constraints

MVP can ignore.

---

# 20. Edge Cases

---

## Closed Polyline

Preserve closure:

```text id="3prxv5"
lastVertex == firstVertex
```

---

## Self-Intersection

Stretch may create invalid geometry.

---

## Arc Collapse

Arc reconstruction may fail.

Fallback:

* convert to spline
* or reject operation

---

# 21. Undo System

Important CAD requirement.

```text id="b5jccj"
FUNCTION beginUndoGroup()

    snapshotDrawingState()

END FUNCTION
```

---

# 22. Recommended MVP Scope

IMPLEMENT:

* LINE
* POLYLINE
* TEXT
* SPLINE CV movement

SKIP INITIALLY:

* ellipse
* dimensions
* hatch associative updates
* constraints

---

# 23. Recommended Entity Structure

```text id="n0v3yi"
ENTITY {
    id
    type
    vertices[]
    renderObject
    bounds
    snapPoints
    metadata
}
```

---

# 24. Final Recommended Architecture

```text id="yj4lc4"
Crossing Selection
        ↓
Editable Vertex Detection
        ↓
Displacement Calculation
        ↓
Geometry Modification
        ↓
Entity Rebuild
        ↓
Three.js Sync
        ↓
Spatial Index Update
```

This design is:

* compatible with classic AutoCAD behavior
* efficient for browser CAD
* modular
* scalable
* suitable for Three.js WebCAD systems.
