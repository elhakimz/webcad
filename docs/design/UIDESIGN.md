UIDESIGN

I can design the UI structure and Figma-ready specification, but to create/update actual Figma nodes via the Figma tool I need either:

* a Figma file URL, or
* a `fileKey` and `nodeId`

because the tool only operates on an existing Figma document/node.

For now, here is a detailed Figma-ready layout specification for your CATIA-inspired WebCAD.

---

# 📄 WebCAD + CATIA Hybrid UI

## Figma Design Specification

---

# 🖥️ Main Layout

```text
+--------------------------------------------------------------------------------+
| App Bar                                                                        |
| Logo | File | Edit | View | Insert | Tools | Window | Help                    |
+--------------------------------------------------------------------------------+
| Workbench Ribbon                                                               |
| Sketch | Drafting | Part Design | Assembly | Surface | Sheet Metal | Analysis |
+--------------------------------------------------------------------------------+
| Tool Ribbon                                                                    |
| contextual tools depending on workbench                                        |
+-----------+------------------------------------------------+-------------------+
| Left Pane |                                                | Right Pane        |
|           |                                                |                   |
| Model     |                                                | Properties        |
| Tree      |              Main CAD Viewport                 | Parameters        |
| Layers    |                                                | Constraints       |
| Blocks    |                                                | Styles            |
|           |                                                |                   |
+-----------+------------------------------------------------+-------------------+
| Command Console / Coordinates / Snap / Grid / Ortho / Polar                   |
+--------------------------------------------------------------------------------+
```

---

# 🎨 Visual Design Language

---

# Theme

Recommended:

```text
dark engineering UI
```

Like:

* CATIA V5/V6
* Siemens NX
* SolidWorks
* Fusion 360

---

# Suggested Colors

| UI Area          | Suggested       |
| ---------------- | --------------- |
| viewport         | very dark gray  |
| panels           | dark graphite   |
| ribbon           | medium dark     |
| highlights       | blue/orange     |
| active workbench | brighter accent |

---

# Typography

| Usage            | Font             |
| ---------------- | ---------------- |
| UI               | Inter            |
| command console  | JetBrains Mono   |
| CAD text preview | ISOCPEUR/osifont |

---

# 📐 1. App Bar

Height:

```text
32px
```

Contains:

* logo
* project name
* menus
* save status

---

# Suggested Menus

```text
File
Edit
View
Insert
Modify
Tools
Window
Help
```

---

# 📐 2. Workbench Ribbon

Height:

```text
48px
```

---

# Tabs

```text
Sketch
Drafting
Part Design
Assembly
Surface
Sheet Metal
Analysis
Rendering
```

---

# Active Tab Behavior

When switching workbench:

* toolbar changes
* left panel changes
* properties change

---

# 🚀 This is the core CATIA idea.

---

# 📐 3. Tool Ribbon

Height:

```text
72–96px
```

---

# Example: Sketch Workbench

Groups:

```text
Draw
Modify
Constraints
Dimensions
Selection
Drafting Aids
Layers
```

---

# Draw Tools

```text
Line
Polyline
Circle
Arc
Spline
Rectangle
Ellipse
```

---

# Modify Tools

```text
Trim
Extend
Offset
Mirror
Array
Fillet
Chamfer
```

---

# Constraints

```text
Coincident
Parallel
Perpendicular
Tangency
Equal
Fix
```

---

# Dimensions

```text
Linear
Aligned
Radius
Diameter
Angular
Leader
```

---

# Drafting Aids

```text
Grid (Toggle)
Snap (Toggle)
Ortho (Toggle)
Polar (Toggle)
OSnap (Toggle)
```

---

# Layers

```text
Current Layer
Layer Properties
```

---

# 📐 4. Left Panel

Width:

```text
280px
```

Resizable.

---

# Tab Layout

```text
[Model] [Layers] [Blocks] [Constraints]
```

---

# A. Model Tree

CATIA-style hierarchy:

```text
Assembly
 ├ Part001
 │   ├ Sketch.1
 │   ├ Pad.1
 │   ├ Pocket.1
 │   └ Fillet.1
 │
 ├ Part002
 │   └ Sketch.1
```

