Now I have both files fully read. Let me write a detailed performance review.

---

## Performance Review: FastMath.ts & MathUtils.ts

---

## FastMath.ts

### Strengths

The foundational design decisions are sound. Scalar arguments for `dot3`, `norm3`, `norm2` — where V8 keeps values in registers — is the right call. The binary search in `lookup()` replacing a linear scan is a genuine win for large SCAD lookup tables. `flattenMat4` + `matMul44` + scratch pool for the 4×4 case is clean and the benchmark numbers are credible.

---

### Issue 1 — `_scratch(n)` silently overruns when `n > SLOT_F64S` *(correctness + safety)*

```typescript
function _scratch(n: number = SLOT_F64S): Float64Array {
  const offset = (_poolCursor++ % POOL_SLOTS) * SLOT_F64S;
  return _pool.subarray(offset, offset + n);  // ← overruns if n > 16
}
```

The slot stride is always `SLOT_F64S = 16`, but `subarray(offset, offset + n)` can reach into the *next* slot's memory if `n > 16`. Currently `fastMultiplyMatricesGeneral` guards against this with the `<= SLOT_F64S` check before calling `_scratch`, so it doesn't trigger today — but the function signature gives no indication of this constraint and a future caller will get silently corrupted data, not an error.

**Fix:** Assert or clamp inside `_scratch`:

```typescript
function _scratch(n: number = SLOT_F64S): Float64Array {
  if (n > SLOT_F64S) throw new Error(`_scratch: n=${n} exceeds slot size ${SLOT_F64S}`);
  const offset = (_poolCursor++ % POOL_SLOTS) * SLOT_F64S;
  return _pool.subarray(offset, offset + n);
}
```

---

### Issue 2 — `cross3` and `normalize3` allocate on every call *(GC pressure)*

The stated design goal is zero-GC in hot paths. These two violate it:

```typescript
export function cross3(...): number[] {
  return [ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx]; // allocation
}

export function normalize3(...): number[] {
  return [x*inv, y*inv, z*inv]; // allocation
}
```

A `[a, b, c]` literal is ~57× faster than `Array.from()` (as the comments say), but it still allocates. If `cross3` is called in a transform loop over 10,000 vertices, that is 10,000 array objects to collect.

**Fix — out-parameter variants for hot paths:**

```typescript
// Zero-alloc: write into caller-supplied array
export function cross3Into(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  out: number[]  // or Float64Array
): void {
  out[0] = ay*bz - az*by;
  out[1] = az*bx - ax*bz;
  out[2] = ax*by - ay*bx;
}

export function normalize3Into(x: number, y: number, z: number, out: number[]): void {
  const len = Math.sqrt(x*x + y*y + z*z);
  if (len < 1e-14) { out[0]=0; out[1]=0; out[2]=0; return; }
  const inv = 1 / len;
  out[0] = x*inv; out[1] = y*inv; out[2] = z*inv;
}
```

Keep the existing returning versions as convenience wrappers for non-hot callsites.

---

### Issue 3 — `flattenMat4` uses `?? 0` inside a hot inner loop *(unnecessary branching)*

```typescript
f[base]   = row[0] ?? 0;
f[base+1] = row[1] ?? 0;
// ...
```

Nullish coalescing compiles to a branch per element — 16 branches per matrix flatten. Since `flatMat4` is called from `fastMultiplyMatrices` and `fastMultiplyMatrixVectorList` in tight loops, this is wasted work. If the caller passes a valid 4×4 `number[][]`, none of these will ever be `null` or `undefined`.

**Fix:** Remove `?? 0` and trust the type. If defensive behavior is needed at API boundaries, validate the matrix *once* on entry rather than per element.

---

### Issue 4 — `fastMultiplyMatricesGeneral` has cache-hostile memory access *(~5–10× slowdown for large matrices)*

```typescript
for (let k = 0; k < N; k++) sum += aFlat[rIdx+k] * bFlat[k*P+c];
```

The access `bFlat[k*P+c]` strides by `P` through memory as `k` increments — every read is a cache miss on large matrices. The fix is to transpose the loop order or pre-transpose `bFlat`:

```typescript
// Cache-friendly: iterate k in the inner loop with sequential bFlat access
// Requires transposing bFlat first (one pass), then inner loop is sequential
for (let r = 0; r < M; r++) {
  for (let c = 0; c < P; c++) {
    let sum = 0;
    const rBase = r * N;
    const cBase = c * N;  // use transposed bFlat where bT[c*N+k] = b[k*P+c]
    for (let k = 0; k < N; k++) sum += aFlat[rBase+k] * bFlatT[cBase+k];
    resFlat[r*P+c] = sum;
  }
}
```

