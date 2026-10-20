Here’s a **realistic sample AutoCAD `.PAT` file** you can use to test your parser and hatch engine. It includes multiple common patterns (ANSI + architectural styles).

---

# 📄 Sample `webcad.pat`

```text
; ============================================
; WebCAD Sample Hatch Patterns
; Compatible with AutoCAD .PAT format
; ============================================

; -------------------------------
; ANSI31 - Single 45° hatch
; -------------------------------
*ANSI31, ANSI Iron, Brick, Stone
45, 0,0, 0,5

; -------------------------------
; ANSI32 - Crosshatch
; -------------------------------
*ANSI32, ANSI Crosshatch
45, 0,0, 0,5
135, 0,0, 0,5

; -------------------------------
; ANSI33 - Dense crosshatch
; -------------------------------
*ANSI33, Dense Crosshatch
45, 0,0, 0,3
135, 0,0, 0,3

; -------------------------------
; ANSI37 - Dashed hatch
; -------------------------------
*ANSI37, Dashed Hatch
45, 0,0, 0,5, 10, -5

; -------------------------------
; ANSI38 - Offset dashed
; -------------------------------
*ANSI38, Offset Dash Pattern
45, 0,0, 0,5, 5, -2, 1, -2
45, 2.5,2.5, 0,5, 5, -2, 1, -2

; -------------------------------
; AR-CONC - Concrete pattern
; -------------------------------
*AR-CONC, Concrete
0, 0,0, 10,10, 2,-8
90, 0,0, 10,10, 2,-8

; -------------------------------
; AR-BRICK - Brick pattern
; -------------------------------
*AR-BRICK, Brick Pattern
0, 0,0, 8,8
90, 0,0, 8,8
0, 0,4, 8,8

; -------------------------------
; DOTS - Simple dot pattern
; -------------------------------
*DOTS, Dot Pattern
0, 0,0, 5,5, 0,-5

; -------------------------------
; GRID - Square grid
; -------------------------------
*GRID, Grid Pattern
0, 0,0, 10,10
90, 0,0, 10,10

; -------------------------------
; DIAGONAL-CROSS - Decorative
; -------------------------------
*DIAGCROSS, Diagonal Cross Pattern
45, 0,0, 0,6
135, 0,0, 0,6
0, 0,0, 6,6
90, 0,0, 6,6
```

---

# 🧠 How to Use This

### 1. Load file

```ts
const text = await fetch("webcad.pat").then(r => r.text())
```

### 2. Parse

```ts
const patterns = parsePAT(text)
```

### 3. Convert

```ts
const enginePatterns = patterns.map(convertPATPattern)
```

### 4. Render

```ts
hatchPattern(polygon, enginePatterns["ANSI31"])
```

---

# 🧪 Good Test Cases (IMPORTANT)

Use these to verify correctness:

### ✔ Simple polygon

* Rectangle → should show clean pattern

### ✔ Concave polygon

* L-shape → clipping must still work

### ✔ With holes

* Outer + inner polygon → hatch should avoid hole

---

# ⚠️ What This File Tests

This single file will stress your engine:

| Feature          | Pattern   |
| ---------------- | --------- |
| Single line      | ANSI31    |
| Multi-family     | ANSI32    |
| Dense spacing    | ANSI33    |
| Dash pattern     | ANSI37    |
| Offset lines     | ANSI38    |
| Orthogonal grid  | GRID      |
| Mixed directions | DIAGCROSS |
| Dot simulation   | DOTS      |

---

# 🔥 Pro Tip

Start testing in this order:

1. ANSI31 → easiest
2. ANSI32 → multi-line families
3. ANSI37 → dash logic
4. AR-BRICK → offsets (harder)


