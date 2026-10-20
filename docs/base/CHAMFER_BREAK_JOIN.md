# 📄 WebCAD 2D Editing Commands — Pseudocode

## Commands:

* CHAMFER
* BREAK
* JOIN
* LENGTHEN

Target:

* WebCAD (Three.js)
* AutoCAD 2.x behavior
* 2D drafting engine

---

# 🧩 1. CHAMFER

---

# 📌 Concept

```text id="u3x6oe"
Trim/extend two objects and connect them with a beveled edge.
```

---

# 🧠 Inputs

```pseudo id="ut79nn"
distance1
distance2

entityA
entityB
```

---

# ⚙️ High-Level Flow

```pseudo id="f8qxd9"
COMMAND CHAMFER:

  d1 ← GET_REAL("First chamfer distance:")
  d2 ← GET_REAL("Second chamfer distance:")

  entityA ← SELECT_ENTITY()
  entityB ← SELECT_ENTITY()

  chamfer ← CREATE_CHAMFER(entityA, entityB, d1, d2)

  REPLACE(entityA, chamfer.modifiedA)
  REPLACE(entityB, chamfer.modifiedB)

  ADD(chamfer.line)
```

---

# 📏 LINE-LINE Chamfer

---

## 🧪 Pseudocode

```pseudo id="bqod2o"
FUNCTION CREATE_CHAMFER(lineA, lineB, d1, d2):

  intersection ← INTERSECT_INFINITE(lineA, lineB)

  IF intersection IS NULL:
      ERROR "Lines do not intersect"

  dirA ← DIRECTION_AWAY_FROM_INTERSECTION(lineA)
  dirB ← DIRECTION_AWAY_FROM_INTERSECTION(lineB)

  chamferP1 ← intersection + dirA * d1
  chamferP2 ← intersection + dirB * d2

  newLineA ← TRIM_TO_POINT(lineA, chamferP1)
  newLineB ← TRIM_TO_POINT(lineB, chamferP2)

  chamferLine ← LINE(chamferP1, chamferP2)

  RETURN {
      modifiedA: newLineA,
      modifiedB: newLineB,
      line: chamferLine
  }
```

---

# ⚠️ Edge Cases

```pseudo id="j4yv0v"
- parallel lines
- zero distance
- chamfer exceeds line length
```

---

# 🔚 CHAMFER Summary

```text id="w96nrm"
1. Find intersection
2. Move along both lines
3. Trim originals
4. Insert connecting line
```

---

# 🧩 2. BREAK

---

# 📌 Concept

```text id="z1i2px"
Split object into two parts by one or two points.
```

---

# 🧠 Inputs

```pseudo id="mthv2f"
entity
breakPoint1
breakPoint2
```

---

# ⚙️ High-Level Flow

```pseudo id="h0s2m3"
COMMAND BREAK:

  entity ← SELECT_ENTITY()

  p1 ← GET_POINT("First break point:")
  p2 ← GET_POINT("Second break point:")

  result ← BREAK_ENTITY(entity, p1, p2)

  DELETE(entity)

  ADD(result.part1)
  ADD(result.part2)
```

---

# 📏 BREAK LINE

---

## 🧪 Pseudocode

```pseudo id="mt7q3w"
FUNCTION BREAK_LINE(line, p1, p2):

  SORT p1,p2 ALONG line

  part1 ← LINE(line.start, p1)

  part2 ← LINE(p2, line.end)

  RETURN {
      part1,
      part2
  }
```

---

# 🌀 BREAK ARC

---

## 🧪 Pseudocode

```pseudo id="j7hrl7"
FUNCTION BREAK_ARC(arc, p1, p2):

  a1 ← ANGLE(center, p1)
  a2 ← ANGLE(center, p2)

  arc1 ← ARC(center, r, startAngle, a1)

  arc2 ← ARC(center, r, a2, endAngle)

  RETURN {
      part1: arc1,
      part2: arc2
  }
```

---

# ⚠️ Edge Cases

```pseudo id="2xkq6s"
- break at endpoints
- coincident break points
- point not on entity
```

---

# 🔚 BREAK Summary

```text id="qv1mja"
1. Split geometry
2. Remove middle portion
3. Keep remaining parts
```

---

# 🧩 3. JOIN

---

# 📌 Concept

```text id="1j5ojl"
Merge connected entities into one polyline or arc chain.
```

---

# 🧠 Supported

```pseudo id="9qg3m8"
- LINE + LINE
- ARC + ARC
- LINE + ARC (phase 2)
```

---

# ⚙️ High-Level Flow

```pseudo id="p2h8ai"
COMMAND JOIN:

  entities ← SELECT_MULTIPLE()

  result ← JOIN_ENTITIES(entities)

  DELETE(entities)

  ADD(result)
```

