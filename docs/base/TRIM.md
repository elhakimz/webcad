Below is a **practical, implementation-ready pseudocode** for a **TRIM command (2D)** in your WebCAD (Three.js + AutoLISP bridge). It follows classic AutoCAD behavior but keeps geometry manageable for MVP.

---

# ✂️ TRIM Command (2D) — Pseudocode

## 📌 Goal

Cut portions of objects (LINE / ARC / POLYLINE) using selected **cutting edges**.

---

# 🧩 1. Concept Model

```text id="o4c6s9"
Cutting Edges = boundaries
Target Objects = objects to be trimmed
Pick Point = which side to remove
```

---

# 🧠 2. Supported Entities (MVP)

* ✅ LINE
* ✅ ARC
* ⚠️ LWPOLYLINE (later)

---

# ⚙️ 3. High-Level Flow

```pseudo id="q1k8dx"
COMMAND TRIM:

  PROMPT "Select cutting edges:"
  cutters ← USER_SELECT_MULTIPLE()

  PROMPT "Select object to trim:"
  target, pickPoint ← USER_PICK_ENTITY()

  intersections ← FIND_INTERSECTIONS(target, cutters)

  IF intersections IS EMPTY:
      RETURN "Nothing to trim"

  trimmedParts ← TRIM_ENTITY(target, intersections, pickPoint)

  DELETE(target)

  FOR part IN trimmedParts:
      ADD_TO_DRAWING(part)
```

---

# 📐 4. Intersection Engine

## LINE vs LINE

```pseudo id="slr0nr"
FUNCTION intersectLineLine(L1, L2):

  p ← L1.start
  r ← L1.end - L1.start

  q ← L2.start
  s ← L2.end - L2.start

  t ← CROSS(q - p, s) / CROSS(r, s)
  u ← CROSS(q - p, r) / CROSS(r, s)

  IF CROSS(r, s) == 0:
      RETURN NONE  // parallel

  IF t BETWEEN 0 AND 1 AND u BETWEEN 0 AND 1:
      intersection ← p + t * r
      RETURN intersection

  RETURN NONE
```

---

## LINE vs ARC (simplified)

```pseudo id="0nz7j9"
FUNCTION intersectLineArc(line, arc):

  // Solve line-circle intersection
  circle ← (center, radius)

  points ← SOLVE_QUADRATIC(line, circle)

  valid ← []

  FOR p IN points:
      IF angleOf(p) BETWEEN arc.startAngle AND arc.endAngle:
          valid.ADD(p)

  RETURN valid
```

---

# ✂️ 5. Trim Logic (LINE)

## Core Idea:

Split line at intersection points, then keep only desired segment.

---

## 🧪 Pseudocode

```pseudo id="hn32pp"
FUNCTION trimLine(line, intersections, pickPoint):

  points ← [line.start] + intersections + [line.end]

  SORT points ALONG line

  segments ← []

  FOR i FROM 0 TO points.length - 2:
      seg ← LINE(points[i], points[i+1])
      segments.ADD(seg)

  // Determine which segment to remove
  FOR seg IN segments:

      IF isPointOnSegment(pickPoint, seg):
          REMOVE seg FROM segments
          BREAK

  RETURN segments
```

---

# 🌀 6. Trim ARC

## Strategy:

Split arc into smaller arcs

```pseudo id="f7y7x3"
FUNCTION trimArc(arc, intersections, pickPoint):

  angles ← []

  FOR p IN intersections:
      angles.ADD(angleFromCenter(arc.center, p))

  angles.ADD(arc.startAngle)
  angles.ADD(arc.endAngle)

  SORT angles

  arcSegments ← []

  FOR i FROM 0 TO angles.length - 2:

      seg ← ARC(
          center = arc.center,
          radius = arc.radius,
          start = angles[i],
          end = angles[i+1]
      )

      arcSegments.ADD(seg)

  FOR seg IN arcSegments:
      IF pointOnArc(pickPoint, seg):
          REMOVE seg
          BREAK

  RETURN arcSegments
```

---

# 🎯 7. Pick-Side Detection

```pseudo id="kwfjwh"
FUNCTION isPointOnSegment(point, segment):

  dist ← distanceToSegment(point, segment)

  RETURN dist < tolerance
```

---

# 🧠 8. Multiple Cutters

```pseudo id="31n0fk"
FUNCTION FIND_INTERSECTIONS(target, cutters):

  results ← []

  FOR cutter IN cutters:

      intersections ← INTERSECT(target, cutter)

      ADD intersections TO results

  RETURN UNIQUE(results)
```

---

# ⚠️ 9. Edge Cases

### ❗ No intersection

→ do nothing

### ❗ Tangent intersection

→ treat as single split

### ❗ Overlapping lines

→ skip in MVP

---

# ⚡ 10. Performance Tips

```pseudo id="9apmga"
- Use bounding box pre-check
- Spatial index (R-tree later)
- Cache intersections
```

---

# 🧱 11. Three.js Mapping

```pseudo id="e78e4i"
FUNCTION updateScene():

  REMOVE old mesh

  FOR each segment:
      mesh ← createLine(segment)
      ADD mesh to scene
```

---

# 🔄 12. Undo Integration

```pseudo id="9n2c9k"
BEGIN_UNDO()

DELETE(target)
ADD(newSegments)

END_UNDO()
```

---

# 🧪 13. AutoLISP Hook

```lisp id="5kx20x"
(defun c:trimtest ()
  (command "TRIM")
)
```

---

# 🚀 14. MVP Scope (DO THIS FIRST)

✅ LINE trimming
✅ Single cutter
✅ Single intersection
❌ Skip polyline initially

---

# 🔥 15. Next-Level Improvements

* Polyline trimming (bulge math)
* Fence trim
* Extend (reverse of trim)
* Smart trimming (AutoCAD-style)

---