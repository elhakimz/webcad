Below is a **full, implementation-ready pseudocode spec** for **Dimension Rendering (AutoCAD 2.x–style)** in your WebCAD (Three.js).
It covers:

* Linear / Aligned / Angular / Radius dimensions
* Arrowheads (closed filled)
* Text placement (inside/outside, offset, rotation)
* Extension lines + dimension line
* Zoom-safe rendering strategy

---

# 📄 DIMENSION RENDERING ENGINE (2D)

---

# 🧩 1. Core Concept

```text
A dimension = measurement + visual guides
```

Each dimension is composed of:

* Extension lines
* Dimension line
* Arrowheads
* Text label

---

# 🧠 2. Data Model

```pseudo
Dimension {
  type: "LINEAR" | "ALIGNED" | "ANGULAR" | "RADIUS"

  p1: Point
  p2: Point

  center?: Point        // for angular/radius
  textPosition?: Point  // optional override

  offset: number        // distance from measured geometry
  value: number         // computed

  style: DimStyle
}
```

---

# 🎨 3. Style Model

```pseudo
DimStyle {
  textHeight
  arrowSize
  extensionOffset
  gap                // space between text and dimension line
  precision
}
```

---

# ⚙️ 4. Main Rendering Entry

```pseudo
FUNCTION renderDimension(dim):

  SWITCH dim.type:

    CASE "LINEAR":
        RETURN renderLinearDimension(dim)

    CASE "ALIGNED":
        RETURN renderAlignedDimension(dim)

    CASE "ANGULAR":
        RETURN renderAngularDimension(dim)

    CASE "RADIUS":
        RETURN renderRadiusDimension(dim)
```

---

# 📏 5. LINEAR DIMENSION

---

## 🧠 Geometry Setup

```pseudo
FUNCTION renderLinearDimension(dim):

  p1 ← dim.p1
  p2 ← dim.p2

  dir ← NORMALIZE(p2 - p1)

  normal ← PERPENDICULAR(dir)

  offsetVec ← normal * dim.offset

  // extension points
  e1 ← p1 + offsetVec
  e2 ← p2 + offsetVec
```

---

## 📐 Extension Lines

```pseudo
extLine1 ← LINE(p1, e1)
extLine2 ← LINE(p2, e2)
```

---

## 📏 Dimension Line

```pseudo
dimLine ← LINE(e1, e2)
```

---

# 🏹 6. Arrowheads (CRITICAL)

---

## 🧠 Arrow Geometry

Closed triangular arrow:

```pseudo
FUNCTION createArrow(point, direction, size):

  dir ← NORMALIZE(direction)

  base ← point - dir * size

  normal ← PERPENDICULAR(dir)

  left ← base + normal * (size * 0.5)
  right ← base - normal * (size * 0.5)

  RETURN TRIANGLE(point, left, right)
```

---

## Apply to both ends

```pseudo
arrow1 ← createArrow(e1, e2 - e1, style.arrowSize)
arrow2 ← createArrow(e2, e1 - e2, style.arrowSize)
```

---

# 🔤 7. Text Placement

---

## 🧠 Compute Value

```pseudo
value ← DISTANCE(p1, p2)

text ← FORMAT(value, style.precision)
```

---

## Default position (centered)

```pseudo
mid ← (e1 + e2) / 2
```

---

## Offset from line

```pseudo
textOffset ← normal * style.gap

textPos ← mid + textOffset
```

---

## Rotation

```pseudo
angle ← ATAN2(dir.y, dir.x)
```

---

## Final text object

```pseudo
textEntity ← TEXT(
  content = text,
  position = textPos,
  rotation = angle,
  height = style.textHeight
)
```

---

# 📦 8. Assemble Result

```pseudo
RETURN {
  extLine1,
  extLine2,
  dimLine,
  arrow1,
  arrow2,
  textEntity
}
```

---

# 📐 9. ALIGNED DIMENSION

---

## Difference from linear:

* Uses actual object angle

```pseudo
dir ← NORMALIZE(p2 - p1)
normal ← PERPENDICULAR(dir)
```

Everything else = same as linear.

---

# 🌀 10. ANGULAR DIMENSION

---

## 🧠 Inputs

```pseudo
center
p1
p2
```

---

## Compute angles

```pseudo
a1 ← ANGLE(center, p1)
a2 ← ANGLE(center, p2)
```

---

## Arc radius

```pseudo
r ← dim.offset
```

---

## Dimension arc

```pseudo
arc ← ARC(center, r, a1, a2)
```

---

## Arrowheads

```pseudo
arrow1Pos ← POINT_ON_CIRCLE(center, r, a1)
arrow2Pos ← POINT_ON_CIRCLE(center, r, a2)

arrow1 ← createArrow(arrow1Pos, TANGENT_DIRECTION(a1), size)
arrow2 ← createArrow(arrow2Pos, TANGENT_DIRECTION(a2), size)
```

---

## Text

```pseudo
midAngle ← (a1 + a2) / 2

textPos ← POINT_ON_CIRCLE(center, r + gap, midAngle)

text ← FORMAT(ANGLE_DIFF(a1,a2))
```

---

# ⚪ 11. RADIUS DIMENSION

---

## 🧠 Geometry

```pseudo
center
pointOnCircle
```

---

## Line

```pseudo
dimLine ← LINE(center, pointOnCircle)
```

---

## Arrow

```pseudo
arrow ← createArrow(pointOnCircle, center - pointOnCircle, size)
```

---

## Text

```pseudo
text ← "R" + FORMAT(radius)

textPos ← MID(center, pointOnCircle) + offset
```

---

# 📏 12. Text Fitting Logic (IMPORTANT)

---

## Case 1: Text fits inside

```pseudo
IF textWidth < distance(e1,e2):

    place inside
```

---

## Case 2: Too small → move outside

```pseudo
ELSE:

  textPos ← e2 + dir * offset

  add leader line if needed
```

---

# 🔄 13. Zoom-Independent Rendering

---

## Keep size constant on screen:

```pseudo
scale ← camera.zoomFactor

arrowSize_screen ← style.arrowSize / scale
textHeight_screen ← style.textHeight / scale
```

---

# 🧱 14. Three.js Mapping

---

## Lines

```pseudo
THREE.Line(BufferGeometry)
```

---

## Arrowheads

```pseudo
THREE.Mesh(ShapeGeometry)
```

---

## Text

```pseudo
THREE.TextGeometry OR sprite text
```

---

# ⚡ 15. Performance Optimization

```pseudo
- Cache dimension geometry
- Update only when:
    - zoom changes
    - geometry changes
- Batch line rendering
```

---

# ⚠️ 16. Edge Cases

---

### ❗ Zero length

```pseudo
IF distance(p1,p2) == 0:
    skip
```

---

### ❗ Very small dimensions

→ force text outside

---

### ❗ Flipped text

```pseudo
IF angle > 90°:
    rotate text 180°
```

---

# 🔚 17. Final Summary

```text
1. Offset geometry
2. Draw extension lines
3. Draw dimension line
4. Add arrowheads
5. Place text (center or outside)
6. Scale for zoom
```

---