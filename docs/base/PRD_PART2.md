Got it — I’ll extend your existing PRD into a **Part 2 focused on completing 2D creation, editing, and engineering features (AutoCAD 2.6 style)**, aligned with your current roadmap  and **without AutoLISP**.

This is structured so you can **directly execute as engineering tasks**.

---

# 📄 PRD — Part 2

## 2D Creation, Editing & Engineering Features (AutoCAD 2.6 Scope)

---

# 🎯 1. Objective

Complete the **2D drafting capability** of WebCAD to reach:

```text
"Functional parity with AutoCAD 2.6 for drafting + annotation workflows"
```

Focus areas:

* ✏️ Advanced geometry creation
* ✂️ Editing precision tools
* 📐 Engineering annotation (dimensioning)
* 📏 Units & measurement system
* 🔤 Text & annotation (TEXT already exists → extend)

---

# 🧩 2. Feature Domains

---

# 🟢 2.1 Advanced Geometry Creation

## Goal

Expand beyond primitive drawing into structured drafting.

---

## 📌 Features

### 1. POLYLINE ✅

```text
Connected segments (line + arc)
```

### Requirements:

* Vertex-based structure
* Support:

  * straight segments
  * arc segments (bulge optional phase 2)
* Close / open polyline

---

### 2. RECTANGLE ✅

* Defined by:

  * 2 corner points
* Internally = polyline

---

### 3. POLYGON ✅

* Input:

  * number of sides
  * center / edge mode

---

### 4. DONUT ✅

* Inner radius
* Outer radius
* Render as filled ring

---

### 5. ELLIPSE ✅

---

## Deliverable

✔ Structured geometry creation (not just primitives)

---

# 🟡 2.2 Editing & Modification Tools (CORE CAD)

## Goal

Achieve **precision editing behavior**

---

## 📌 Features

### 1. TRIM ✅ (you designed already)

### 2. EXTEND ✅

### 3. OFFSET ✅

### 4. FILLET ✅

```text
Round corner between two objects
```

#### Requirements:

* Input:

  * radius
* Behavior:

  * trim/extend both objects
  * insert arc

---

### 5. CHAMFER ✅

```text
Beveled corner
```

* distance-distance mode

---

### 6. BREAK ✅

```text
Split entity into two
```

---

### 7. JOIN ✅

```text
Merge lines → polyline
```

---

### 8. LENGTHEN ✅

* extend/shrink by:

  * delta
  * percentage

---

### 9. STRETCH ✅

---

## Deliverable

✔ Full drafting editing capability

---

# 🔵 2.3 Annotation System (ENGINEERING CORE)

## Goal

Enable **engineering drawings readability**

---

## 📌 1. TEXT (Already implemented → extend)

Enhance:

* Alignment:

  * Left / Center / Right
* Rotation
* Height control
* Style reference (future)

---

## 📌 2. DIMENSION SYSTEM (CRITICAL)

---

## Types:

### 1. Linear Dimension

```text
Measures distance between two points
```

---

### 2. Aligned Dimension

```text
Follows object angle
```

---

### 3. Angular Dimension

---

### 4. Radius / Diameter

---

## 🧠 Dimension Data Model

```pseudo
Dimension {
  type
  p1
  p2
  textPosition
  value (computed)
  style
}
```

---

## 📐 Rendering Components

Each dimension consists of:

* extension lines
* dimension line
* arrowheads
* text label

---

## 📏 Measurement Logic

```pseudo
value = distance(p1, p2)
display = format(value, units)
```

---

## Deliverable

✔ Usable engineering drawings with dimensions

---

# 🟣 2.4 Units & Measurement System

## Goal

Ensure **engineering correctness**

---

## 📌 Features

### 1. Units Configuration

```pseudo
Units {
  type: "decimal" | "architectural"
  precision: number
  scale: number
}
```

---

### 2. Supported Units (MVP)

* Decimal
* Metric (mm, cm, m)

---

### 3. Formatting Engine

```pseudo
FUNCTION format(value):

  APPLY precision
  APPLY unit scale

  RETURN string
```

---

### 4. Input Parsing Enhancement

Support:

```
10
10.5
100mm
2.5m
```

---

## Deliverable

✔ Consistent measurement system across drawing + dimensions

---

# 🟠 2.5 Annotation Styles (Basic)

## Goal

Standardize visual output

---

## 📌 Features

### Dimension Style (MVP simplified)

```pseudo
DimStyle {
  textHeight
  arrowSize
  offset
}
```

---

### Text Style (basic)

* height
* font (future SHX/TTF)

---

## Deliverable

✔ Consistent annotation visuals

---

# 🔴 2.6 Snapping & Precision (REQUIRED for Engineering)

## Extend existing snap system:

---

## 📌 Add:

* intersection
* perpendicular
* tangent
* nearest

---

## Behavior:

```pseudo
cursor → find closest valid snap → override input point
```

---

## Deliverable

✔ Precision drafting capability

---

# ⚙️ 3. Data Model Extensions

---

## 📦 New Entities

```pseudo
- Polyline
- Dimension
- Text (enhanced)
```

---

## 📦 Entity Properties

```pseudo
Entity {
  id
  type
  layer
  geometry
  style
}
```

---

# 🧠 4. Command Additions

---

## Creation

* POLYLINE
* RECTANG
* POLYGON
* DONUT

---

## Editing

* FILLET
* CHAMFER
* BREAK
* JOIN
* LENGTHEN

---

## Annotation

* DIMLINEAR ✅
* DIMALIGNED ✅
* DIMRADIUS ✅
* DIMDIAMETER ✅
* DIMANGULAR ✅

---

## System

* UNITS

---

# 🧪 5. Acceptance Criteria

---

## Drawing

* Can create closed shapes
* Can edit intersections cleanly

---

## Editing

* TRIM / EXTEND behave correctly
* OFFSET produces valid geometry

---

## Annotation

* Dimensions display correct values
* Text aligns and rotates correctly

---

## Units

* Changing units updates display
* Input parsing respects units

---

# 🚀 6. Implementation Priority

---

## Phase A (Must ship first)

* POLYLINE
* FILLET
* DIMENSION (linear only)
* Units system

---

## Phase B

* CHAMFER
* BREAK / JOIN
* Angular + radius dimensions

---

## Phase C

* Styles
* Advanced snapping

---

# ⚠️ 7. Engineering Risks

---

## 1. Polyline complexity

→ especially arc (bulge) support

---

## 2. Dimension rendering

→ must stay readable at all zoom levels

---

## 3. Offset + Fillet interaction

→ geometry consistency issues

---

# 🧭 Final Positioning

After this PRD Part 2:

```text
WebCAD = Fully usable 2D engineering drafting tool
```

Not just a drawing app.

---

