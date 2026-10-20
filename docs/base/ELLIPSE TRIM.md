ELLIPSE TRIM

Your problem is almost certainly this:

```text id="a3t6yz"
You are measuring distance to ellipse CENTER,
NOT distance to ellipse CURVE.
```

From your logs:

```text id="n8it1c"
Ellipse distance: 141
tolerance: 2.33
near: false
```

That means your current selection engine probably does:

```pseudo id="m8w2c0"
distance(mouse, ellipse.center)
```

which is wrong for ellipse picking.

For CAD selection/TRIM, you must compute:

```text id="6wrt0s"
minimum distance from mouse point to ellipse perimeter
```

NOT center distance.

---

# 🎯 Correct Solution

You need:

```pseudo id="oqb22c"
distanceToEllipseCurve(point, ellipse)
```

Then:

```pseudo id="tzph4z"
IF distance < pickTolerance:
    ellipse is selected
```

---

# 📄 Proper Ellipse Near Detection Pseudocode

---

# 🧩 1. Ellipse Model

```pseudo id="3g66pm"
Ellipse {
  cx
  cy

  rx
  ry

  rotation
}
```

---

# 🧠 2. Core Idea

CAD selection should test:

```text id="s1b2uy"
mouse point vs nearest point on ellipse perimeter
```

---

# ⚙️ 3. High-Level Algorithm

```pseudo id="st3ydq"
FUNCTION isPointNearEllipse(mouse, ellipse, tolerance):

  nearest ← closestPointOnEllipse(mouse, ellipse)

  d ← DIST(mouse, nearest)

  RETURN d <= tolerance
```

---

# 🚀 4. Fast Practical Solution (Recommended)

Instead of expensive analytic math:

```text id="1q1m2r"
sample ellipse into segments
```

This is exactly what many CAD systems do internally for picking.

---

# 📐 5. Sampled Ellipse Detection

---

## 🧪 Pseudocode

```pseudo id="2uz6f6"
FUNCTION closestPointOnEllipse(mouse, ellipse):

  minDist ← INFINITY
  bestPoint ← NULL

  steps ← 128

  FOR i FROM 0 TO steps:

      t ← (i / steps) * 2π

      p ← ellipsePoint(ellipse, t)

      d ← DIST(mouse, p)

      IF d < minDist:
          minDist ← d
          bestPoint ← p

  RETURN bestPoint
```

---

# 📏 6. Ellipse Point Calculation

---

## Supports rotation

```pseudo id="wwi8dk"
FUNCTION ellipsePoint(e, t):

  x ← e.rx * cos(t)
  y ← e.ry * sin(t)

  // rotate
  xr ← x*cos(e.rotation) - y*sin(e.rotation)
  yr ← x*sin(e.rotation) + y*cos(e.rotation)

  RETURN POINT(
      e.cx + xr,
      e.cy + yr
  )
```

---

# 🎯 7. Final Near Test

```pseudo id="qh5mrz"
FUNCTION isPointNearEllipse(mouse, ellipse, tolerance):

  nearest ← closestPointOnEllipse(mouse, ellipse)

  d ← DIST(mouse, nearest)

  RETURN d <= tolerance
```

---

# ⚡ 8. Optimized Version (IMPORTANT)

Do bounding-box rejection FIRST.

---

## 🧪 Pseudocode

```pseudo id="jv7mw5"
FUNCTION isPointNearEllipse(mouse, ellipse, tolerance):

  bbox ← ellipseBoundingBox(ellipse)

  expanded ← EXPAND(bbox, tolerance)

  IF mouse NOT IN expanded:
      RETURN false

  nearest ← closestPointOnEllipse(mouse, ellipse)

  RETURN DIST(mouse, nearest) <= tolerance
```

---

# 📦 9. Bounding Box

```pseudo id="uj4a6m"
minX = cx - rx
maxX = cx + rx

minY = cy - ry
maxY = cy + ry
```

For rotated ellipse:

* either approximate
* or sample points once

---

# 🔥 10. Why Your Current TRIM Fails

TRIM selection requires:

```text id="kdxpxs"
pick EXACT target object
```

But your ellipse never becomes selected because:

```text id="v9h0sj"
distance to center >> pick tolerance
```

So command never reaches trimming stage.

---

# 🧠 11. Recommended Production Approach

Use same geometry for:

* rendering
* selection
* snapping
* trim intersection

---

# 🧪 Unified Ellipse Cache

```pseudo id="yzm7m5"
ellipse.cachedPolyline = tessellateEllipse()
```

Then:

```pseudo id="0qv4w6"
- render polyline
- select polyline
- intersect polyline
- trim polyline
```

This massively simplifies CAD engine.

---

# ⚡ 12. Better Selection Algorithm (Recommended)

Instead of point sampling:

```pseudo id="icok06"
distancePointToSegment()
```

against tessellated ellipse segments.

---

# 🧪 Pseudocode

```pseudo id="3bm1gj"
FUNCTION isPointNearEllipse(mouse, ellipse, tolerance):

  polyline ← ellipse.cachedPolyline

  FOR each segment IN polyline:

      d ← distancePointToSegment(mouse, segment)

      IF d <= tolerance:
          RETURN true

  RETURN false
```

---

# 🚀 13. THIS is the CAD-grade solution

Because now:

✅ selection
✅ snapping
✅ trim
✅ intersection
✅ offset

all use SAME geometry.

---

# 🔥 14. Recommended Tessellation

| Quality  | Segments |
| -------- | -------- |
| Draft    | 32       |
| Good     | 64       |
| CAD-like | 128      |

---

# 📏 15. Extra Important: Pick Tolerance

Your logs show:

```text id="rqb4cv"
tolerance: 2.33
```

That is WAY too tiny in world coordinates.

Use:

```pseudo id="p0hn9g"
tolerance = pixelsToWorld(8px)
```

NOT fixed world units.

---

# 🧪 Example

```pseudo id="5bopmt"
FUNCTION getPickTolerance(camera):

  RETURN screenPixelsToWorld(8)
```

---

