The crash has two sources. Let me trace them both:Found both causes. Let me document them clearly:

**Bug 1 — `applyRotation` returns a dangling shape** (line 96–97): `brepTransform.delete()` is called BEFORE returning `newShape`. `Shape()` is a reference into the builder's internals; deleting the builder invalidates it. Any subsequent boolean that receives this shape from `shapeA`/`shapeB` immediately corrupts the WASM heap → `wasmTable.get(...)`.

**Bug 2 — `BRepAlgoAPI_Fuse/Cut/Common_3` likely requires 3 args in this build**: The `_3` suffix in this build's constructor numbering is almost certainly `(S1, S2, progressRange)`, not `(S1, S2)`. Calling it with 2 args leaves the internal PAD (Pave Filler) in an uninitialised state. `Build()` then tries to call a virtual method through a null internal pointer → `wasmTable.get(0)` → crash. Same pattern as `BRepBuilderAPI_Sewing.Perform` requiring `Handle_Message_ProgressIndicator_1`.

Here are the targeted fixes in `OCCWorker.ts`:

```typescript
// ─── Fix 1: applyRotation — detach before deleting builder ────────────────
function applyRotation(shape: any, rot: any, oc: any, center?: any): any {
  if (!rot || (rot.x === 0 && rot.y === 0 && rot.z === 0)) return shape;

  // ... (existing transform math unchanged) ...

  const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);

  // ✅ Detach BEFORE deleting — Shape() is a ref into the builder's memory
  const newShape = detachShape(oc, brepTransform.Shape());

  vecToOrigin.delete(); toOrigin.delete(); originPnt.delete();
  rotX.delete(); rotY.delete(); rotZ.delete(); rotTrsf.delete();
  vecToBack.delete(); toBack.delete(); transform.delete();
  brepTransform.delete(); // ← now safe: newShape is an independent copy

  return newShape;
}


// ─── Fix 2: makeBooleanBuilder — probe constructor + Build() arg ──────────
function makeBooleanBuilder(oc: any, operation: string, shapeA: any, shapeB: any): any {
  const nullPI = new oc.Handle_Message_ProgressIndicator_1();

  // Suffix _3 in this build is (S1, S2, progressRange) — pass null handle.
  // Fall back to _4 (2-arg) or _2 (2-arg in some builds) if _3 throws.
  const ctorMap: Record<string, string[]> = {
    fuse:   ['BRepAlgoAPI_Fuse_3',   'BRepAlgoAPI_Fuse_4',   'BRepAlgoAPI_Fuse_2'],
    cut:    ['BRepAlgoAPI_Cut_3',    'BRepAlgoAPI_Cut_4',    'BRepAlgoAPI_Cut_2'],
    common: ['BRepAlgoAPI_Common_3', 'BRepAlgoAPI_Common_4', 'BRepAlgoAPI_Common_2'],
  };

  for (const ctorName of (ctorMap[operation] ?? [])) {
    const Ctor = oc[ctorName];
    if (typeof Ctor !== 'function') continue;
    try {
      // Try with null progress handle first (handles _3 = (S1, S2, PI) case)
      const builder = new Ctor(shapeA, shapeB, nullPI);
      nullPI.delete();
      return builder;
    } catch (_) {
      try {
        // Try without progress (handles _4 = (S1, S2) case)
        const builder = new Ctor(shapeA, shapeB);
        nullPI.delete();
        return builder;
      } catch (_) {}
    }
  }

  // Last resort: default constructor + SetShape setters (OCC 7.1+ pattern)
  const defaultCtors: Record<string, string> = {
    fuse:   'BRepAlgoAPI_Fuse_1',
    cut:    'BRepAlgoAPI_Cut_1',
    common: 'BRepAlgoAPI_Common_1',
  };
  const DefaultCtor = oc[defaultCtors[operation]];
  if (DefaultCtor) {
    const builder = new DefaultCtor();
    if (typeof builder.SetShape1 === 'function') builder.SetShape1(shapeA);
    if (typeof builder.SetShape2 === 'function') builder.SetShape2(shapeB);
    nullPI.delete();
    return builder;
  }

  nullPI.delete();
  throw new Error(`No working constructor found for BRepAlgoAPI ${operation}`);
}


// ─── Fix 3: safe Build() — also needs null handle in this build ───────────
function buildBooleanOp(oc: any, builder: any): void {
  const nullPI = new oc.Handle_Message_ProgressIndicator_1();
  try {
    // Try with progress handle (pre-7.5 Build signature)
    builder.Build(nullPI);
  } catch (_) {
    // Fallback to no-arg Build
    builder.Build();
  } finally {
    nullPI.delete();
  }
}
```

Then replace the boolean block in the `createBoolean` handler:

```typescript
// ── BEFORE ────────────────────────────────────────────────────────────────
let boolBuilder: any;
if (operation === 'fuse') {
  boolBuilder = new oc.BRepAlgoAPI_Fuse_3(shapeA, shapeB);
} else if (operation === 'cut') {
  boolBuilder = new oc.BRepAlgoAPI_Cut_3(shapeA, shapeB);
} else if (operation === 'common') {
  boolBuilder = new oc.BRepAlgoAPI_Common_3(shapeA, shapeB);
} else {
  throw new Error(`Unknown boolean operation: ${operation}`);
}
if (boolBuilder) configureBooleanOp(boolBuilder);
boolBuilder.Build();

// ── AFTER ─────────────────────────────────────────────────────────────────
const boolBuilder = makeBooleanBuilder(oc, operation, shapeA, shapeB);
configureBooleanOp(boolBuilder);
buildBooleanOp(oc, boolBuilder);   // safe Build() with null-handle fallback
```

Apply the same `buildBooleanOp` pattern wherever else `.Build()` is called on boolean ops in the file — `BRepAlgoAPI_Cut_3` at lines 725, 819, and `BRepAlgoAPI_Fuse_3` at line 1742:

```typescript
// line 725 (shell cut):
const cutter = makeBooleanBuilder(oc, 'cut', shape, scaledShape);
configureBooleanOp(cutter);
buildBooleanOp(oc, cutter);

// line 1742 (hull fuse loop):
const fuse = makeBooleanBuilder(oc, 'fuse', resultShape, shapes[i]);
configureBooleanOp(fuse);
buildBooleanOp(oc, fuse);
```