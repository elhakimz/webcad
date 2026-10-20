# 📄 WebCAD Pseudocode

## NOTE / ANNOTATE Command

### CAD Annotation Leader System

Target:

* WebCAD (Three.js)
* AutoCAD 2.x style annotation leaders
* Generic annotation attached to ANY entity

---

# 🧠 1. Purpose

`NOTE` / `ANNOTATE` creates:

```text id="6fyvst"
leader arrow
+
dog-leg shelf
+
annotation text
```

attached to:

* lines
* circles
* arcs
* polylines
* dimensions
* any drawing object

---

# 📐 Typical Visual

```text id="3i4ex5"
      NOTE TEXT
      |
------|
     /
    /
   >
```

Components:

| Part          | Purpose                 |
| ------------- | ----------------------- |
| Arrow         | points to object        |
| Leader        | angled line             |
| Dog-leg shelf | horizontal text support |
| Vertical stub | separator before text   |
| Text          | annotation content      |

---

# 🧩 2. Semantic Data Model

---

# IMPORTANT

Do NOT store final geometry.

Store semantic meaning only.

---

## Data Model

```pseudo id="l5mjlwm"
LeaderAnnotation {

  targetEntityId

  anchorPoint

  bendPoint

  textPosition

  text

  styleId

  textStyleId
}
```

---

# 🧠 Meaning

| Field        | Meaning            |
| ------------ | ------------------ |
| anchorPoint  | arrow target       |
| bendPoint    | dog-leg corner     |
| textPosition | text anchor        |
| text         | annotation content |

---

# ⚙️ 3. Command Workflow

---

# User Flow

```text id="4vjlwm"
1. select object
2. pick arrow point
3. pick dog-leg direction
4. enter text
```

---

# Main Command

```pseudo id="jlwm70"
COMMAND NOTE:

  target = SELECT_ENTITY()

  anchorPoint = PICK_POINT_ON_ENTITY()

  bendPoint = PICK_POINT()

  text = GET_TEXT()

  annotation =
      CREATE_ANNOTATION(
          target,
          anchorPoint,
          bendPoint,
          text
      )

  ADD(annotation)
```

---

# 🧠 4. Fundamental Geometry Model

Leader annotation consists of:

```text id="jlwm71"
arrow
+
angled leader
+
horizontal shelf
+
vertical separator
+
text
```

---

# 📐 5. Leader Direction Solver

---

# STEP 1 — Determine Direction

```pseudo id="jlwm72"
dir =
    NORMALIZE(
        bendPoint - anchorPoint
    )
```

---

# STEP 2 — Shelf Direction

Usually horizontal.

---

## Screen Readability Rule

```pseudo id="jlwm73"
IF dir.x >= 0:

    shelfDir = (1,0)

ELSE:

    shelfDir = (-1,0)
```

---

# 🚀 Prevents upside-down notes.

---

# 📏 6. Angled Leader Geometry

---

# Leader Segment

```pseudo id="jlwm74"
leader1 =
    LINE(
        anchorPoint,
        bendPoint
    )
```

---

# 📐 7. Shelf Solver (Dog-Leg)

---

# STEP 1 — Measure Text Width

```pseudo id="jlwm75"
textWidthPx =
    measureText(text)
```

---

# STEP 2 — Convert To World

```pseudo id="jlwm76"
textWidthWorld =
    pixelsToWorld(
        textWidthPx
    )
```

---

# STEP 3 — Shelf Length

```pseudo id="jlwm77"
shelfLength =
    textWidthWorld
    + margin
```

---

# STEP 4 — Shelf End

```pseudo id="jlwm78"
shelfEnd =
    bendPoint
    + shelfDir * shelfLength
```

---

# STEP 5 — Shelf Geometry

```pseudo id="jlwm79"
leader2 =
    LINE(
        bendPoint,
        shelfEnd
    )
```

---

# 🚀 This creates classic CAD dog-leg.

---

# 📏 8. Vertical Separator Line

---

# Purpose

Small vertical marker before text.

---

# STEP 1 — Separator Height

```pseudo id="jlwm7a"
sepHeight =
    pixelsToWorld(
        style.separatorHeightPx
    )
```

---

# STEP 2 — Separator Position

```pseudo id="jlwm7b"
sepBase = shelfEnd
```

---

# STEP 3 — Separator Direction

Always vertical in screen orientation.

```pseudo id="jlwm7c"
sepTop =
    sepBase + (0,sepHeight)
```

