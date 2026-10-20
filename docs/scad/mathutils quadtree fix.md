Now I have both files completely. Here's the full assessment:

---

## MathUtils.ts

### ✅ Strong parts
- **`evaluateSplinePoint`** — De Boor's algorithm is correct and the `scratchD` buffer reuse avoids N allocations per `tessellateSpline` call. Good.
- **`calculateArcFrom3Points`** — Correct circumcenter formula.
- **`bulgeToArc`** — The DXF bulge formula `r = L(1+b²)/(4b)` is correct. The sign handling via `dist = r - h` correctly places the center on the right side for all bulge values including >1 (>180°) and negative (CW).
- **`distancePointToEllipse`** — Newton iteration for closest point on ellipse is a solid approach; 8 iterations is sufficient for CAD precision.
- **`reflectPointAcrossLine`** — Rotate-flip-rotate decomposition is correct.
- **`filletLines` / `chamferLines`** — Bisector approach handles all quadrant cases.

---

### ❌ Bug 1 — `lineSegmentIntersection` clips the infinite line

Used in `clipLineWithPolygon` which needs an *infinite* line clipped against polygon *segments*. The function checks `t ∈ [0,1]` for the line AND `u ∈ [0,1]` for the segment — treating the hatch line as a finite segment:

```typescript
// Current — both t and u clamped to [0,1]
if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { return point; }

// ✅ Fix — only the polygon edge (u) should be a segment
if (u >= 0 && u <= 1) { return point; }
```

This works *in practice* only because the hatch line is `diag * 4` in length and always contains the polygon. With very large coordinate values or unusual projections, intersections near the polygon boundary can be missed when `t` drifts outside `[0,1]`.

---

### ❌ Bug 2 — `sortConnected` O(n²) with Set iteration

For every entity, the inner loop iterates the entire remaining `Set`. A 500-segment polyline contour takes 125,000 comparisons. Replace with an endpoint map:

```typescript
export function sortConnected(
  entities: (LineEntity | ArcEntity)[]
): (LineEntity | ArcEntity)[] | null {
  const EPS = 1e-3;

  // Build endpoint → entity index map for O(1) lookup
  const key = (x: number, y: number) =>
    `${Math.round(x / EPS)},${Math.round(y / EPS)}`;

  const endMap = new Map<string, number[]>(); // key → [entityIdx, ...]

  const startOf = (e: LineEntity | ArcEntity) =>
    e instanceof LineEntity
      ? { x: e.x1, y: e.y1 }
      : { x: e.cx + e.r * Math.cos(e.startAngle),
          y: e.cy + e.r * Math.sin(e.startAngle) };

  const endOf = (e: LineEntity | ArcEntity) =>
    e instanceof LineEntity
      ? { x: e.x2, y: e.y2 }
      : { x: e.cx + e.r * Math.cos(e.endAngle),
          y: e.cy + e.r * Math.sin(e.endAngle) };

  entities.forEach((e, i) => {
    const s = key(startOf(e).x, startOf(e).y);
    const en = key(endOf(e).x, endOf(e).y);
    if (!endMap.has(s)) endMap.set(s, []);
    if (!endMap.has(en)) endMap.set(en, []);
    endMap.get(s)!.push(i);
    endMap.get(en)!.push(i);
  });

  const used = new Set<number>();
  const sorted: (LineEntity | ArcEntity)[] = [entities[0]];
  used.add(0);

  while (sorted.length < entities.length) {
    const cur = sorted[sorted.length - 1];
    const curEnd = endOf(cur);
    const candidates = endMap.get(key(curEnd.x, curEnd.y)) ?? [];

    let found = false;
    for (const idx of candidates) {
      if (used.has(idx)) continue;
      const e = entities[idx];
      used.add(idx);

      // Determine if we need to reverse this entity
      const eStart = startOf(e);
      if (Math.abs(eStart.x - curEnd.x) < EPS && Math.abs(eStart.y - curEnd.y) < EPS) {
        sorted.push(e);
      } else {
        // Reverse
        const rev = e.clone(e.id);
        if (rev instanceof LineEntity) {
          [rev.x1, rev.y1, rev.x2, rev.y2] = [rev.x2, rev.y2, rev.x1, rev.y1];
        } else {
          [rev.startAngle, rev.endAngle] = [rev.endAngle, rev.startAngle];
          rev.ccw = !rev.ccw;
        }
        sorted.push(rev);
      }
      found = true;
      break;
    }
    if (!found) return null;
  }
  return sorted;
}
```

