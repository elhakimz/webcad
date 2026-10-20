The error is clear from the trace. Two separate bugs:

**Bug 1** — `w.IsNull is not a function` on `_1` (4-param) and `_2` (5-param): the code calls `.IsNull()` on the **maker** object, but `BRepPrimAPI_MakeWedge` is a `BRepBuilderAPI_MakeShape`, not a Handle. It has `.IsDone()`, not `.IsNull()`. The constructor itself **succeeds** — only the validity check after it is wrong.

**Bug 2** — The constructor signature map. From the errors:

| Suffix | Expected params | Signature |
|---|---|---|
| `_1` | 4 | `(dx, dy, dz, ltx)` |
| `_2` | 5 | `(ax2, dx, dy, dz, ltx)` |
| `_3` | 7 | `(dx, dy, dz, xmin, zmin, xmax, zmax)` |
| `_4` | 8 | `(ax2, dx, dy, dz, xmin, zmin, xmax, zmax)` |

Your WEDGE command collects `dx, dy, dz, ltx` → `_1` is the right one. Here is the complete fixed handler:

```typescript
} else if (type === 'createWedge') {
  const {
    x1, y1, z1 = 0,   // first corner (world coords)
    x2, y2,            // opposite corner of base
    height,            // dy
    ltx,               // top length in X
    entityId, deflection = 0.1,
  } = payload as {
    x1: number; y1: number; z1?: number;
    x2: number; y2: number;
    height: number; ltx: number;
    entityId: string; deflection?: number;
  };

  try {
    // OCC requires positive extents — derive from corners
    const dx  = Math.abs(x2 - x1);
    const dz  = Math.abs(y2 - y1);
    const dy  = Math.abs(height);
    const ox  = Math.min(x1, x2);
    const oz  = Math.min(y1, y2);
    const oy  = height >= 0 ? z1 : z1 - dy;   // Z in WebCAD = Y in OCC

    if (dx < 1e-10 || dz < 1e-10 || dy < 1e-10) {
      throw new Error('Wedge dimensions must be non-zero');
    }
    if (ltx < 0 || ltx > dx) {
      throw new Error(`ltx (${ltx}) must be in [0, dx=${dx.toFixed(4)}]`);
    }

    // ── _1: (dx, dy, dz, ltx) — no axis, simplest form ───────────────
    const maker = new oc.BRepPrimAPI_MakeWedge_1(dx, dy, dz, ltx);

    // ✅ Check maker with IsDone(), NOT IsNull() — maker is not a Handle
    if (!maker.IsDone()) {
      maker.delete();
      throw new Error('BRepPrimAPI_MakeWedge_1.IsDone() = false');
    }

    let shape = detachShape(oc, maker.Shape());
    maker.delete();

    // Translate to world position (OCC builds wedge at origin)
    if (ox !== 0 || oz !== 0 || oy !== 0) {
      shape = translateShape(oc, shape, ox, oy, oz);
    }

    meshShape(oc, shape, deflection);
    const geometryData = extractMeshData(oc, shape);
    cacheShape(entityId, shape);
    const brepBytes = exportShapeToBytes(oc, shape, entityId);

    self.postMessage({
      type: 'createWedge', success: true,
      payload: { ...geometryData, brepBytes }, id,
    });
  } catch (error: unknown) {
    self.postMessage({
      type: 'createWedge', success: false,
      error: decodeOCCError('createWedge', error), id,
    });
  }
```

And update the probe loop that generates the error message to use `.IsDone()` instead of `.IsNull()`:

```typescript
// In your MakeWedge probe / overload-finder — wherever "w.IsNull" was called:

// ❌ Wrong — BRepPrimAPI_MakeWedge is not a Handle, has no IsNull()
if (!w || w.IsNull()) throw ...;

// ✅ Correct — BRepBuilderAPI_MakeShape uses IsDone()
if (!w.IsDone()) throw new Error(`${ctorName} IsDone()=false`);
const shape = w.Shape();
if (!shape || shape.IsNull?.()) throw new Error(`${ctorName} Shape is null`);
```

One thing to watch: `ltx` can be `0` (a true pyramid/wedge) or equal to `dx` (a rectangular prism — same as a box). Both are valid. Only `ltx < 0` or `ltx > dx` must be rejected.