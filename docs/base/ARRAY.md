Here’s a **clean, implementation-ready pseudocode** for the **ARRAY command (AutoCAD 2.x–style)** adapted to your **WebCAD (Three.js + AutoLISP bridge)**.

We’ll cover:

* Rectangular Array (MVP)
* Polar Array
* Entity cloning + transforms
* AutoLISP `(command "ARRAY" ...)` integration

---

# 📄 ARRAY Command (2D) — Pseudocode

---

# 🧩 1. Concept

```text
Duplicate selected objects in a pattern:
- Rectangular (grid)
- Polar (circular)
```

---

# 🧠 2. Modes

| Mode        | Description         |
| ----------- | ------------------- |
| RECTANGULAR | rows × columns grid |
| POLAR       | around center point |

---

# ⚙️ 3. High-Level Flow

```pseudo
COMMAND ARRAY:

  selection ← USER_SELECT_MULTIPLE()

  PROMPT "Rectangular or Polar? (R/P):"
  mode ← USER_INPUT()

  IF mode == "R":
      result ← ARRAY_RECTANGULAR(selection)

  ELSE IF mode == "P":
      result ← ARRAY_POLAR(selection)

  ADD_TO_DRAWING(result)
```

---

# 🔲 4. RECTANGULAR ARRAY

---

## 📌 Inputs

```pseudo
rows
cols
dx (column spacing)
dy (row spacing)
```

---

## 🧪 Pseudocode

```pseudo
FUNCTION ARRAY_RECTANGULAR(entities):

  rows ← GET_INT("Number of rows:")
  cols ← GET_INT("Number of columns:")

  dx ← GET_REAL("Column spacing:")
  dy ← GET_REAL("Row spacing:")

  result ← []

  FOR r FROM 0 TO rows-1:
    FOR c FROM 0 TO cols-1:

      IF r == 0 AND c == 0:
          CONTINUE  // original already exists

      offset ← (c * dx, r * dy)

      FOR each entity IN entities:

          clone ← CLONE_ENTITY(entity)

          TRANSFORM(clone, TRANSLATE(offset))

          result.ADD(clone)

  RETURN result
```

---

# 🌀 5. POLAR ARRAY

---

## 📌 Inputs

```pseudo
center point
number of items
angle to fill (default 360°)
rotate objects? (yes/no)
```

---

## 🧪 Pseudocode

```pseudo
FUNCTION ARRAY_POLAR(entities):

  center ← GET_POINT("Center point:")

  count ← GET_INT("Number of items:")

  totalAngle ← GET_REAL("Angle to fill <360>:") DEFAULT 360

  rotate ← GET_BOOL("Rotate objects? (Y/N):")

  stepAngle ← totalAngle / count

  result ← []

  FOR i FROM 1 TO count-1:

      angle ← i * stepAngle

      FOR entity IN entities:

          clone ← CLONE_ENTITY(entity)

          // Move relative to center
          TRANSFORM(clone,
              TRANSLATE(-center)
          )

          // Rotate
          TRANSFORM(clone,
              ROTATE(angle)
          )

          // Move back
          TRANSFORM(clone,
              TRANSLATE(center)
          )

          IF rotate == TRUE:
              APPLY_ENTITY_ROTATION(clone, angle)

          result.ADD(clone)

  RETURN result
```

---

# 🧱 6. Entity Clone

```pseudo
FUNCTION CLONE_ENTITY(entity):

  clone ← DEEP_COPY(entity)

  clone.id ← NEW_ID()

  RETURN clone
```

---

# 🔄 7. Transform Engine

```pseudo
FUNCTION TRANSFORM(entity, transform):

  SWITCH entity.type:

    CASE LINE:
        entity.start ← APPLY(transform, entity.start)
        entity.end   ← APPLY(transform, entity.end)

    CASE CIRCLE:
        entity.center ← APPLY(transform, entity.center)

    CASE ARC:
        entity.center ← APPLY(transform, entity.center)
        entity.startAngle += transform.rotation
        entity.endAngle   += transform.rotation

    CASE TEXT:
        entity.position ← APPLY(transform, entity.position)
```

---

# 🎯 8. Matrix-based Transform (recommended)

```pseudo
FUNCTION APPLY(transform, point):

  RETURN MATRIX_MULTIPLY(transform.matrix, point)
```

---

# ⚡ 9. Performance Optimization

### Use Instancing (important for large arrays)

```pseudo
IF entityCount * arraySize > threshold:
    USE THREE.InstancedMesh
```

---

# 🔁 10. Undo Integration

```pseudo
BEGIN_UNDO()

ADD all clones

END_UNDO()
```

---

# 🧪 11. AutoLISP Integration

## Example (Rectangular)

```lisp
(command "ARRAY" sel "" "R" 3 4 100 50)
```

## Example (Polar)

```lisp
(command "ARRAY" sel "" "P" '(0 0) 6 360 "Y")
```

---

## 🧪 Bridge Implementation

```pseudo
FUNCTION lisp_command_ARRAY(args):

  selection ← args[0]
  mode ← args[2]

  IF mode == "R":
      rows ← args[3]
      cols ← args[4]
      dx   ← args[5]
      dy   ← args[6]

      RETURN ARRAY_RECTANGULAR(selection)

  ELSE IF mode == "P":
      center ← args[3]
      count  ← args[4]
      angle  ← args[5]
      rotate ← args[6]

      RETURN ARRAY_POLAR(selection)
```

---

# ⚠️ 12. Edge Cases

### ❗ count = 1

→ no array

### ❗ zero spacing

→ overlapping entities

### ❗ negative spacing

→ reverse direction

---

# 🚀 13. MVP Scope

✅ Rectangular array
✅ Polar array
✅ LINE / CIRCLE / ARC / TEXT

❌ Associative arrays (modern AutoCAD)
❌ Path arrays