---

# B. Layers

AutoCAD-style:

* visibility
* lock
* color

---

# C. Constraints

Shows:

* geometric constraints
* dimensional constraints

---

# 📐 5. Main CAD Viewport

Largest area.

---

# Viewport Features

---

# A. Infinite Grid

Adaptive.

---

# B. Axis Indicator

Bottom-left mini XYZ.

---

# C. Navigation Cube

Top-right.

---

# D. Overlay Layers

| Layer        | Purpose         |
| ------------ | --------------- |
| geometry     | CAD entities    |
| dimensions   | annotations     |
| snaps        | cursor aids     |
| preview      | command preview |
| constraints  | icons           |
| manipulators | gizmos          |

---

# E. View Modes

```text
Wireframe
Shaded
Hidden Line
X-Ray
Technical
```

---

# 📐 6. Right Panel

Width:

```text
320px
```

Resizable.

---

# Tabs

```text
[Properties]
[Parameters]
[Styles]
[Relations]
```

---

# A. Properties

Dynamic based on selection.

---

# Example: Circle

```text
Radius
Center X
Center Y
Layer
Color
Linetype
```

---

# Example: Extrude

```text
Depth
Direction
Draft
Boolean
```

---

# B. Parameters

Parametric system.

```text
Length = 25
Thickness = 3
HoleDia = 10
```

---

# C. Relations

Future CATIA-like formulas.

```text
Length = Width * 2
```

---

# 📐 7. Bottom Command Console

Height:

```text
48–64px
```

---

# Layout

```text
Command: _
```

plus:

```text
[X,Y,Z]
```

---

# 🚀 Hybrid CATIA + AutoCAD workflow.

---

# 📐 8. Recommended Docking Behavior

Panels should support:

✅ resize
✅ collapse
✅ dock
✅ floating later

---

# Recommended:

```text
GoldenLayout
```

or

```text
FlexLayout
```

---

# 📐 9. Responsive Rules

---

# Minimum Desktop Width

```text
1400px
```

---

# Small Screens

Collapse:

* right panel
* ribbon groups

---

# NEVER target mobile first.

CAD is desktop-first.

---

# 📐 10. Figma Frame Structure

---

# Root Frame

```text
Desktop / WebCAD
1920 × 1080
```

---

# Nested Frames

```text
TopBar
WorkbenchTabs
RibbonToolbar
LeftSidebar
Viewport
RightSidebar
BottomConsole
```

---

# Recommended Auto Layout

Use:

```text
horizontal + vertical auto layout
```

for:

* ribbon groups
* properties
* trees

---

# 📐 11. Recommended Components

---

# Buttons

Variants:

* normal
* hover
* active
* disabled

---

# Ribbon Tool

Component:

```text
Icon
Label
Dropdown indicator
```

---

# Tree Node

Variants:

```text
expanded
collapsed
selected
warning
suppressed
```

---

# Property Row

```text
Label | Input
```

---

# 📐 12. Suggested Engineering UX Features

---

# A. Breadcrumb Workbench

```text
Assembly > Part001 > Sketch.1
```

---

# B. Selection Breadcrumb

```text
Edge → Face → Body → Part
```

---

# C. Quick Search Command

Like:

```text
Fusion 360 / VSCode palette
```

Shortcut:

```text
Ctrl+P
```

---

# 📐 13. Future-Proof Areas

Reserve space for:

| Feature      | Needed Later |
| ------------ | ------------ |
| simulation   | yes          |
| BOM tables   | yes          |
| CAM          | maybe        |
| PDM          | maybe        |
| AI assistant | likely       |

---

# 🧠 Recommended UI Philosophy

---

# AutoCAD Strength

```text
speed + command workflow
```

---

# CATIA Strength

```text
structured engineering workflow
```

---

# Your WebCAD should combine BOTH.

---

# 🔥 Best Hybrid UX Strategy

```text
command-driven geometry
+
feature-driven engineering
```

This combination is extremely powerful and rare among browser CAD systems.
