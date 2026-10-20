DIMALIGNED

# 📄 DIMALIGNED — Deep CAD-Grade Pseudocode

## For WebCAD (Three.js CAD Engine)

---

# 🧠 What Makes DIMALIGNED Different?

`DIMLINEAR`

* measures horizontal/vertical projection

`DIMALIGNED`

* measures TRUE distance along object angle

This means:

```text id="w8w3sm"
dimension line is PARALLEL to measured geometry
```

That changes:

* extension line direction
* text rotation
* arrow direction
* offset computation

---

# 🎯 Core Goal

Given:

```text id="lr04o6"
p1
p2
dimension offset point
```

Generate:

* extension lines
* aligned dimension line
* arrowheads
* dimension text
* optional outside placement

---

# 🧩 1. Semantic Data Model

```pseudo id="9wo42l"
AlignedDimension {

  p1
  p2

  offsetPoint

  style

  textOverride?

  layer
}
```

---

# 🧠 Why Use offsetPoint?

Because AutoCAD-style DIMALIGNED workflow:

```text id="v0pj3r"
1. pick first point
2. pick second point
3. drag dimension line location
```

The third click determines:

* side
* offset distance

---

# ⚙️ 2. Main Pipeline

```pseudo id="07s6h6"
FUNCTION buildAlignedDimension(dim):

  solveDimensionGeometry()

  solveTextPlacement()

  buildRenderData()

  RETURN renderData
```

---

# 📐 3. Solve Base Geometry

---

# STEP 1 — Direction Vector

```pseudo id="c0b55h"
dir = NORMALIZE(p2 - p1)
```

---

# STEP 2 — Normal Vector

2D perpendicular:

```pseudo id="a13npx"
normal = (-dir.y, dir.x)
```

---

# STEP 3 — Determine Correct Side

Need offset side from user drag point.

---

## Signed Side Test

```pseudo id="pt7vf2"
mid = (p1 + p2) / 2

v = offsetPoint - mid

side = DOT(v, normal)
```

---

## Flip Normal If Needed

```pseudo id="tw2l4u"
IF side < 0:
    normal = -normal
```

---

# STEP 4 — Compute Offset Distance

```pseudo id="f5l0d9"
offsetDistance = ABS(
  DOT(offsetPoint - p1, normal)
)
```

---

# 🚀 Critical Insight

You are projecting user drag onto normal.

NOT using Euclidean distance.

---

# STEP 5 — Build Dimension Line

---

## Extension Endpoints

```pseudo id="djlwm7"
e1 = p1 + normal * offsetDistance
e2 = p2 + normal * offsetDistance
```

These are the actual dimension line endpoints.

---

# STEP 6 — Extension Lines

```pseudo id="n5t46u"
ext1 = LINE(p1, e1)
ext2 = LINE(p2, e2)
```

---

# STEP 7 — Dimension Line

```pseudo id="tw1d3j"
dimLine = LINE(e1, e2)
```

---

# 🏹 4. Arrowhead Solver

This is where CAD gets tricky.

---

# STEP 1 — Dimension Direction

```pseudo id="3mk8q6"
dimDir = NORMALIZE(e2 - e1)
```

---

# STEP 2 — Arrow Placement

Arrowheads point inward.

---

## Arrow 1

```pseudo id="k89r7d"
arrow1.position = e1
arrow1.direction = dimDir
```

---

## Arrow 2

```pseudo id="2h8qgk"
arrow2.position = e2
arrow2.direction = -dimDir
```

---

# STEP 3 — Arrow Geometry

---

## Screen-Space Strategy (IMPORTANT)

DO NOT use world units.

Use pixel size:

```pseudo id="h5mtl4"
arrowPixelSize = style.arrowSizePx
```

---

## Convert To World Scale

```pseudo id="jlk8k5"
worldArrowSize = pixelsToWorld(
    arrowPixelSize,
    camera
)
```

---

# STEP 4 — Build Triangle

```pseudo id="bh0zxr"
FUNCTION buildArrow(position, direction, size):

  dir = NORMALIZE(direction)

  normal = PERP(dir)

  tip = position

  base = position - dir * size

  left = base + normal * size * 0.5
  right = base - normal * size * 0.5

  RETURN TRIANGLE(tip, left, right)
```

---

# 🔤 5. Text Layout Engine (VERY IMPORTANT)

This is the hardest part.

---

# STEP 1 — Measurement

```pseudo id="c6s5li"
measurement = DISTANCE(p1, p2)
```

---

# STEP 2 — Format Text

```pseudo id="ns8hmm"
text = formatUnits(
    measurement,
    style.precision
)
```

---

# STEP 3 — Measure Text Width

