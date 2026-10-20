Here’s a **clean Markdown spec with pseudocode** for implementing **AutoCAD 2.x DISPLAY commands** in your **WebCAD (Three.js)** engine.

I’ll structure it so it maps directly to a **camera + scene architecture**.

---

# 📄 WebCAD DISPLAY Commands (AutoCAD 2.x Style)

## Commands: `DISPLAY`, `ZOOM`, `PAN`, `VIEW`, `REGEN`

### Target: Three.js WebCAD

---

# 🧩 Overview

`DISPLAY` is a **meta-command group** controlling the viewing window:

```text
DISPLAY:
  ├── ZOOM   (scale view)
  ├── PAN    (move view)
  ├── VIEW   (preset camera views)
  └── REGEN  (rebuild scene)
```

---

# 🧠 Core Architecture

## Camera Model (2D CAD)

```pseudo
CameraState:
  center: (x, y)
  zoom: float
  rotation: float
  viewportWidth
  viewportHeight
```

---

## World → Screen Transform

```pseudo
FUNCTION worldToScreen(point, camera):

  x ← (point.x - camera.center.x) * camera.zoom
  y ← (point.y - camera.center.y) * camera.zoom

  RETURN (x, y)
```

---

---

# 🔍 ZOOM Command

## 📌 Description

Changes magnification of the drawing.

---

## 🔧 Inputs

```text
- factor (e.g. 2x, 0.5x)
- window (2 points)
- extents
- center + scale
```

---

## 🧪 Pseudocode

```pseudo
COMMAND ZOOM:

  PROMPT "Specify zoom option (factor/window/extents):"
  mode ← USER_INPUT()

  SWITCH mode:

    CASE "factor":
        PROMPT "Enter zoom factor:"
        factor ← USER_INPUT()

        camera.zoom ← camera.zoom * factor

    CASE "window":
        PROMPT "Specify first corner:"
        p1 ← GET_POINT()

        PROMPT "Specify opposite corner:"
        p2 ← GET_POINT()

        center ← MIDPOINT(p1, p2)

        width ← ABS(p2.x - p1.x)
        height ← ABS(p2.y - p1.y)

        scaleX ← viewportWidth / width
        scaleY ← viewportHeight / height

        camera.zoom ← MIN(scaleX, scaleY)
        camera.center ← center

    CASE "extents":
        bounds ← COMPUTE_SCENE_BOUNDS()

        center ← bounds.center
        width ← bounds.width
        height ← bounds.height

        camera.zoom ← FIT_TO_VIEW(width, height)
        camera.center ← center

  UPDATE_CAMERA()
```

---

---

# ✋ PAN Command

## 📌 Description

Moves the view without changing zoom.

---

## 🧪 Pseudocode

```pseudo
COMMAND PAN:

  PROMPT "Click and drag to pan"

  isDragging ← FALSE

  ON_MOUSE_DOWN(event):
      isDragging ← TRUE
      start ← GET_CURSOR_POSITION(event)
      startCenter ← camera.center

  ON_MOUSE_MOVE(event):
      IF NOT isDragging THEN RETURN

      current ← GET_CURSOR_POSITION(event)

      delta ← (current - start) / camera.zoom

      camera.center ← startCenter - delta

      UPDATE_CAMERA()

  ON_MOUSE_UP(event):
      isDragging ← FALSE
```

---

---

# 🎥 VIEW Command

## 📌 Description

Sets predefined or named views.

---

## Supported Views (2D + optional 3D)

```text
TOP, LEFT, RIGHT, FRONT, BACK, ISO
```

---

## 🧪 Pseudocode

```pseudo
COMMAND VIEW:

  PROMPT "Enter view name:"
  viewName ← USER_INPUT()

  SWITCH viewName:

    CASE "TOP":
        camera.rotation ← 0

    CASE "LEFT":
        camera.rotation ← 90°

    CASE "RIGHT":
        camera.rotation ← -90°

    CASE "ISO":
        camera.rotation ← 45°
        SET_ISOMETRIC_MODE()

  UPDATE_CAMERA()
```

---

## Named Views

```pseudo
FUNCTION saveView(name):
  viewStore[name] ← COPY(camera)

FUNCTION restoreView(name):
  camera ← COPY(viewStore[name])
  UPDATE_CAMERA()
```

---

---

# 🔄 REGEN Command

## 📌 Description

Rebuilds the display list (important in old AutoCAD due to limited graphics memory).

In WebCAD → forces **geometry + spatial rebuild**

---

## 🧪 Pseudocode

```pseudo
COMMAND REGEN:

  CLEAR_RENDER_CACHE()

  visibleEntities ← []

  FOR EACH entity IN sceneDatabase:

      IF IS_VISIBLE(entity, camera) THEN
          visibleEntities.ADD(entity)

  SORT_BY_DRAW_ORDER(visibleEntities)

  REBUILD_GEOMETRY(visibleEntities)

  RENDER_SCENE()
```

---

## Visibility Check

```pseudo
FUNCTION IS_VISIBLE(entity, camera):

  bounds ← entity.boundingBox

  viewBounds ← GET_VIEW_BOUNDS(camera)

  RETURN INTERSECTS(bounds, viewBounds)
```

---

---

# 🧱 Three.js Implementation Mapping

## Camera Setup (Orthographic)

```pseudo
camera = new THREE.OrthographicCamera(
  left, right, top, bottom, near, far
)
```

---

## Update Camera

```pseudo
FUNCTION UPDATE_CAMERA():

  camera.left   ← -viewportWidth / 2 / zoom
  camera.right  ←  viewportWidth / 2 / zoom
  camera.top    ←  viewportHeight / 2 / zoom
  camera.bottom ← -viewportHeight / 2 / zoom

  camera.position ← (center.x, center.y, Z)

  camera.updateProjectionMatrix()
```

---

---

# ⚡ Performance Optimizations

## 1. Dirty Flag System

```pseudo
IF cameraChanged OR sceneChanged THEN
    RENDER()
```

---

## 2. Spatial Index (Huge for CAD)

```pseudo
Use:
- Quadtree (2D)
- BVH (advanced)
```

---

## 3. Incremental REGEN

```pseudo
Only rebuild changed entities
```

---

## 4. Level of Detail (LOD)

```pseudo
IF zoom < threshold:
    SIMPLIFY_GEOMETRY()
```

---

---

# 🧠 Command Integration Layer

```pseudo
COMMAND_DISPATCHER:

  "ZOOM"  → zoomCommand()
  "PAN"   → panCommand()
  "VIEW"  → viewCommand()
  "REGEN" → regenCommand()
```

---

---

# 🚀 Summary

| Command | Function      |
| ------- | ------------- |
| ZOOM    | Scale view    |
| PAN     | Move camera   |
| VIEW    | Preset views  |
| REGEN   | Rebuild scene |

---


