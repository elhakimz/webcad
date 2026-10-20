Great—this is the **bridge layer** between your `.PAT` parser and your hatch renderer. If you get this right, every AutoCAD pattern becomes usable in your WebCAD.

---

# 🧠 Big Picture

You already have:

* ✅ `.PAT` → parsed data (`angle, origin, delta, dash`)
* ✅ Hatch engine (expects: `angle, spacing, offset, dashPattern`)

Now you need:

> **Converter: PAT → LineFamily usable by your engine**

---

# ⚙️ 1. Key Concept (CRITICAL)

In `.PAT`:

```text
delta = (dx, dy)
```

This means:

> “Move this vector to generate the next parallel line”

So:

```text
spacing = length(delta)
```

BUT orientation also matters.

---

# 📐 2. Geometry Conversion

## Step-by-step:

```pseudo
direction = unit vector from angle
normal = perpendicular(direction)

spacing = projection of delta onto normal
```

---

## Why projection?

Because `delta` is not always perpendicular to the line.

---

# 🧩 3. Core Conversion Function

---

## Pseudocode

```pseudo
function convertPATLine(patLine):

    angle = patLine.angle

    direction = normalize([
        cos(angle),
        sin(angle)
    ])

    normal = perpendicular(direction)

    dx = patLine.delta.x
    dy = patLine.delta.y

    deltaVec = (dx, dy)

    spacing = abs(dot(deltaVec, normal))

    offset = patLine.origin

    dashPattern = normalizeDash(patLine.dashPattern)

    return LineFamily {
        angle: angle,
        spacing: spacing,
        offset: offset,
        dashPattern: dashPattern
    }
```

---

# ⚠️ 4. Dash Pattern Normalization

AutoCAD `.PAT` uses:

* positive → draw
* negative → gap
* zero → dot

Convert to your engine:

```pseudo
function normalizeDash(dash):

    result = []

    for value in dash:

        if value == 0:
            result.push(EPSILON)  // dot
            result.push(large_gap)

        else:
            result.push(abs(value))

    return result
```

Better version:

```pseudo
function normalizeDash(dash):

    if dash empty:
        return []

    result = []

    for i in range(len(dash)):
        val = dash[i]

        if val > 0:
            result.push(val)   // draw
        else:
            result.push(abs(val)) // gap

    return result
```

---

# 🧠 5. Full Pattern Conversion

```pseudo
function convertPATPattern(patPattern):

    enginePattern = {
        name: patPattern.name,
        lines: []
    }

    for line in patPattern.lines:
        family = convertPATLine(line)
        enginePattern.lines.push(family)

    return enginePattern
```

---

# 🧪 6. Example (ANSI31)

Input:

```text
45, 0,0, 0,5
```

### Compute:

```pseudo
direction = (0.707, 0.707)
normal = (-0.707, 0.707)

delta = (0,5)

spacing = dot(delta, normal)
        = (0 * -0.707 + 5 * 0.707)
        ≈ 3.535
```

✔ That’s correct geometric spacing

---

# ⚠️ Important Insight

AutoCAD patterns are defined in **pattern space**, not screen space.

So spacing may look different depending on scaling.

---

# 🔧 7. TypeScript Implementation (Drop-in)

```ts
type PATLine = {
  angle: number
  origin: [number, number]
  delta: [number, number]
  dashPattern: number[]
}

type LineFamily = {
  angle: number
  spacing: number
  offset: [number, number]
  dashPattern: number[]
}

function degToRad(a: number) {
  return (a * Math.PI) / 180
}

function normalizeDash(dash: number[]): number[] {
  if (!dash || dash.length === 0) return []

  return dash.map(v => Math.abs(v))
}

export function convertPATLine(line: PATLine): LineFamily {
  const angleRad = degToRad(line.angle)

  const direction: [number, number] = [
    Math.cos(angleRad),
    Math.sin(angleRad)
  ]

  const normal: [number, number] = [
    -direction[1],
    direction[0]
  ]

  const [dx, dy] = line.delta

  const spacing = Math.abs(dx * normal[0] + dy * normal[1])

  return {
    angle: line.angle,
    spacing: spacing,
    offset: line.origin,
    dashPattern: normalizeDash(line.dashPattern)
  }
}

export function convertPATPattern(pat: any) {
  return {
    name: pat.name,
    lines: pat.lines.map(convertPATLine)
  }
}
```

---

# ⚡ 8. Integration with Your Hatch Engine

Now your pipeline becomes:

```pseudo
PAT file
   ↓
parsePAT()
   ↓
convertPATPattern()
   ↓
hatchPattern(polygon, pattern)
   ↓
render segments (Three.js)
```

---

# 🚨 9. Real-World Gotchas

### 1. spacing = 0

→ skip line (invalid)

---

### 2. delta not perpendicular

→ projection handles it (you’re safe)

---

### 3. very small spacing

→ clamp minimum:

```pseudo
if spacing < 0.001 → ignore
```

---

### 4. huge dash values

→ clamp to viewport scale

---

# 🔥 Final Insight

Once this works:

> You’ve recreated AutoCAD’s pattern system

Everything else (ANSI, AR-CONC, etc.) becomes just data.