Need font metrics.

---

## DO NOT estimate badly.

Use:

* canvas.measureText()
* SDF metrics

---

## Example

```pseudo id="0o02f0"
textWidthPx = measureText(text, font)
```

---

# STEP 4 — Convert Width To World

```pseudo id="sqksq1"
textWidthWorld = pixelsToWorld(
    textWidthPx,
    camera
)
```

---

# STEP 5 — Available Space

```pseudo id="apjlwm"
dimLength = DIST(e1, e2)
```

---

# STEP 6 — Fit Decision

```pseudo id="dzakv4"
fitsInside =
  textWidthWorld <
  (dimLength - 2*arrowSizeWorld - margin)
```

---

# 🚀 THIS is exactly how real CAD works.

---

# STEP 7A — INSIDE Placement

---

## Center Position

```pseudo id="47fk0q"
textPos = MID(e1, e2)
```

---

## Offset From Line

```pseudo id="6jzqzv"
textPos += normal * textGapWorld
```

---

## Rotation

```pseudo id="o92k1n"
textAngle = ATAN2(dimDir.y, dimDir.x)
```

---

# STEP 7B — OUTSIDE Placement

If dimension too small.

---

## Place Outside

```pseudo id="yx6s81"
textPos = e2 + dimDir * outsideOffset
```

---

## Optional Leader

```pseudo id="6jwp4f"
leader = LINE(
    MID(e1,e2),
    textPos
)
```

---

# ⚠️ 6. Text Orientation Rules

CAD text must NEVER appear upside down.

---

# STEP 1 — Normalize Angle

```pseudo id="j4q6g5"
IF angle > 90° OR angle < -90°:
    angle += 180°
```

---

# STEP 2 — Keep Upright

```pseudo id="n3vch6"
textRotation = normalizeReadable(angle)
```

---

# 🔥 THIS is critical.

Without it:

* dimensions become unreadable.

---

# 📏 7. Text Gap Rules

Dimension line should not cross text.

---

# STEP 1 — Compute Text Box

```pseudo id="d99xk4"
textBox = computeTextBounds()
```

---

# STEP 2 — Break Dimension Line

Instead of:

```text id="4s1u58"
----------------
```

Use:

```text id="5yyjyc"
------ TEXT ------
```

---

# STEP 3 — Split Dimension Line

```pseudo id="7yeqrz"
leftSeg = LINE(e1, textBox.left)
rightSeg = LINE(textBox.right, e2)
```

---

# 🚀 HUGE CAD detail.

This is why dimensions feel professional.

---

# 🧱 8. Final Render Package

```pseudo id="sk0ih9"
RenderData {

  extensionLines[]

  dimensionLineSegments[]

  arrowheads[]

  text

  leaders[]
}
```

---

# ⚡ 9. Three.js Rendering Strategy

---

# A. Geometry Layer

```pseudo id="n7h9yy"
THREE.LineSegments
```

for:

* ext lines
* dim lines

---

# B. Overlay Layer

```pseudo id="e38b92"
sprites / SDF text
```

for:

* text
* arrows

---

# 🚀 Recommended:

Separate scene graph.

---

# 📐 10. Associativity (VERY IMPORTANT)

DIMALIGNED should recompute automatically.

---

# Example

Move endpoint:

```text id="7z3r3o"
LINE moved
→ dimension updates
```

---

# Recommended Dependency Graph

```pseudo id="0tey3e"
Dimension.references = [entityId]
```

---

# On Geometry Change

```pseudo id="o3pb0t"
rebuildDimension()
```

---

# ⚡ 11. Zoom Stability

DO NOT scale dimensions uniformly.

---

# Correct:

| Component | Space  |
| --------- | ------ |
| ext lines | world  |
| dim line  | world  |
| arrows    | screen |
| text      | screen |

---

# 🔥 THIS is the secret architecture.

---

# 🧠 12. Real CAD Behavior You Eventually Need

---

# A. Forced Text Position

User drags text manually.

---

# B. Text Centering

```pseudo id="br8xnm"
centered
left
right
```

---

# C. Suppress Arrows

When too small.

---

# D. Alternate Units

```text id="xtz8eu"
25.4 [1"]
```

---

# 🚀 Final Production Architecture

```text id="mlk1r5"
Dimension Entity
    ↓
Geometry Solver
    ↓
Text Layout Engine
    ↓
Viewport Decorator
    ↓
Renderer
```

---

# 🔚 Final Insight

A professional CAD dimension system is actually:

```text id="d4dzh4"
part geometry engine
part typography engine
part UI engine
```

NOT just lines + text.

That’s why CAD dimensions are deceptively difficult to implement correctly.
