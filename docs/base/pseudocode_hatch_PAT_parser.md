Good—this is the step where your WebCAD becomes *real CAD*, not just a demo.

AutoCAD `.PAT` files look simple, but they encode a **parametric pattern system**. If you parse them correctly, your engine can support **hundreds of hatch patterns instantly**.

---

# 🧠 1. What a `.PAT` File Actually Is

A `.PAT` file = a list of **pattern definitions**, each containing:

```text
*PATTERN_NAME, description
angle, x-origin, y-origin, delta-x, delta-y, dash1, gap1, dash2, gap2...
```

---

## Example (ANSI31)

```text
*ANSI31, ANSI Iron, Brick, Stone
45, 0,0, 0,5
```

---

## Example (ANSI32)

```text
*ANSI32, ANSI Crosshatch
45, 0,0, 0,5
135, 0,0, 0,5
```

---

# ⚙️ 2. Target Output (Your Internal Format)

Convert `.PAT` → your engine format:

```ts
type Pattern = {
  name: string
  description: string
  lines: LineFamily[]
}

type LineFamily = {
  angle: number
  origin: [number, number]
  delta: [number, number]
  dashPattern: number[]
}
```

---

# 🧩 3. Full Parser Pseudocode

---

## Main Entry

```pseudo
function parsePAT(text):

    lines = split text into lines
    patterns = []

    currentPattern = null

    for line in lines:

        line = trim(line)

        if line is empty:
            continue

        if line starts with ';':
            continue  // comment

        if line starts with '*':
            currentPattern = parsePatternHeader(line)
            patterns.push(currentPattern)
            continue

        if currentPattern != null:
            family = parsePatternLine(line)
            currentPattern.lines.push(family)

    return patterns
```

---

## Header Parser

```pseudo
function parsePatternHeader(line):

    // remove '*'
    content = line.substring(1)

    parts = split content by ','

    name = trim(parts[0])
    description = join(parts[1..], ",")

    return {
        name: name,
        description: description,
        lines: []
    }
```

---

## Line Definition Parser (CRITICAL)

```pseudo
function parsePatternLine(line):

    parts = split line by ','

    angle = parseFloat(parts[0])

    x = parseFloat(parts[1])
    y = parseFloat(parts[2])

    dx = parseFloat(parts[3])
    dy = parseFloat(parts[4])

    dashPattern = []

    for i from 5 to parts.length:
        dashPattern.push(parseFloat(parts[i]))

    return {
        angle: angle,
        origin: (x, y),
        delta: (dx, dy),
        dashPattern: dashPattern
    }
```

---

# 🧠 4. How to Convert `.PAT` → Your Hatch Engine

This part is **non-obvious but critical**.

### `.PAT` uses:

```text
delta = (dx, dy)
```

This means:

> “Move this much to get the next parallel line”

---

## Convert to your system:

```pseudo
spacing = length(delta)
normal = normalize(perpendicular(direction(angle)))
```

---

## Final Mapping:

```pseudo
function convertToLineFamily(patLine):

    angle = patLine.angle

    direction = vectorFromAngle(angle)

    spacing = length(patLine.delta)

    offset = patLine.origin

    dashPattern = patLine.dashPattern

    return {
        angle,
        spacing,
        offset,
        dashPattern
    }
```

---

# ⚠️ 5. Important Edge Cases

---

## 1. Negative dash values

In `.PAT`:

```text
10, -5
```

Means:

* 10 units drawn
* 5 units gap

So:

```pseudo
if value < 0:
    gap = abs(value)
```

---

## 2. Zero dash = dot

```text
0
```

Means:
→ draw a dot (very short segment)

---

## 3. Missing dash pattern

If no dash values:

```pseudo
dashPattern = []
```

→ continuous line

---

## 4. Floating precision

Use epsilon:

```pseudo
EPS = 1e-6
```

---

# 🧪 6. Example Output

Input:

```text
*ANSI32, Crosshatch
45, 0,0, 0,5
135, 0,0, 0,5
```

Parsed:

```json
{
  "name": "ANSI32",
  "description": "Crosshatch",
  "lines": [
    {
      "angle": 45,
      "origin": [0,0],
      "delta": [0,5],
      "dashPattern": []
    },
    {
      "angle": 135,
      "origin": [0,0],
      "delta": [0,5],
      "dashPattern": []
    }
  ]
}
```

---

# ⚡ 7. TypeScript Implementation (Drop-in Ready)

```ts
export function parsePAT(text: string) {
  const lines = text.split("\n")
  const patterns: any[] = []

  let current: any = null

  for (let raw of lines) {
    let line = raw.trim()

    if (!line || line.startsWith(";")) continue

    if (line.startsWith("*")) {
      const content = line.slice(1)
      const parts = content.split(",")

      current = {
        name: parts[0].trim(),
        description: parts.slice(1).join(",").trim(),
        lines: []
      }

      patterns.push(current)
      continue
    }

    if (!current) continue

    const parts = line.split(",").map(p => parseFloat(p.trim()))

    const [angle, x, y, dx, dy, ...dash] = parts

    current.lines.push({
      angle,
      origin: [x, y],
      delta: [dx, dy],
      dashPattern: dash
    })
  }

  return patterns
}
```

---

# 🚀 8. Next Step (Critical)

Parsing alone is useless unless you:

### ✔ Convert `.PAT` → hatch engine

### ✔ Render clipped segments

### ✔ Apply dash logic