---

# STEP 4 — Build Separator

```pseudo id="jlwm7d"
separator =
    LINE(
        sepBase,
        sepTop
    )
```

---

# 📐 9. Text Placement

---

# STEP 1 — Gap After Separator

```pseudo id="jlwm7e"
textGap =
    pixelsToWorld(
        style.textGapPx
    )
```

---

# STEP 2 — Final Text Position

```pseudo id="jlwm7f"
textPos =
    sepTop
    + shelfDir * textGap
```

---

# 🚀 Classic engineering annotation style.

---

# 🔠 10. Text Rotation

---

# Usually horizontal

```pseudo id="jlwm7g"
textRotation = 0
```

---

# Future option

```pseudo id="jlwm7h"
IF style.alignTextToLeader:

    textRotation =
        leaderAngle
```

---

# 📏 11. Arrowhead Solver

---

# Arrow Points Toward Object

```pseudo id="jlwm7i"
arrow.direction =
    NORMALIZE(
        anchorPoint - bendPoint
    )
```

---

# Screen-Space Arrow Size

```pseudo id="jlwm7j"
arrowSizeWorld =
    pixelsToWorld(
        style.arrowSizePx
    )
```

---

# Build Arrow

```pseudo id="jlwm7k"
arrow =
    buildArrow(
        anchorPoint,
        arrow.direction,
        arrowSizeWorld
    )
```

---

# 📦 12. Final Render Package

```pseudo id="jlwm7l"
RenderData {

  arrowhead

  leaderSegments[]

  separator

  text

  textPosition

  textRotation
}
```

---

# ⚡ 13. Important CAD Layout Rules

---

# A. Shelf Must Remain Horizontal

Even if leader angled.

---

# B. Text Must Stay Readable

Never upside-down.

---

# C. Shelf Must Grow With Text

Dynamic width.

---

# D. Arrow Size Must Be Screen-Stable

Pixel-based.

---

# 🚀 Same architecture as professional CAD.

---

# 🧠 14. Associativity (VERY IMPORTANT)

Annotation should follow geometry.

---

# Example

Move circle:

```text id="jlwm7m"
annotation follows
```

---

# Data Dependency

```pseudo id="jlwm7n"
annotation.targetEntityId
```

---

# On Geometry Update

```pseudo id="jlwm7o"
recomputeAnchor()
rebuildAnnotation()
```

---

# 📏 15. Attachment Solver

---

# Generic Object Picking

```pseudo id="jlwm7p"
anchorPoint =
    closestPointOnEntity(
        entity,
        mousePoint
    )
```

---

# Works for:

| Entity   | Method          |
| -------- | --------------- |
| LINE     | projection      |
| CIRCLE   | radial          |
| ARC      | arc projection  |
| POLYLINE | nearest segment |

---

# 🚀 Enables universal annotations.

---

# ⚡ 16. Zoom-Stable Rendering

---

# World-space

Render:

* leader lines
* separator

---

# Screen-space

Render:

* arrowheads
* text

---

# 🚀 Critical for CAD readability.

---

# 📐 17. Style Model

```pseudo id="jlwm7q"
LeaderStyle {

  arrowSizePx

  shelfGapPx

  separatorHeightPx

  textGapPx

  color

  textHeightPx
}
```

---

# 🚀 Similar to AutoCAD MLEADERSTYLE later.

---

# 🧠 18. Optional Future Features

---

# A. Multi-line Notes

```text id="jlwm7r"
line1
line2
line3
```

---

# B. Boxed Notes

```text id="jlwm7s"
+-----------+
| NOTE TEXT |
+-----------+
```

---

# C. Curved Leaders

Spline leader.

---

# D. Multiple Leaders

One text → many arrows.

---

# 🚀 This evolves naturally into MLEADER.

---

# 📏 19. Recommended MVP

DO FIRST:

✅ arrowhead
✅ angled leader
✅ horizontal shelf
✅ separator line
✅ horizontal text

---

THEN:

* multiline text
* leader styles
* associative updates
* collision avoidance

---

# 🔚 Final Insight

Engineering notes/leaders are fundamentally:

```text id="jlwm7t"
layout-driven annotation objects
```

NOT merely:

```text id="jlwm7u"
lines + text
```

The real complexity lies in:

* readability
* screen-space stability
* typography
* layout rules
* attachment behavior

which is why professional CAD annotation systems become entire subsystems of their own.
