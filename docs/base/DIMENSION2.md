You need to think about dimensions not as “graphics”, but as a **special rendering subsystem**.

In real CAD, dimensions are fundamentally different from ordinary entities because they are:

```text id="g6l8eo"
semi-screen-space + semi-world-space objects
```

That hybrid nature is the hard part.

Your current pseudocode in  is correct mathematically, but production WebCAD needs a deeper rendering architecture.

---

# 🧠 The Core Problem of CAD Dimensions

Normal CAD geometry:

* purely world-space

Dimensions:

* geometry anchored in world-space
* BUT readability anchored in screen-space

Examples:

* arrowheads must stay readable
* text must remain legible
* extension lines stay geometrically correct
* text cannot flip upside-down
* dimensions must survive zoom extremes

---

# 🎯 Correct Mental Model

A dimension is actually:

```text id="30e4vg"
WORLD GEOMETRY
+
SCREEN DECORATION
```

---

# 🧩 Recommended Architecture

---

# 1. Split Dimension Into TWO Layers

## A. World Layer

Stores:

* measured points
* dimension line anchors
* extension anchors

Pure geometry.

---

## B. Screen Decoration Layer

Rendered dynamically:

* arrowheads
* text
* text background mask
* leader offsets

Computed EVERY FRAME or EVERY ZOOM.

---

# 🚀 This is critical.

If you scale dimension geometry directly in world-space:

* text becomes microscopic
* arrows disappear
* dimensions explode at zoom

---

# 🧱 Recommended Dimension Pipeline

```text id="4m3xqa"
Dimension Entity
    ↓
Dimension Solver
    ↓
World Geometry
    ↓
Viewport Projection
    ↓
Screen-space Decoration Builder
    ↓
Three.js Renderer
```

---

# 📄 Correct Internal Data Model

---

# 2. Store Semantic Data, NOT Final Geometry

BAD:

```pseudo id="07v0gw"
store arrow triangles permanently
```

GOOD:

```pseudo id="3spx4q"
Dimension {
  type

  p1
  p2

  offset

  styleId

  userTextOverride?

  computedMeasurement
}
```

Then render dynamically.

---

# 🔥 Why?

Because dimensions are VIEW-DEPENDENT.

---

# 🧠 Major Insight:

# Arrowheads SHOULD NOT exist permanently in model-space

They should be generated during rendering.

---

# 🎯 Production Rendering Strategy

---

# 3. Use Mixed Coordinate Spaces

---

# A. Geometry in World Coordinates

Extension lines:

* world-space

Dimension line:

* world-space

---

# B. Decorations in Screen Coordinates

Arrowheads:

* screen-size constant

Text:

* screen-size constant

Gap:

* pixel-based

---

# 🚀 THIS is how professional CAD works.

---

# 📐 Real Rendering Pipeline

---

# STEP 1 — Solve Dimension Geometry

Compute:

```pseudo id="zq9e95"
e1
e2
dimLine
textAnchor
```

in WORLD coordinates.

---

# STEP 2 — Project To Screen

```pseudo id="z6g4dj"
screenP1 = worldToScreen(e1)
screenP2 = worldToScreen(e2)
```

---

# STEP 3 — Build Decorations in SCREEN SPACE

Arrowheads:

```pseudo id="te9a4h"
arrowSize = 8px
```

not:

```pseudo id="b1dbx3"
0.1 world units
```

---

# STEP 4 — Convert Decoration Back To World

```pseudo id="qnt2e5"
screenArrowVertices
    ↓
screenToWorld()
```

Then render.

---

# 🔥 THIS is the secret.

---

# 🧠 Why AutoCAD Dimensions Feel Stable

Because:

* arrows/text use screen metrics
* geometry uses world metrics

Hybrid system.

---

# ⚡ Three.js-Specific Recommendations

---

# 4. DO NOT Use THREE.TextGeometry

Avoid:

```pseudo id="jlym6v"
THREE.TextGeometry
```

Problems:

* heavy
* slow
* triangulation expensive
* poor zoom behavior

---

# Recommended:

