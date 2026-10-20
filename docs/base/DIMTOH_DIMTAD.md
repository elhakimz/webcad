DIMTOH, DIMTAD

# 📄 WebCAD — Deep Pseudocode

## DIMTOH + DIMTAD

### CAD Annotation Layout Engine

Target:

* DIMDIAMETER
* DIMRADIUS
* DIMALIGNED
* DIMLINEAR

---

# 🧠 Important Understanding

These variables are NOT geometry variables.

They are:

```text id="z4w8ol"
annotation layout rules
```

Meaning:

* same measurement
* same dimension line
* DIFFERENT text layout behavior

This is fundamentally a typography/UI problem.

---

# 🧩 PART 1 — DIMTOH

# Text Outside Horizontal

---

# 🧠 Purpose

Controls behavior when text is placed OUTSIDE a dimension.

---

# Behavior

| DIMTOH | Result                         |
| ------ | ------------------------------ |
| ON     | outside text forced horizontal |
| OFF    | text follows dimension angle   |

---

# 🚀 Key Consequence

If horizontal text is forced:

* angled dimension line cannot directly support text
* CAD creates a horizontal shelf (“dog-leg”)

---

# Visual

---

# DIMTOH OFF

```text id="vlcdwt"
------/ 45°
     TEXT
```

Straight continuation.

---

# DIMTOH ON

```text id="50h0pr"
------/
      ───── TEXT
```

Dog-leg shelf.

---

# 🧠 Architectural Insight

DIMTOH affects:

* text rotation
* leader geometry
* shelf generation

NOT measurement geometry.

---

# 📦 1. Style Variable

```pseudo id="pvd4cj"
DimStyle {

  DIMTOH : boolean
}
```

---

# ⚙️ 2. Main Layout Decision

```pseudo id="w3pjlwm"
FUNCTION solveOutsideTextLayout(dim):

  IF style.DIMTOH == ON:

      RETURN solveHorizontalOutsideText()

  ELSE:

      RETURN solveAlignedOutsideText()
```

---

# 📐 3. DIMTOH OFF

# Angled Outside Text

---

# Text follows dimension angle.

---

# STEP 1 — Text Rotation

```pseudo id="jlwm61"
textRotation =
    normalizeReadable(
        dimensionAngle
    )
```

---

# STEP 2 — Text Position

```pseudo id="jlwm62"
textPos =
    extensionPoint
    + dimDir * outsideOffset
```

---

# STEP 3 — Leader Geometry

Straight continuation.

```pseudo id="jlwm63"
leader =
    LINE(
        dimEnd,
        textPos
    )
```

---

# 🚀 Result

```text id="jlwm64"
simple angled extension
```

No dog-leg.

---

# 📐 4. DIMTOH ON

# Horizontal Outside Text

---

# Text rotation forced horizontal.

---

# STEP 1 — Text Rotation

```pseudo id="jlwm65"
textRotation = 0
```

---

# 🚀 But now problem appears:

Dimension line is angled:

```text id="jlwm66"
////
```

Text is horizontal:

```text id="jlwm67"
TEXT
```

They no longer align.

---

# CAD solution:

# DOG-LEG SHELF

---

# STEP 2 — Compute Angled Leader End

```pseudo id="jlwm68"
leaderEnd =
    dimEnd
    + dimDir * outsideOffset
```

---

# STEP 3 — Create Horizontal Shelf

---

# Determine Shelf Direction

Usually screen-right.

---

## Readable Direction

```pseudo id="jlwm69"
IF dimDir.x >= 0:

    shelfDir = (1,0)

ELSE:

    shelfDir = (-1,0)
```

---

# STEP 4 — Shelf End

```pseudo id="jlwm6a"
shelfEnd =
    leaderEnd
    + shelfDir * shelfLength
```

---

# STEP 5 — Text Position

```pseudo id="jlwm6b"
textPos =
    shelfEnd
    + shelfDir * textGap
```

---

# STEP 6 — Leader Geometry

---

# Angled segment

```pseudo id="jlwm6c"
leader1 =
    LINE(
        dimEnd,
        leaderEnd
    )
```

---

# Horizontal shelf

```pseudo id="jlwm6d"
leader2 =
    LINE(
        leaderEnd,
        shelfEnd
    )
```

---

# 🚀 THIS is classic AutoCAD dog-leg behavior.

---

# 📏 5. Dog-Leg Suppression Rules

---

# If angle nearly horizontal:

```pseudo id="jlwm6e"
IF ABS(dimAngle) < threshold:

    skipShelf()
```

---

# Because shelf unnecessary.

---

# ⚡ 6. Adaptive Shelf Length

---

# Based on text width

```pseudo id="jlwm6f"
shelfLength =
    textWidthWorld
    + margin
```

---

# Production CAD behavior.

---

# 🧩 PART 2 — DIMTAD

# Text Above Dimension Line

---

# 🧠 Purpose

Controls vertical text placement relative to dimension line.