---

# 📏 JOIN LINES

---

## 🧪 Pseudocode

```pseudo id="b2zokm"
FUNCTION JOIN_LINES(lines):

  sorted ← SORT_CONNECTED(lines)

  points ← []

  FOR line IN sorted:

      IF points EMPTY:
          points.ADD(line.start)

      points.ADD(line.end)

  RETURN POLYLINE(points)
```

---

# 🔗 Connectivity Check

```pseudo id="3qow9y"
FUNCTION ARE_CONNECTED(a, b):

  RETURN (
      DIST(a.end, b.start) < tolerance OR
      DIST(a.start, b.end) < tolerance
  )
```

---

# ⚠️ Edge Cases

```pseudo id="x7uhzj"
- disconnected geometry
- reversed directions
- overlapping lines
```

---

# 🔚 JOIN Summary

```text id="q25krl"
1. Detect connectivity
2. Order entities
3. Build polyline
```

---

# 🧩 4. LENGTHEN

---

# 📌 Concept

```text id="e09qkx"
Increase or decrease object length.
```

---

# 🧠 Modes

| Mode    | Behavior              |
| ------- | --------------------- |
| DELTA   | add/subtract distance |
| PERCENT | scale length          |
| TOTAL   | set exact length      |

---

# ⚙️ High-Level Flow

```pseudo id="fq69vc"
COMMAND LENGTHEN:

  mode ← GET_MODE()

  value ← GET_REAL()

  entity ← SELECT_ENTITY()

  pickPoint ← GET_POINT()

  result ← LENGTHEN_ENTITY(entity, mode, value, pickPoint)

  REPLACE(entity, result)
```

---

# 📏 LENGTHEN LINE

---

## 🧪 Pseudocode

```pseudo id="e9o89g"
FUNCTION LENGTHEN_LINE(line, mode, value, pickPoint):

  side ← CHOOSE_ENDPOINT(line, pickPoint)

  dir ← NORMALIZE(line.end - line.start)

  length ← DIST(line.start, line.end)

  SWITCH mode:

      CASE DELTA:
          newLength ← length + value

      CASE PERCENT:
          newLength ← length * (value / 100)

      CASE TOTAL:
          newLength ← value

  delta ← newLength - length

  IF side == "end":

      newEnd ← line.end + dir * delta

      RETURN LINE(line.start, newEnd)

  ELSE:

      newStart ← line.start - dir * delta

      RETURN LINE(newStart, line.end)
```

---

# 🌀 LENGTHEN ARC

---

## 🧪 Pseudocode

```pseudo id="j4szta"
FUNCTION LENGTHEN_ARC(arc, mode, value, pickPoint):

  side ← CHOOSE_ARC_SIDE()

  arcLength ← ARC_LENGTH(arc)

  newArcLength ← COMPUTE_NEW_LENGTH(mode, value)

  deltaAngle ← newArcLength / arc.radius

  IF side == "end":
      newEndAngle ← arc.endAngle + deltaAngle

  ELSE:
      newStartAngle ← arc.startAngle - deltaAngle

  RETURN UPDATED_ARC()
```

---

# ⚠️ Edge Cases

```pseudo id="u0v3r2"
- negative length
- zero-length line
- shrinking past zero
```

---

# 🔚 LENGTHEN Summary

```text id="4l1ezy"
1. Determine endpoint
2. Compute new length
3. Move endpoint
4. Rebuild entity
```

---

# ⚡ Shared Utilities

---

# 📐 Intersection

```pseudo id="kr01it"
INTERSECT(entityA, entityB)
```

---

# 📏 Projection

```pseudo id="o0fx4y"
PROJECT_POINT_ON_LINE(point, line)
```

---

# 🧭 Direction

```pseudo id="6jk9d0"
NORMALIZE(vector)
```

---

# 🔄 Undo Integration

```pseudo id="4d9z2v"
BEGIN_UNDO()

APPLY_MODIFICATIONS()

END_UNDO()
```

---

# 🧱 Three.js Rendering Update

```pseudo id="q4l3ez"
REMOVE old mesh
CREATE new geometry
ADD new mesh
```

---

# 🚀 MVP Priority

| Command  | Difficulty |
| -------- | ---------- |
| BREAK    | Easy       |
| LENGTHEN | Easy       |
| JOIN     | Medium     |
| CHAMFER  | Medium     |

---

# 🔚 Final Notes

These commands together complete the **core editing toolkit** of classic 2D CAD drafting:

```text id="owz45h"
TRIM
EXTEND
OFFSET
FILLET
CHAMFER
BREAK
JOIN
LENGTHEN
```