For the 4×4 case `matMul44` already does this correctly with explicit register variables — the general case should follow the same pattern.

---

### Issue 5 — `areCollinear` uses an absolute epsilon on a squared magnitude *(precision problem at real CAD scales)*

```typescript
return cx*cx + cy*cy + cz*cz < eps*eps;  // eps = 1e-10 → threshold = 1e-20
```

The cross product magnitude scales with `|AB| × |AC|`. For two vectors of length 1000 units (routine in CAD — a 1-metre part in mm), the squared cross product of *truly collinear* points floating-point noise is around `(1000² * 1e-15)² = 1e-6`, which is far above `1e-20`. These points will be flagged as **non-collinear** when they are geometrically collinear to within machine precision.

**Fix — relative epsilon:**

```typescript
export function areCollinear(a: number[], b: number[], c: number[], eps = 1e-10): boolean {
  const abx = b[0]-a[0], aby = b[1]-a[1], abz = (b[2]??0)-(a[2]??0);
  const acx = c[0]-a[0], acy = c[1]-a[1], acz = (c[2]??0)-(a[2]??0);
  const cx = aby*acz - abz*acy;
  const cy = abz*acx - abx*acz;
  const cz = abx*acy - aby*acx;
  const crossSq = cx*cx + cy*cy + cz*cz;
  const abSq = abx*abx + aby*aby + abz*abz;
  const acSq = acx*acx + acy*acy + acz*acz;
  // Compare sin²θ < eps² instead of |cross|² < eps²
  return crossSq < eps * eps * abSq * acSq;
}
```

---

### Issue 6 — `isNumericVector` / `isVectorList` are O(n) on every call *(hidden cost at SCAD runtime)*

These are type guards called on SCAD runtime values. If SCAD code passes large vectors frequently (e.g., a 1000-point polygon), every vector argument check iterates the whole array. Consider a fast-path: if the array came from the SCAD evaluator's own allocation path, it's already guaranteed numeric — the guard only needs to run at the JS/SCAD boundary, not on every internal operation.

---

## MathUtils.ts

### Issue 1 — `basisFunction` is exponentially recursive *(the most critical performance issue)*

```typescript
export function basisFunction(i: number, degree: number, t: number, knots: number[]): number {
  if (degree === 0) { return (t >= knots[i] && t < knots[i+1]) ? 1 : 0; }
  let leftTerm  = ... basisFunction(i,   degree-1, t, knots);  // recurse
  let rightTerm = ... basisFunction(i+1, degree-1, t, knots);  // recurse
  return leftTerm + rightTerm;
}
```

Each call at degree `d` spawns two calls at degree `d-1`. The call tree has `O(2^d)` nodes. For a cubic spline (degree 3) with 20 control points, `evaluateSplinePoint` calls `basisFunction` 20 times, each producing 8 recursive calls = **160 function calls per point**. `tessellateSpline` calls this 101 times (default 100 segments) = **16,160 function calls** per spline tessellation.

The standard iterative Cox–de Boor algorithm replaces this with `O(n * d)` arithmetic operations using a triangle of running values:

```typescript
export function evaluateSplinePoint(
  controlPoints: Point[], knots: number[], degree: number, t: number
): Point {
  const n = controlPoints.length - 1;
  // Find knot span
  let span = degree;
  while (span < n && knots[span + 1] <= t) span++;

  // Initialize d[] with relevant control points
  const d: Point[] = [];
  for (let j = 0; j <= degree; j++) {
    d[j] = { x: controlPoints[span - degree + j].x, y: controlPoints[span - degree + j].y };
  }

  // Triangular de Boor computation — O(degree²) arithmetic, no recursion
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const left  = span - degree + j;
      const denom = knots[left + degree - r + 1] - knots[left];
      const alpha = denom < 1e-9 ? 0 : (t - knots[left]) / denom;
      d[j].x = (1 - alpha) * d[j-1].x + alpha * d[j].x;
      d[j].y = (1 - alpha) * d[j-1].y + alpha * d[j].y;
    }
  }
  return d[degree];
}
```

For degree-3 splines this is 9 iterations vs 160 recursive calls — roughly **18× faster**, and no stack depth risk.

---

