Good—this is where CAD stops being “just drawing lines” and becomes **computational geometry**.

ANSI31 (the classic AutoCAD hatch) is not arbitrary fill—it’s:

> **Parallel lines at 45° with fixed spacing, clipped to a boundary**

So the real problem is:
✔ Generate infinite hatch lines
✔ Intersect them with a polygon
✔ Render clipped segments

---

# 🧠 ANSI31 Definition (what you must replicate)

ANSI31 pattern ≈

* Angle: **45°**
* Spacing: constant (e.g. 5 units)
* Line type: continuous

---

# ⚙️ Core Algorithm Overview

```text
1. Input boundary (closed polygon)
2. Compute bounding box
3. Generate parallel lines (infinite)
4. Clip each line against polygon
5. Render resulting segments
```

---

# 📐 Key Geometry Concept

You are doing:

> Line–Polygon Clipping

Best approach:

✔ Convert hatch lines → segments
✔ Use polygon clipping (even-odd rule)

---

# 🧩 PSEUDOCODE (Production-Level)

---

## 1. Entry Function

```pseudo
function hatchANSI31(polygon, spacing, angle = 45°):
    bbox = computeBoundingBox(polygon)

    direction = normalizeVector(angle)
    normal = perpendicular(direction)

    lines = generateParallelLines(bbox, spacing, normal)

    segments = []

    for line in lines:
        clipped = clipLineWithPolygon(line, polygon)
        segments.appendAll(clipped)

    return segments
```

---

## 2. Generate Parallel Lines

```pseudo
function generateParallelLines(bbox, spacing, normal):
    lines = []

    diag = lengthOfDiagonal(bbox)

    // project bbox corners onto normal axis
    minProj = +∞
    maxProj = -∞

    for corner in bbox.corners:
        proj = dot(corner, normal)
        minProj = min(minProj, proj)
        maxProj = max(maxProj, proj)

    // extend range slightly
    minProj -= spacing
    maxProj += spacing

    for d from minProj to maxProj step spacing:
        pointOnLine = normal * d

        // create long line in direction
        start = pointOnLine - direction * diag
        end   = pointOnLine + direction * diag

        lines.push(Line(start, end))

    return lines
```

---

## 3. Clip Line with Polygon (CRITICAL PART)

Use **segment intersection + sorting**

```pseudo
function clipLineWithPolygon(line, polygon):

    intersections = []

    for each edge in polygon.edges:
        pt = intersect(line, edge)
        if pt exists:
            intersections.push(pt)

    // sort along line direction
    intersections.sortByProjection(line.direction)

    segments = []

    // EVEN-ODD rule
    for i in range(0, intersections.length, 2):
        if i+1 < intersections.length:
            segments.push(Segment(intersections[i], intersections[i+1]))

    return segments
```

---

## 4. Line Intersection

```pseudo
function intersect(line, segment):
    // parametric line intersection
    // line: P + tD
    // segment: A + u(B-A)

    solve:
        P + tD = A + u(B-A)

    if solution exists and u in [0,1]:
        return intersection point

    return null
```

---

## 5. Three.js Rendering

```pseudo
function renderHatch(segments):

    geometry = new BufferGeometry()

    vertices = []

    for seg in segments:
        vertices.push(seg.start.x, seg.start.y, 0)
        vertices.push(seg.end.x, seg.end.y, 0)

    geometry.setAttribute("position", vertices)

    material = LineBasicMaterial(color = green)

    lines = LineSegments(geometry, material)

    scene.add(lines)
```

---

# ⚡ Performance Optimization (VERY IMPORTANT)

Without this, your app will die at ~5K lines.

### ✅ MUST DO:

### 1. Bounding Box Early Reject

```pseudo
if line does not intersect bbox → skip
```

---

### 2. Spatial Index (later)

* Use quadtree for edges

---

### 3. Batch Rendering

* Use ONE `LineSegments` (not many objects)

---

# 🧠 Advanced Accuracy Notes (AutoCAD-level)

To match AutoCAD behavior:

### 1. Pattern Origin

ANSI31 uses a base origin (0,0)

```pseudo
d = dot(point, normal) + offset
```

---

### 2. Associativity (Phase 2)

* hatch updates when boundary changes

---

### 3. Island Detection (holes)

You must support:

```text
Outer boundary → fill
Inner boundary → subtract
```

Use winding rule or multiple polygons.

---

# 🚨 Common Mistakes (avoid these)

❌ Drawing lines without clipping
❌ Using brute-force pixel fill
❌ Not sorting intersections
❌ Ignoring floating point precision