## Use Sprite Text or SDF Text

Examples:

* troika-three-text
* MSDF fonts

---

# Why?

You need:

* zoom stability
* fast redraw
* crisp text

---

# 📏 Best Arrowhead Strategy

---

# 5. Arrowheads Should Be GPU Billboards

Instead of actual world triangles.

---

# Recommended:

```pseudo id="v5y6qx"
renderArrowhead(position, direction, pixelSize)
```

using:

* shader
* sprite
* instancing

---

# Benefits

✅ stable size
✅ fast
✅ zoom-safe
✅ anti-aliased

---

# 🧠 Biggest CAD Dimension Problem:

# Text Placement

This is MUCH harder than geometry.

---

# 6. Text Placement Requires Rules Engine

Not just midpoint.

You need:

---

## Rule 1 — Try Inside

```pseudo id="sqarf0"
IF textWidth < availableSpace:
    place inside
```

---

## Rule 2 — Otherwise Outside

```pseudo id="4xggqi"
place outside with leader
```

---

## Rule 3 — Avoid Arrow Collision

Text cannot overlap arrows.

---

## Rule 4 — Keep Readable Orientation

Never upside down.

```pseudo id="4pgicq"
IF angle > 90:
    rotate += 180
```

---

# 🧱 Dimension Renderer Should Be REACTIVE

---

# 7. Dimensions Must Rebuild When:

```text id="gk7p7r"
- zoom changes
- camera changes
- geometry changes
- style changes
```

---

# ⚡ Recommended Caching Strategy

---

## Cache semantic solve

```pseudo id="r0a2j0"
dimension solved geometry
```

BUT NOT:

* arrow meshes
* text geometry

Those are viewport-dependent.

---

# 🚀 Best Three.js Architecture

---

# 8. Recommended Rendering Layers

---

## Layer A — Persistent CAD Geometry

```pseudo id="6c2itf"
THREE.LineSegments
```

for:

* extension lines
* dim lines

---

## Layer B — Overlay Decorations

```pseudo id="vovr1m"
screen-space overlay scene
```

for:

* arrows
* text
* markers

---

# ⚡ Like game UI overlays.

---

# 🧠 Important Insight:

# Dimensions are closer to UI widgets than geometry.

This changes everything.

---

# 📐 Angular Dimensions Are Special

---

# 9. Angular Dimensions Need Arc Tessellation

DO NOT use:

```pseudo id="44q8va"
THREE.EllipseCurve every frame
```

Instead:

* cached arc polyline
* adaptive tessellation

---

# ⚡ Adaptive Tessellation

More zoom:
→ more segments

---

# 📏 Real CAD Dimension Features You’ll Eventually Need

---

# 10. Hidden Complexity

---

## A. Text masks

Dimension text “cuts” dimension line.

---

## B. Associativity

Move geometry:
→ dimension updates automatically.

---

## C. Dimension styles

```text id="6d7fd4"
ISO
ANSI
Architectural
Mechanical
```

---

## D. Unit formatting

```text id="cl3g0i"
12.500
12.5
12,5
1'-3 1/2"
```

---

# 🚀 Recommended MVP Strategy

DO NOT build everything at once.

---

# Phase 1

✅ world-space dimension lines
✅ screen-space text
✅ screen-space arrows

---

# Phase 2

✅ text fitting
✅ outside placement
✅ leader lines

---

# Phase 3

✅ associative dimensions
✅ masking
✅ styles

---

# 🔥 MOST IMPORTANT RECOMMENDATION

Build dimensions as:

```text id="1pk2mw"
SOLVER + VIEW RENDERER
```

NOT:

```text id="a6t7zv"
static geometry
```

---

# Final Production Architecture

```text id="h4eq8n"
Dimension Entity
    ↓
Geometry Solver
    ↓
Viewport Projection
    ↓
Decoration Layout Engine
    ↓
Renderer
```

That architecture scales cleanly to:

* dimensions
* leaders
* annotations
* tolerances
* GD&T
* multileaders

Which is exactly how professional CAD engines evolve.
