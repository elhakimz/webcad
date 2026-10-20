# 📄 WebCAD HATCH — Deep CAD-Grade Pseudocode

## For Three.js WebCAD Engine

### AutoCAD 2.x/Classic CAD Style

Target:

* solid hatch
* ANSI/ISO hatch patterns
* associative hatch
* boundary detection
* island detection
* performant rendering

---

# 🧠 1. What HATCH Really Is

Most beginners think:

```text id="0mj4qo"
HATCH = draw many lines
```

Wrong.

Professional CAD hatch is actually:

```text id="gkkfwr"
pattern clipping inside planar topology
```

Meaning:

* detect enclosed regions
* generate infinite pattern
* clip pattern against region
* render efficiently

---

# 🧩 2. Core Architecture

---

# HATCH Pipeline

```text id="hhgr0f"
boundary detection
    ↓
topology solving
    ↓
island detection
    ↓
pattern generation
    ↓
pattern clipping
    ↓
render batching
```

---

# 🚀 IMPORTANT

HATCH is fundamentally:

* geometry problem
* topology problem
* clipping problem

NOT merely drawing lines.

---

# 📦 3. Semantic Data Model

---

# Store Intent, NOT final hatch lines

```pseudo id="jlwm80"
HatchEntity {

  boundaryEntityIds[]

  loops[]

  patternName

  scale

  angle

  origin

  associative

  style

  color
}
```

---

# 🧠 Why?

Because hatch must recompute when:

* boundary changes
* scale changes
* angle changes

---

# ⚙️ 4. Main Command Workflow

---

# User Flow

```text id="jlwm81"
1. select closed region
2. choose pattern
3. choose scale
4. choose angle
5. generate hatch
```

---

# Command

```pseudo id="jlwm82"
COMMAND HATCH:

  loops =
      detectBoundaryLoops()

  pattern =
      choosePattern()

  hatch =
      CREATE_HATCH(
          loops,
          pattern
      )

  BUILD_HATCH(hatch)

  ADD(hatch)
```

---

# 🧠 5. Boundary Detection

This is the hardest part.

---

# Goal

Convert:

* lines
* arcs
* circles
* polylines

into:

```text id="jlwm83"
closed planar loops
```

---

# 🚀 Recommended Architecture

Use graph topology.

---

# 📦 Edge Graph

```pseudo id="jlwm84"
Vertex {
  x
  y
}

Edge {
  start
  end
  entityId
}
```

---

# STEP 1 — Explode Entities Into Edges

---

# Line

```pseudo id="jlwm85"
LINE → one edge
```

---

# Arc

```pseudo id="jlwm86"
ARC → tessellated segments
```

---

# Ellipse

```pseudo id="jlwm87"
ELLIPSE → tessellated polyline
```

---

# Polyline

```pseudo id="jlwm88"
POLYLINE → segment edges
```

---

# 🚀 IMPORTANT

Hatch works best on tessellated planar geometry.

---

# STEP 2 — Snap Vertices

Tolerance merge.

---

```pseudo id="jlwm89"
IF DIST(v1,v2) < epsilon:

    mergeVertices()
```

---

# STEP 3 — Build Connectivity Graph

```pseudo id="jlwm8a"
vertex → connected edges
```

---

# STEP 4 — Find Closed Loops

---

# Loop Walking

```pseudo id="jlwm8b"
FUNCTION findLoops():

  FOR each unused edge:

      walk connected edges

      IF returns to start:
          create loop
```

---

# 🚀 Similar to B-Rep face finding.

---

# 📏 6. Loop Orientation

Critical for islands.

---

# Signed Area

```pseudo id="jlwm8c"
area =
    Σ(x1*y2 - x2*y1)
```

---

# Convention

| Orientation | Meaning     |
| ----------- | ----------- |
| CCW         | outer loop  |
| CW          | island/hole |

---

# 🚀 Same as CAD kernels.

---

# 🧠 7. Island Detection

---

# Example

```text id="jlwm8d"
rectangle
  containing
circle hole
```

---

# Need:

```text id="jlwm8e"
outer boundary
minus islands
```

---

# STEP 1 — Point-In-Polygon

```pseudo id="jlwm8f"
IF loopA inside loopB:
```

---

# STEP 2 — Nesting Tree

Build containment hierarchy.

---

# Example

```text id="jlwm8g"
outer
  └ island
      └ island-in-island
```

---

# STEP 3 — Fill Rules

Usually:

```text id="jlwm8h"
odd-even rule
```

---

# 🚀 Same as SVG fill rules.

---

# 🧩 8. Pattern System

---

# Hatch Pattern Definition

```pseudo id="jlwm8i"
HatchPattern {

  name

  lines[]
}
```

---

# Pattern Line

```pseudo id="jlwm8j"
PatternLine {

  angle

  origin

  offset

  dashPattern[]
}
```

---

# Example ANSI31

```text id="jlwm8k"
45° diagonal lines
```

---

# Definition

```pseudo id="jlwm8l"
PatternLine {

  angle = 45°

  offset = (0,0.125)

  dash = solid
}
```