---

# Behavior

| DIMTAD | Result                      |
| ------ | --------------------------- |
| OFF    | text centered in line break |
| ON     | text sits above line        |

---

# Visual

---

# DIMTAD OFF

```text id="jlwm6g"
---- TEXT ----
```

Centered within line.

---

# DIMTAD ON

```text id="jlwm6h"
     TEXT
-------------
```

Text above line.

---

# 🧠 Architectural Insight

DIMTAD affects:

* vertical offset
* line breaking
* shelf positioning

NOT dimension geometry.

---

# 📦 1. Style Variable

```pseudo id="jlwm6i"
DimStyle {

  DIMTAD : boolean
}
```

---

# ⚙️ 2. Main Decision

```pseudo id="jlwm6j"
FUNCTION solveTextVerticalPlacement():

  IF DIMTAD == ON:

      placeAboveDimensionLine()

  ELSE:

      centerInsideLineBreak()
```

---

# 📐 3. DIMTAD OFF

# Text Centered In Break

---

# STEP 1 — Compute Midpoint

```pseudo id="jlwm6k"
mid =
    MID(dimStart, dimEnd)
```

---

# STEP 2 — Text Position

```pseudo id="jlwm6l"
textPos = mid
```

---

# STEP 3 — Break Dimension Line

---

## Text Bounds

```pseudo id="jlwm6m"
bounds =
    computeTextBounds()
```

---

## Split Line

```pseudo id="jlwm6n"
leftSeg =
    LINE(dimStart, bounds.left)

rightSeg =
    LINE(bounds.right, dimEnd)
```

---

# 🚀 Result

Classic centered dimension text.

---

# 📐 4. DIMTAD ON

# Text Above Line

---

# STEP 1 — Midpoint

```pseudo id="jlwm6o"
mid =
    MID(dimStart, dimEnd)
```

---

# STEP 2 — Offset Above Line

---

# Use dimension normal

```pseudo id="jlwm6p"
normal =
    PERP(dimDir)
```

---

# Offset Distance

```pseudo id="jlwm6q"
offset =
    pixelsToWorld(
        style.textGapPx
    )
```

---

# Final Position

```pseudo id="jlwm6r"
textPos =
    mid
    + normal * offset
```

---

# STEP 3 — Dimension Line Behavior

Usually no center break.

---

# Option A

Continuous line:

```text id="jlwm6s"
-------------
    TEXT
```

---

# Option B

Small gap only.

---

# 🚀 AutoCAD often uses small gap.

---

# 📏 5. Combined Behavior

# DIMTOH + DIMTAD

This is where CAD layout gets tricky.

---

# Example

DIMTOH = ON
DIMTAD = ON

---

# Result

```text id="jlwm6t"
      TEXT
      ─────
     /
----/
```

---

# Pipeline

```pseudo id="jlwm6u"
angled leader
    ↓
horizontal shelf
    ↓
text above shelf
```

---

# 🧠 6. Unified Layout Solver

Recommended architecture:

---

# STEP 1

Solve measurement geometry.

---

# STEP 2

Solve outside/inside placement.

---

# STEP 3

Apply DIMTOH.

---

# STEP 4

Apply DIMTAD.

---

# STEP 5

Generate final leader geometry.

---

# 🚀 Correct Production Pipeline

```pseudo id="jlwm6v"
measurement
    ↓
base dim line
    ↓
inside/outside
    ↓
DIMTOH
    ↓
DIMTAD
    ↓
final text layout
```

---

# ⚡ 7. Important Rendering Rule

---

# Geometry layer

Render:

* extension lines
* leader lines

in world-space.

---

# Decoration layer

Render:

* text
* arrows

in screen-space.

---

# 🚀 Critical for zoom stability.

---

# 📏 8. Text Bounds Are Essential

You MUST compute:

```pseudo id="jlwm6w"
text bounding box
```

because:

* dog-leg size depends on text width
* line break depends on text bounds
* collision detection depends on bounds

---

# 🚀 Never fake this.

Use:

```pseudo id="jlwm6x"
measureText()
```

---

# 🧠 9. Final Unified Render Data

```pseudo id="jlwm6y"
RenderData {

  dimensionLines[]

  extensionLines[]

  leaderLines[]

  arrowheads[]

  text

  textPosition

  textRotation
}
```

---

# 🚀 10. Recommended MVP

DO FIRST:

✅ DIMTOH ON/OFF
✅ DIMTAD ON/OFF
✅ dog-leg shelves
✅ text above line

---

THEN:

* collision avoidance
* auto flipping
* annotative scaling
* advanced shelves

---

# 🔚 Final Insight

DIMTOH and DIMTAD reveal an important truth:

```text id="jlwm6z"
CAD dimensions are fundamentally a layout engine,
NOT merely geometry.
```

Professional CAD annotation systems behave closer to:

* UI layout engines
* typography systems
* technical publishing tools

than simple drawing primitives.
