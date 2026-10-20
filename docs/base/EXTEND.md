Here’s a **clean, implementation-ready pseudocode** for the **EXTEND command (2D)** for your **WebCAD (Three.js + AutoLISP bridge)**. It’s essentially the *inverse of TRIM*: instead of cutting away, you **grow geometry until it hits boundary edges**.

---

# 📄 EXTEND Command (2D) — Pseudocode

---

# 🧩 1. Concept

```text
Boundary Edges = targets to extend to
Source Object = object to extend
Pick Point = which end to extend
```

👉 Extend a line/arc until it intersects a boundary.

---

# 🧠 2. Supported Entities (MVP)

* ✅ LINE
* ⚠️ ARC (basic)
* ❌ POLYLINE (later)

---

# ⚙️ 3. High-Level Flow

```pseudo
COMMAND EXTEND:

  PROMPT "Select boundary edges:"
  boundaries ← USER_SELECT_MULTIPLE()

  PROMPT "Select object to extend:"
  target, pickPoint ← USER_PICK_ENTITY()

  intersections ← FIND_EXTENSION_INTERSECTIONS(target, boundaries, pickPoint)

  IF intersections IS EMPTY:
      RETURN "Nothing to extend"

  newEntity ← EXTEND_ENTITY(target, intersections, pickPoint)

  REPLACE(target, newEntity)
```

---

# 🔍 4. Extension Intersection Logic

👉 Difference from TRIM:

* TRIM uses **existing segment**
* EXTEND uses **infinite extension**

---

## 📏 LINE Extension Intersection

```pseudo
FUNCTION intersectLineInfinite(line, boundary):

  // Convert line to infinite form
  p ← line.start
  r ← NORMALIZE(line.end - line.start)

  // boundary is finite
  q ← boundary.start
  s ← boundary.end - boundary.start

  denom ← CROSS(r, s)

  IF denom == 0:
      RETURN NONE

  t ← CROSS(q - p, s) / denom
  u ← CROSS(q - p, r) / denom

  IF u BETWEEN 0 AND 1:
      intersection ← p + t * r
      RETURN intersection

  RETURN NONE
```

---

# 🎯 5. Choose Correct Extension Direction

👉 Determine which endpoint to extend

```pseudo
FUNCTION chooseEndpoint(line, pickPoint):

  d1 ← DIST(pickPoint, line.start)
  d2 ← DIST(pickPoint, line.end)

  IF d1 < d2:
      RETURN "start"
  ELSE:
      RETURN "end"
```

---

# ✏️ 6. Extend LINE

```pseudo
FUNCTION extendLine(line, intersections, pickPoint):

  side ← chooseEndpoint(line, pickPoint)

  bestPoint ← FIND_NEAREST_VALID_INTERSECTION(line, intersections, side)

  IF bestPoint IS NULL:
      RETURN line

  IF side == "start":
      newLine ← LINE(bestPoint, line.end)
  ELSE:
      newLine ← LINE(line.start, bestPoint)

  RETURN newLine
```

---

# 📐 7. Filter Valid Intersections

👉 Only accept intersections in the **extension direction**

```pseudo
FUNCTION FIND_NEAREST_VALID_INTERSECTION(line, intersections, side):

  valid ← []

  dir ← NORMALIZE(line.end - line.start)

  FOR p IN intersections:

      v ← p - line.start

      t ← DOT(v, dir)

      IF side == "end" AND t > LENGTH(line):
          valid.ADD(p)

      IF side == "start" AND t < 0:
          valid.ADD(p)

  IF valid IS EMPTY:
      RETURN NULL

  RETURN CLOSEST(valid)
```

---

# 🌀 8. Extend ARC (simplified)

👉 Extend by increasing angle range

```pseudo
FUNCTION extendArc(arc, intersections, pickPoint):

  angles ← []

  FOR p IN intersections:
      angles.ADD(angleFromCenter(arc.center, p))

  side ← chooseArcSide(arc, pickPoint)

  IF side == "start":
      newStart ← MIN(angles)
      RETURN ARC(center, r, newStart, arc.endAngle)

  ELSE:
      newEnd ← MAX(angles)
      RETURN ARC(center, r, arc.startAngle, newEnd)
```

---

# 🧠 9. Multiple Boundaries

```pseudo
FUNCTION FIND_EXTENSION_INTERSECTIONS(target, boundaries, pickPoint):

  results ← []

  FOR boundary IN boundaries:

      pts ← INTERSECT_INFINITE(target, boundary)

      ADD pts TO results

  RETURN results
```

---

# ⚠️ 10. Edge Cases

### ❗ No intersection in direction

→ do nothing

### ❗ Parallel lines

→ cannot extend

### ❗ Intersection behind object

→ ignore

---

# ⚡ 11. Performance Optimization

```pseudo
- Bounding box pre-check
- Spatial index (R-tree later)
- Early exit when closest found
```

---

# 🧱 12. Three.js Update

```pseudo
FUNCTION updateScene(oldEntity, newEntity):

  REMOVE old mesh

  mesh ← createLine(newEntity)

  ADD mesh
```

---

# 🔄 13. Undo Integration

```pseudo
BEGIN_UNDO()

REPLACE(oldEntity, newEntity)

END_UNDO()
```

---

# 🧪 14. AutoLISP Integration

```lisp
(defun c:exttest ()
  (command "EXTEND")
)
```

---

# 🔌 Bridge Hook

```pseudo
FUNCTION lisp_command_EXTEND(args):

  boundaries ← GET_SELECTION()

  target, pick ← GET_PICK()

  RETURN EXTEND(boundaries, target, pick)
```

---

# 🚀 15. MVP Scope

✅ LINE extend
✅ Single boundary
✅ Single intersection

❌ Polyline extend
❌ Smart extend