### Issue 2 — `distancePointToEllipse` samples 128 points every call *(O(128) per hover event)*

```typescript
for (let i = 0; i <= steps; i++) {  // steps = 128
  const pt = getPt(ang);
  const d = Math.sqrt((px - pt.x) ** 2 + (py - pt.y) ** 2);
  if (d < minDist) minDist = d;
}
```

This is called from the snap engine on every `mousemove` event, for every ellipse in the document. 128 `Math.sqrt` + 128 `Math.cos/sin` pairs per ellipse per mousemove is main-thread blocking on any document with more than a handful of ellipses.

The correct approach is Newton iteration on the ellipse distance function, which converges in 4–8 iterations:

```typescript
export function distancePointToEllipse(
  px: number, py: number,
  cx: number, cy: number, majorX: number, majorY: number, ratio: number,
  startAngle: number, endAngle: number, ccw: boolean
): number {
  const rotation = Math.atan2(majorY, majorX);
  const a = Math.sqrt(majorX*majorX + majorY*majorY);  // semi-major
  const b = a * ratio;                                   // semi-minor
  const cosR = Math.cos(-rotation), sinR = Math.sin(-rotation);
  const dx = px - cx, dy = py - cy;
  // Rotate point into ellipse local frame
  const lx = dx*cosR - dy*sinR;
  const ly = dx*sinR + dy*cosR;

  // Newton iteration for closest point angle on full ellipse
  let t = Math.atan2(ly * a, lx * b);
  for (let iter = 0; iter < 8; iter++) {
    const ex = a * Math.cos(t) - lx;
    const ey = b * Math.sin(t) - ly;
    const ex2 = -a * Math.sin(t);
    const ey2 =  b * Math.cos(t);
    const f  =  ex * ex2 + ey * ey2;
    const fp = ex2*ex2 + ey2*ey2 - ex*a*Math.cos(t) + ey*b*Math.sin(t);
    if (Math.abs(fp) < 1e-12) break;
    t -= f / fp;
  }
  // ... clamp t to arc range, return distance
  return Math.sqrt((a*Math.cos(t)-lx)**2 + (b*Math.sin(t)-ly)**2);
}
```

This reduces 128 iterations to ~8 — **16× faster** — and more accurate.

---

### Issue 3 — `aciToRgb` rebuilds its lookup table on every call *(unnecessary allocation)*

```typescript
export function aciToRgb(aci?: number): number {
  const colors: Record<number, number> = {   // ← new object every call
    1: 0xff0000, 2: 0xffff00, ...
  };
  ...
}
```

This creates a new object literal on every call. Given that `aciToRgb` is called once per entity during rendering, on a 10,000-entity document this is 10,000 unnecessary allocations per frame when colors are recomputed.

**Fix:** Module-level constant:

```typescript
const ACI_COLORS: Record<number, number> = {
  1: 0xff0000, 2: 0xffff00, 3: 0x00ff00,
  4: 0x00ffff, 5: 0x0000ff, 6: 0xff00ff,
  7: 0xffffff, 8: 0x808080, 9: 0xc0c0c0,
};

export function aciToRgb(aci?: number): number {
  return (aci !== undefined && ACI_COLORS[aci] !== undefined)
    ? ACI_COLORS[aci]
    : 0xffffff;
}
```

---

### Issue 4 — `sortConnected` mutates input entities in place *(correctness bug)*

```typescript
entity.x1 = entity.x2; entity.y1 = entity.y2;
entity.x2 = temp.x;    entity.y2 = temp.y;
// and for arcs:
entity.startAngle = entity.endAngle;
entity.endAngle = temp;
entity.ccw = !entity.ccw;
```

`sortConnected` reverses line and arc entities directly on the document's entity objects in order to make a chain connect. This permanently mutates the entities — a caller expecting to sort multiple different chains from the same entity set (e.g., offset or trim operations) will get corrupted data on the second call.

**Fix:** Wrap each entity in a thin `{ entity, reversed: boolean }` envelope and apply the reversal only when reading endpoints, never on the entity itself.

---

### Issue 5 — `normalize()` angle helper uses `while` loops; duplicated in 3 places *(minor performance + DRY)*

```typescript
const normalize = (a: number) => {
  while (a < 0) a += Math.PI * 2;
  while (a >= Math.PI * 2) a -= Math.PI * 2;
  return a;
};
```

This appears identically in `distancePointToArc`, `distancePointToEllipse`, and `getEntityEntityIntersections`. For well-behaved inputs from `Math.atan2` (range `[-π, π]`) the `while` terminates in one pass, but the loop is unnecessary when you know the input range.

