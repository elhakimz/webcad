Below is a **practical Markdown spec + pseudocode** for building a **`.SHP` / `.SHX` parser** tailored for your **WebCAD (Three.js)** engine.

I’ll keep it grounded in how AutoCAD shapes actually behave, but simplified enough to implement.

---

# 📄 SHP / SHX Parser Design (WebCAD / Three.js)

---

# 🧩 Overview

| Format | Type   | Purpose                           |
| ------ | ------ | --------------------------------- |
| `.SHP` | ASCII  | Human-readable shape definitions  |
| `.SHX` | Binary | Compiled version for fast loading |

👉 Recommended strategy:

* Start with **`.SHP` parser**
* Then build `.SHX` compiler or partial reader later

---

# 🧠 SHAPE Concept Model

A **shape** is:

```text
Shape = sequence of vector drawing instructions
```

Each instruction is like a tiny "pen plotter command".

---

# 📦 Internal Representation

```pseudo
Shape {
  name: string
  commands: Command[]
}

Command {
  type: ENUM
  params: number[]
}
```

---

# 🧾 SHP File Structure

## Example `.SHP`

```text
*1,BOX
0,0
1,0
1,1
0,1
0,0

*2,TRIANGLE
0,0
1,0
0.5,1
0,0
```

---

## Realistic AutoCAD-style `.SHP`

```text
*10,MYSHAPE
2,0,0
1,10,0
1,0,10
1,-10,0
1,0,-10
0
```

---

## Syntax Rules

```text
*<shapeNumber>,<shapeName>
<command>,<param1>,<param2>,...
...
0   ← end of shape
```

---

# 🔧 SHP Parser

## 🧪 Pseudocode

```pseudo
FUNCTION parseSHP(text):

  lines ← SPLIT_LINES(text)

  shapes ← EMPTY_MAP
  currentShape ← NULL

  FOR EACH line IN lines:

      line ← TRIM(line)

      IF line IS EMPTY THEN CONTINUE

      IF line STARTS_WITH "*" THEN
          parts ← SPLIT(line, ",")

          shapeId ← parts[0].SUBSTRING(1)
          shapeName ← parts[1]

          currentShape ← NEW Shape(shapeName)
          shapes[shapeName] ← currentShape

          CONTINUE
      ENDIF

      IF currentShape IS NULL THEN CONTINUE

      tokens ← SPLIT(line, ",")

      cmdType ← TO_INT(tokens[0])

      IF cmdType == 0 THEN
          currentShape ← NULL
          CONTINUE
      ENDIF

      params ← MAP(tokens[1:], TO_NUMBER)

      command ← NEW Command(cmdType, params)

      currentShape.commands.ADD(command)

  ENDFOR

  RETURN shapes
```

---

# 🎯 SHP Command Semantics

| Code | Meaning | Behavior              |
| ---- | ------- | --------------------- |
| 0    | END     | End shape             |
| 1    | LINE    | Draw relative line    |
| 2    | MOVE    | Move cursor (no draw) |
| 3    | ARC     | Arc segment           |
| 4    | SCALE   | Scale change          |
| 5    | ROTATE  | Rotate                |

---

## 🧪 Command Execution

```pseudo
FUNCTION executeShape(shape, insertionPoint):

  cursor ← (0,0)
  geometry ← []

  FOR EACH cmd IN shape.commands:

      SWITCH cmd.type:

          CASE 1:  // LINE
              dx ← cmd.params[0]
              dy ← cmd.params[1]

              newPoint ← cursor + (dx, dy)

              geometry.ADD(LINE(cursor, newPoint))

              cursor ← newPoint

          CASE 2:  // MOVE
              dx ← cmd.params[0]
              dy ← cmd.params[1]

              cursor ← cursor + (dx, dy)

          CASE 3:  // ARC (simplified)
              radius ← cmd.params[0]
              angle ← cmd.params[1]

              arcGeom ← CREATE_ARC(cursor, radius, angle)

              geometry.ADD(arcGeom)

          CASE 5:  // ROTATE
              APPLY_ROTATION(cmd.params[0])

  ENDFOR

  RETURN TRANSFORM_TO_WORLD(geometry, insertionPoint)
```

---

# 🔵 Three.js Conversion

```pseudo
FUNCTION toThreeGeometry(geometry):

  points ← []

  FOR EACH segment IN geometry:
      points.ADD(segment.start)
      points.ADD(segment.end)

  buffer ← new THREE.BufferGeometry().setFromPoints(points)

  line ← new THREE.Line(buffer, material)

  RETURN line
```

---

# ⚙️ SHX Binary Format (Simplified)

⚠️ Real `.SHX` is complex, but here’s a **usable reverse-engineering model**.

---

## Structure (Conceptual)

```text
HEADER
SHAPE TABLE (index)
BINARY COMMAND STREAM
```

---

## Simplified Reader Strategy

```pseudo
FUNCTION parseSHX(buffer):

  reader ← BinaryReader(buffer)

  header ← reader.readHeader()

  shapes ← {}

  FOR EACH entry IN header.shapeIndex:

      reader.seek(entry.offset)

      shape ← NEW Shape(entry.name)

      WHILE TRUE:

          opcode ← reader.readByte()

          IF opcode == 0 THEN BREAK

          params ← readParams(opcode, reader)

          shape.commands.ADD(Command(opcode, params))

      ENDWHILE

      shapes[shape.name] ← shape

  ENDFOR

  RETURN shapes
```

---

## Binary Reader

```pseudo
CLASS BinaryReader:

  buffer
  offset

  FUNCTION readByte():
      value ← buffer[offset]
      offset += 1
      RETURN value

  FUNCTION readInt16():
      value ← ...
      offset += 2
      RETURN value
```

---

# ⚡ Optimization Tips (Important for WebCAD)

### 1. Cache parsed shapes

```pseudo
shapeCache[name] = parsedShape
```

---

### 2. Precompile to BufferGeometry

```pseudo
shape.mesh = prebuiltThreeObject
```

---

### 3. Use instancing (huge performance gain)

```pseudo
THREE.InstancedMesh
```

---

# 🚀 Recommended Development Path

### Phase 1 (MVP)

* ✅ SHP parser
* ✅ LINE + MOVE only
* ✅ Render in Three.js

### Phase 2

* ARC support
* Transform stack (scale/rotate)

### Phase 3

* SHX partial support
* Binary loader

### Phase 4 (Advanced)

* Full AutoCAD opcode coverage
* Shape font rendering

---

# 🧠 Bonus: Shape → Hatch Reuse

Shapes can be reused for:

* Hatch patterns
* Symbols
* Fonts (AutoCAD SHX text)

---

# 🧾 Minimal Example Output

```json
{
  "BOX": {
    "commands": [
      { "type": 1, "params": [10, 0] },
      { "type": 1, "params": [0, 10] },
      { "type": 1, "params": [-10, 0] },
      { "type": 1, "params": [0, -10] }
    ]
  }
}
```

---

# 🔚 Summary

| Component          | Status                            |
| ------------------ | --------------------------------- |
| SHP Parser         | ✅ Easy, recommended start         |
| SHX Parser         | ⚠️ Complex, partial support first |
| Three.js Rendering | ✅ Straightforward                 |
| Performance        | ⚡ Use instancing                  |

---