---

# 🧠 9. Infinite Pattern Generation

This is key.

---

# Hatch patterns are conceptually infinite.

---

# STEP 1 — Compute Boundary Bounds

```pseudo id="jlwm8m"
bbox =
    computeBounds(loop)
```

---

# STEP 2 — Expand Bounds

```pseudo id="jlwm8n"
expanded =
    EXPAND(bbox, margin)
```

---

# STEP 3 — Generate Infinite Parallel Lines

---

# Direction

```pseudo id="jlwm8o"
dir =
    VECTOR_FROM_ANGLE(
        pattern.angle
    )
```

---

# Normal

```pseudo id="jlwm8p"
normal = PERP(dir)
```

---

# STEP 4 — Sweep Lines Across Region

```pseudo id="jlwm8q"
FOR d FROM min TO max STEP spacing:

    lineOrigin =
        pattern.origin
        + normal*d

    createInfiniteLine()
```

---

# 🚀 Generates theoretical infinite hatch.

---

# ✂️ 10. Pattern Clipping

THIS is the actual hatch operation.

---

# Goal

Clip infinite hatch lines against loops.

---

# STEP 1 — Intersect Hatch Line With Boundary

```pseudo id="jlwm8r"
intersections =
    intersectLineWithLoop()
```

---

# STEP 2 — Sort Intersections

```pseudo id="jlwm8s"
sortAlongLine()
```

---

# STEP 3 — Pair Intersections

Using odd-even fill.

---

# Example

```text id="jlwm8t"
enter
exit
enter
exit
```

---

# STEP 4 — Create Visible Segments

```pseudo id="jlwm8u"
FOR each pair:

    createSegment(
        enter,
        exit
    )
```

---

# 🚀 THIS is actual hatch rendering.

---

# 📏 11. Dashed Hatch Patterns

---

# Example

```text id="jlwm8v"
--- --- ---
```

---

# Pattern Segmenting

```pseudo id="jlwm8w"
applyDashPattern()
```

---

# Similar to linetype engine.

---

# 🧠 12. Solid Hatch

Much easier.

---

# Triangulate Loops

```pseudo id="jlwm8x"
triangles =
    triangulatePolygon(
        loops
    )
```

---

# Render Filled Mesh

```pseudo id="jlwm8y"
THREE.Mesh
```

---

# 🚀 Recommended:

Earcut triangulation.

---

# ⚡ 13. Associative Hatch

Critical CAD feature.

---

# Store References

```pseudo id="jlwm8z"
boundaryEntityIds[]
```

---

# On Geometry Change

```pseudo id="jlwm90"
rebuildHatch()
```

---

# Same as AutoCAD associative hatch.

---

# 🧠 14. Performance Strategy

HATCH can become EXTREMELY heavy.

---

# 🚀 Recommended:

Cache generated hatch segments.

---

# Cache

```pseudo id="jlwm91"
cachedSegments[]
```

---

# Rebuild only when:

* boundary changes
* scale changes
* angle changes

---

# 🚀 NOT every frame.

---

# 📏 15. Three.js Rendering Strategy

---

# Render Hatch Using

```pseudo id="jlwm92"
THREE.LineSegments
```

---

# NOT thousands of individual lines.

---

# Batch Geometry

```pseudo id="jlwm93"
BufferGeometry
```

---

# 🚀 Essential for performance.

---

# 🧠 16. Important CAD Problems

---

# A. Tiny Gaps

Need tolerance merging.

---

# B. Self-Intersecting Loops

Need robust topology validation.

---

# C. Large Drawings

Need chunked hatch generation.

---

# D. Huge Hatch Density

Need adaptive pattern skipping.

---

# Example

At far zoom:

```text id="jlwm94"
skip tiny hatch lines
```

---

# ⚡ 17. Adaptive Rendering

---

# If hatch density too high:

```pseudo id="jlwm95"
simplifyPattern()
```

---

# Prevent GPU overload.

---

# 📦 18. Final Render Data

```pseudo id="jlwm96"
HatchRenderData {

  clippedSegments[]

  triangles[]

  patternName

  scale

  angle
}
```

---

# 🧠 19. Recommended MVP Strategy

---

# Phase 1

✅ polyline closed loops
✅ ANSI31
✅ simple clipping
✅ no islands

---

# Phase 2

✅ islands
✅ associative hatch
✅ multiple patterns

---

# Phase 3

✅ spline boundaries
✅ gradient hatch
✅ adaptive density

---

# 🚀 20. Recommended Hatch Engine Architecture

```text id="jlwm97"
Entity Geometry
    ↓
Topology Builder
    ↓
Loop Detector
    ↓
Island Solver
    ↓
Pattern Generator
    ↓
Line Clipper
    ↓
GPU Batch Renderer
```

---

# 🔥 21. Most Important Insight

Professional HATCH systems are actually:

```text id="jlwm98"
2D computational geometry engines
```

NOT merely graphics features.

That’s why CAD hatch implementation becomes surprisingly advanced very quickly.