**Fix — module-level utility using modulo:**

```typescript
function normalizeAngle(a: number): number {
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}
```

This is a single arithmetic expression, branchless, and handles all inputs including large multiples of 2π correctly.

---

### Issue 6 — `calculatePolygonVerticesByEdge` recomputes edge length inside the loop

```typescript
for (let i = 2; i < sides; i++) {
  currentAngle += angleStep;
  currentX += Math.sqrt(dx * dx + dy * dy) * Math.cos(currentAngle);  // recomputed
  currentY += Math.sqrt(dx * dx + dy * dy) * Math.sin(currentAngle);  // recomputed
}
```

`Math.sqrt(dx*dx + dy*dy)` is the edge length — constant throughout the loop. It should be hoisted:

```typescript
const edgeLen = Math.sqrt(dx * dx + dy * dy);
for (let i = 2; i < sides; i++) {
  currentAngle += angleStep;
  currentX += edgeLen * Math.cos(currentAngle);
  currentY += edgeLen * Math.sin(currentAngle);
}
```

---

### Issue 7 — `reflectPointAcrossLine` computes redundant trig *(4 trig calls, 2 needed)*

```typescript
const rx = tx * Math.cos(-angle) - ty * Math.sin(-angle);
const ry = tx * Math.sin(-angle) + ty * Math.cos(-angle);
// ... then:
const finalX = rx * Math.cos(angle) - reflectedRy * Math.sin(angle);
const finalY = rx * Math.sin(angle) + reflectedRy * Math.cos(angle);
```

`cos(-angle) = cos(angle)` and `sin(-angle) = -sin(angle)`. This means 4 `Math.cos/sin` calls are doing the work of 2:

```typescript
const cosA = Math.cos(angle), sinA = Math.sin(angle);
const rx =  tx * cosA + ty * sinA;  // cos(-a)=cosA, sin(-a)=-sinA
const ry = -tx * sinA + ty * cosA;
const reflectedRy = -ry;
return {
  x: rx * cosA - reflectedRy * sinA + lineP1.x,
  y: rx * sinA + reflectedRy * cosA + lineP1.y,
};
```

---

### Issue 8 — `getEntityEntityIntersections` allocates temporary entities in the explode path *(GC in intersection hot path)*

```typescript
segments.push(new LineEntity("TMP", v1.x, v1.y, v2.x, v2.y));
// and
segments.push(new ArcEntity("TMP", arc.cx, arc.cy, arc.r, ...));
```

For a polyline with 64 vertices intersecting an ellipse approximated as 64 segments, this creates **128 temporary entity objects** per intersection test. These are full model objects (with IDs, event emitters, etc.) used only as data holders for 4 numbers. A plain `{ x1, y1, x2, y2 }` struct would be ~10× cheaper to allocate and collect.

---

## Summary

| File | Issue | Severity |
|---|---|---|
| FastMath | `_scratch(n > SLOT_F64S)` silently overruns | High — silent corruption |
| FastMath | `cross3` / `normalize3` allocate in hot path | Medium — GC pressure |
| FastMath | `flattenMat4` nullish coalescing per element | Low |
| FastMath | General matmul cache-hostile access | Medium — large matrix slowdown |
| FastMath | `areCollinear` absolute epsilon breaks at real CAD scales | High — wrong results |
| FastMath | `isNumericVector` O(n) on every call | Low |
| MathUtils | `basisFunction` exponential recursion | **Critical — 18× fix available** |
| MathUtils | `distancePointToEllipse` 128-sample loop | High — blocks mousemove |
| MathUtils | `aciToRgb` rebuilds table on every call | Low |
| MathUtils | `sortConnected` mutates document entities | **High — correctness bug** |
| MathUtils | `normalize()` angle helper duplicated 3× | Low |
| MathUtils | `calculatePolygonVerticesByEdge` sqrt in loop | Low |
| MathUtils | `reflectPointAcrossLine` redundant trig | Low |
| MathUtils | Temp entity allocation in `getEntityEntityIntersections` | Medium |

The two items that need immediate attention are the `basisFunction` exponential recursion (will visibly freeze the UI on any complex spline) and `sortConnected` mutating document entities (a silent correctness bug that will cause hard-to-reproduce rendering artifacts). The `areCollinear` epsilon issue will cause wrong results on any CAD document using metric units at realistic scales.