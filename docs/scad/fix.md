Now I have the complete picture. Here's a comprehensive review of every bug and gap I found across the SCAD stack:

---

## Critical — will break common `.scad` files

### 1. `rotate_extrude` completely absent
Not in the Evaluator's transform list and not in `CsgExecutor.applyTransform`. Any `.scad` using `rotate_extrude` silently drops the geometry.

```typescript
// Evaluator.ts line 226 — add rotate_extrude
if (["translate","rotate","scale","mirror","multmatrix","color",
     "linear_extrude","rotate_extrude"].includes(node.name)) {

// CsgExecutor.applyTransform — add case:
case "rotate_extrude": {
  const angle = p.angle ?? p[0] ?? 360;
  geo = await this.occ.createRevolve(
    sourceId,                    // profile id already in worker
    [0, 0, 0],                   // axis point (origin)
    [0, 0, 1],                   // axis direction (Z)
    angle,
    0,                           // thickness
    deflection,
    true,                        // closed
    targetId
  );
  break;
}
```

---

### 2. `torus` registered as primitive but never executed
`Evaluator.ts:218` registers `"torus"` as a primitive, but `CsgExecutor.createPrimitive` has no `case "torus"`. Result: `null` geometry, no error.

```typescript
// CsgExecutor.createPrimitive — add:
case "torus": {
  const r1 = p.r1 ?? p[0] ?? 1;  // major radius
  const r2 = p.r2 ?? p[1] ?? 0.25; // minor radius (tube)
  const x  = p.x  ?? 0;
  const y  = p.y  ?? 0;
  const z  = p.z  ?? 0;
  validate(r1, r2);
  if (r1 <= 0 || r2 <= 0) throw new Error(`Torus radii must be positive`);
  geo = await this.occ.createTorus(x, y, z, r1, r2, deflection, id);
  break;
}
```

---

### 3. `linear_extrude` is a Z-scale hack, not a real extrusion
`CsgExecutor` scales the source shape by `height / 0.001` on Z. This only works because `square`/`circle`/`polygon` happen to create 0.001-thick solids. It **breaks** for:
- `twist` or `scale` parameters
- Profiles that aren't axis-aligned boxes
- Any profile not created with exactly 0.001 thickness

The fix requires `createExtrude` to accept a 2D profile ID directly from the worker rather than going through the thin-solid workaround.

---

### 4. `$fn` / `$fa` / `$fs` never reach OCC primitives
The evaluator sets `$fn=32` globally and params are collected into `args`, but `CsgExecutor.createPrimitive` never reads `p.$fn`, `p.$fa`, or `p.$fs`. All spheres/cylinders use the service default regardless of what the `.scad` file specifies.

```typescript
// CsgExecutor — add helper at top of createPrimitive:
const fn = p.$fn ?? p['$fn'] ?? 32;
const segments = fn > 0 ? Math.max(3, fn) : 32;
// pass segments to occ.createSphere / createCylinder etc.
```

---

### 5. `use <file>` incorrectly imports variable assignments
`ScadManager.ts:136` — the `use` filter includes `"Assignment"` nodes. In OpenSCAD, `use` must import **only** `module` and `function` definitions — variable assignments from a `use`-d file must not enter the caller's scope.

```typescript
// ❌ current
const filtered = importedNodes.filter(node =>
  node.type === "ModuleDef" ||
  node.type === "FunctionDef" ||
  node.type === "Assignment"   // ← wrong, should not be here
);

// ✅ fix
const filtered = importedNodes.filter(node =>
  node.type === "ModuleDef" ||
  node.type === "FunctionDef"
);
```

---

### 6. `%` modulo and `^` exponent operators missing from evaluator
Both tokens are lexed (`PERCENT`, `CARET`) but `evaluateExpression` has no `case "%"` or `case "^"`.

```typescript
// Evaluator BinaryExpression — add:
case "%": return (a: any, b: any) => a % b;        // modulo
case "^": return Math.pow(left, right);             // exponentiation
```

---

## Medium — breaks specific common patterns

### 7. `assert()` is registered as `"assertion"` not `"assert"`
`Evaluator.ts:418` — `expr.name === "assertion"` should be `"assert"`. OpenSCAD uses `assert(condition, message)`.

### 8. Missing built-in functions
These appear in typical `.scad` files and are not in the evaluator:

| Missing function | Fix |
|---|---|
| `norm(v)` | `Math.sqrt(v.reduce((s,x)=>s+x*x, 0))` |
| `cross(a,b)` | standard cross product |
| `lookup(key, table)` | linear interpolation in table |
| `chr(n)` | `String.fromCharCode(n)` |
| `ord(s)` | `s.charCodeAt(0)` |
| `is_function(v)` | `false` (not supported in WebCAD, return false) |
| `rands(min,max,n)` | array of n random numbers |

### 9. `for` loop with multiple ranges not supported
`ForStatement` AST has a single `range`, but OpenSCAD supports:
```scad
for (x = [0:5], y = [0:5]) { ... }  // nested iteration
for (p = points) { ... }             // vector destructuring
```
The `Evaluator.evaluateForStatement` only sets `node.variables[0]` — `variables[1..n]` are never bound.

### 10. Shape modifiers `*`, `%`, `!`, `#` not parsed
The lexer handles `*`, `%`, `!` as operators but never as SCAD modifiers. A file like:
```scad
%cube([10,10,10]);   // background (transparent ghost)
*sphere(5);          // disable (skip)
```
will either throw a parse error or produce wrong geometry.

---

## Low — completeness gaps

| Missing | Impact |
|---|---|
| `surface(file)` | heightmap from PNG/DAT |
| `import(file)` | STL/STEP file import |
| `projection(cut)` | 3D→2D projection |
| `offset(r, delta, chamfer)` | 2D profile offset |
| `minkowski()` | Minkowski sum |
| `resize(newsize, auto)` | resize to bounding box |
| `render(convexity)` | force mesh (pass-through is fine) |
| `children($n)` | access individual children by index |
| `$t`, `$vpr`, `$vpt`, `$vpd` | animation/viewport variables |

---

## Summary — priority order to fix

```
1. rotate_extrude  (extremely common)
2. torus case in CsgExecutor  (silent null)
3. $fn not passed to OCC      (all curves at wrong resolution)
4. % and ^ operators          (math in SCAD files breaks)
5. use leaking assignments     (scope pollution between files)
6. linear_extrude real impl    (twist/scale params broken)
7. Missing math functions      (norm, cross, lookup used in libs)
8. assert name typo            (assert() always silently passes)
9. for multi-range             (nested loops broken)
10. Shape modifiers *%!#       (parse errors on real-world files)
```