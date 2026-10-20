Here’s a clean **Markdown document** defining **AutoCAD 2.18 `SHAPE` and `SKETCH` commands** in **pseudocode**, adapted for a **WebCAD (Three.js)** context.

---

# 📄 AutoCAD 2.18 Command Reference (Pseudocode)

## Commands: `SHAPE`, `SKETCH`

### Target: WebCAD (Three.js Implementation)

---

# 🧩 SHAPE Command

## 📌 Description

Inserts a predefined vector shape from a compiled shape file (`.shx`) at a given point, with scale and rotation.

---

## 🧠 Conceptual Model

* Shape = reusable vector symbol
* Stored in `.shx` → parsed into vector primitives
* Rendered as line segments or meshes in Three.js

---

## 🔧 Inputs

```
- shapeName: string
- insertionPoint: (x, y)
- scale: float
- rotation: degrees
```

---

## 🧪 Pseudocode

```pseudo
COMMAND SHAPE:

  PROMPT "Enter shape name:"
  shapeName ← USER_INPUT()

  IF NOT shapeLibrary.contains(shapeName) THEN
      ERROR "Shape not found"
      EXIT
  ENDIF

  PROMPT "Specify insertion point:"
  insertionPoint ← GET_POINT()

  PROMPT "Specify scale <1.0>:"
  scale ← GET_INPUT_OR_DEFAULT(1.0)

  PROMPT "Specify rotation angle <0>:"
  rotation ← GET_INPUT_OR_DEFAULT(0)

  shapeData ← shapeLibrary.get(shapeName)

  transformedGeometry ← []

  FOR EACH primitive IN shapeData:
      geom ← TRANSFORM(
          primitive,
          scale,
          rotation,
          insertionPoint
      )
      transformedGeometry.ADD(geom)
  ENDFOR

  DRAW(transformedGeometry)
  ADD_TO_SCENE(transformedGeometry)
```

---

## 🔄 Transformation Function

```pseudo
FUNCTION TRANSFORM(primitive, scale, rotation, translation):

  scaled ← SCALE(primitive, scale)

  rotated ← ROTATE(scaled, rotation)

  translated ← TRANSLATE(rotated, translation)

  RETURN translated
```

---

## 🧱 Three.js Mapping

```pseudo
- Lines → THREE.Line
- Polylines → THREE.BufferGeometry
- Transform → Object3D matrix transforms
```

---

---

# ✏️ SKETCH Command

## 📌 Description

Creates freehand drawing by capturing continuous cursor movement and converting it into line segments.

---

## 🧠 Conceptual Model

* Continuous input stream (mouse/touch)
* Points sampled over time
* Converted into polyline

---

## 🔧 Inputs

```
- tolerance: float (minimum distance between points)
- continuous input (mouse drag)
```

---

## 🧪 Pseudocode

```pseudo
COMMAND SKETCH:

  PROMPT "Specify sketch tolerance <default>:"
  tolerance ← GET_INPUT_OR_DEFAULT(2.0)

  PROMPT "Press and drag to sketch. Release to finish."

  points ← EMPTY_LIST
  isDrawing ← FALSE

  ON_MOUSE_DOWN(event):
      isDrawing ← TRUE
      startPoint ← GET_CURSOR_POSITION(event)
      points.ADD(startPoint)

  ON_MOUSE_MOVE(event):
      IF NOT isDrawing THEN RETURN

      currentPoint ← GET_CURSOR_POSITION(event)

      lastPoint ← points.LAST()

      IF DISTANCE(currentPoint, lastPoint) >= tolerance THEN
          points.ADD(currentPoint)
      ENDIF

  ON_MOUSE_UP(event):
      isDrawing ← FALSE

      IF points.LENGTH < 2 THEN
          EXIT
      ENDIF

      polyline ← CREATE_POLYLINE(points)

      DRAW(polyline)
      ADD_TO_SCENE(polyline)
```

---

## 📏 Distance Function

```pseudo
FUNCTION DISTANCE(p1, p2):
  RETURN sqrt((p2.x - p1.x)^2 + (p2.y - p1.y)^2)
```

---

## 🧱 Three.js Mapping

```pseudo
points → THREE.Vector3[]
geometry → THREE.BufferGeometry().setFromPoints(points)
line → THREE.Line(geometry, material)
```

---

## ⚡ Optional Enhancements

### 1. Smoothing (Bezier / Catmull-Rom)

```pseudo
smoothedCurve ← CATMULL_ROM_SPLINE(points)
```

---

### 2. Pressure Sensitivity (if stylus)

```pseudo
lineWidth ← MAP_PRESSURE_TO_WIDTH(pressure)
```

---

### 3. Real-time Rendering

```pseudo
ON_MOUSE_MOVE:
  UPDATE_GEOMETRY(points)
```

---

# 🧠 Architecture Notes for WebCAD

## Suggested Modules

```pseudo
- InputHandler (mouse/touch)
- GeometryBuilder
- TransformEngine
- ShapeLibrary (.shx parser)
- SceneManager (Three.js)
```

---

## Shape Library Format (Simplified)

```pseudo
shapeLibrary = {
  "CIRCLE_MARK": [
      LINE(x1,y1,x2,y2),
      ARC(cx,cy,r,start,end)
  ],
  ...
}
```

---

# 🚀 Summary

| Command | Type     | Behavior                   |
| ------- | -------- | -------------------------- |
| SHAPE   | Insert   | Place predefined geometry  |
| SKETCH  | Freehand | Capture continuous drawing |