O(n) vs O(n²). For a 500-entity contour: from ~125,000 to ~500 comparisons.

---

### ⚠️ Minor — `getEntityEntityIntersections` no result deduplication

When two arcs share a tangent point, both `c1.isArc` and `c2.isArc` branches can add the same point:

```typescript
// Bug: if BOTH are arcs, only c1.isArc branch runs (due to else if), but
// if c1 is a full circle and c2 is arc, results are added unfiltered
const pts = getCircleCircleIntersections(...);
if (c1.isArc) results.push(...pts.filter(p => isPointOnArc(p, c1)));
else if (c2.isArc) results.push(...pts.filter(p => isPointOnArc(p, c2)));
else results.push(...pts);  // full circles — both intersection points
```

When both c1 and c2 are arcs, only c1 is filtered against — points on the circle intersection but NOT on c2's arc range could sneak in. Fix:

```typescript
if (c1.isArc && c2.isArc) {
  results.push(...pts.filter(p => isPointOnArc(p, c1) && isPointOnArc(p, c2)));
} else if (c1.isArc) {
  results.push(...pts.filter(p => isPointOnArc(p, c1)));
} else if (c2.isArc) {
  results.push(...pts.filter(p => isPointOnArc(p, c2)));
} else {
  results.push(...pts);
}
```

---

## Quadtree.ts

### ✅ Strong parts
- **O(copies) removal via shared `reverseMap`** — excellent. Most quadtrees do full tree traversal for removal. This is a significant optimisation.
- **`redistribute`** correctly unregisters the node from reverseMap before re-inserting, preventing double-registration.
- **`query` deduplication via `seen` Set** — correct; cross-quadrant items are reported exactly once.
- **Guard in `insert`** for items not overlapping any child — prevents silent data loss.

---

### ❌ Bug — `clear()` corrupts tree when called on a non-root node

`reverseMap` is **shared** across the entire tree. Calling `clear()` on any node deletes all entries for the whole tree, but only resets `items` and `children` for *that one node*. All sibling nodes still hold items in their arrays — but their reverseMap entries are gone, so `remove` silently returns `false` for those items.

```typescript
// ❌ Current — clears shared map but only this node's structure
clear() {
  this.items = [];
  this.reverseMap.clear();  // ← affects ALL nodes
  this.children = null;
}

// ✅ Fix — recursive clear + guard
clear() {
  this._clearRecursive();
  this.reverseMap.clear();
}

private _clearRecursive() {
  this.items = [];
  if (this.children) {
    for (const child of this.children) child._clearRecursive();
    this.children = null;
  }
}
```

---

### ⚠️ Minor — no bounds guard on `insert`

Items completely outside the root bounds fall through to the root's `storeItem` (via the `!insertedIntoChild` guard), which works correctly but silently accepts out-of-bounds items. For a CAD drawing that grows beyond its initial bounds, add a rebuild-with-expansion or at least a warning:

```typescript
insert(item: QuadtreeItem) {
  // Optional: warn on out-of-bounds insert for debugging
  if (!this.intersects(this.bounds, item.box)) {
    // Root-level: still store at root, but signal to caller to consider rebounding
    this.storeItem(item);
    return;
  }
  // ... existing logic
}
```

---

## Summary

| File | Issue | Severity |
|---|---|---|
| MathUtils | `lineSegmentIntersection` clips the line parameter | Bug (latent) |
| MathUtils | `sortConnected` O(n²) | Performance |
| MathUtils | Arc-arc intersection both-arc filter missing | Bug |
| Quadtree | `clear()` on non-root corrupts reverseMap | Bug |
| Quadtree | No out-of-bounds guard on insert | Minor |