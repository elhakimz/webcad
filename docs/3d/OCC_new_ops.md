OCCT has no dedicated "Array" class — all patterns are built by combining `gp_Trsf` (transforms) with a `TopoDS_Compound` collector. Here's the complete playbook with ready-to-use JS helper functions for every pattern type.

---

## The Core Primitive: `applyTransform`

Everything below uses this foundation:

```js
// Apply a gp_Trsf to a shape and return a new copy
function applyTransform(oc, shape, trsf) {
  const builder = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true /*copy*/);
  const result  = builder.Shape();
  builder.delete();
  return result;
}

// Collect an array of shapes into a single TopoDS_Compound
function makeCompound(oc, shapes) {
  const compound = new oc.TopoDS_Compound();
  const builder  = new oc.BRep_Builder();
  builder.MakeCompound(compound);
  shapes.forEach(s => builder.Add(compound, s));
  return compound;
}
```

---

## 1. Mirror

`gp_Trsf.SetMirror` accepts three forms: a point (point symmetry), a `gp_Ax1` (axis symmetry), or a `gp_Ax2` (plane symmetry). The matrix is computed automatically, and you apply it to a shape via `BRepBuilderAPI_Transform`.

```js
// ── Mirror about a plane (most common) ──────────────────────────────────
function mirrorPlane(oc, shape, originPt, normalDir) {
  // originPt: [x,y,z], normalDir: [x,y,z]
  const origin = new oc.gp_Pnt_3(...originPt);
  const normal = new oc.gp_Dir_4(...normalDir);
  const axis   = new oc.gp_Ax2_3(origin, normal);
  const trsf   = new oc.gp_Trsf_1();
  trsf.SetMirror_3(axis);                       // plane mirror
  const result = applyTransform(oc, shape, trsf);
  [origin, normal, axis, trsf].forEach(o => o.delete());
  return result;
}

// Mirror about XZ plane (Y=0):
const mirrored = mirrorPlane(oc, shape, [0,0,0], [0,1,0]);

// ── Mirror about an axis ─────────────────────────────────────────────────
function mirrorAxis(oc, shape, originPt, axisDir) {
  const origin = new oc.gp_Pnt_3(...originPt);
  const dir    = new oc.gp_Dir_4(...axisDir);
  const ax1    = new oc.gp_Ax1_2(origin, dir);
  const trsf   = new oc.gp_Trsf_1();
  trsf.SetMirror_2(ax1);                        // axis mirror
  const result = applyTransform(oc, shape, trsf);
  [origin, dir, ax1, trsf].forEach(o => o.delete());
  return result;
}

// ── Mirror about a point ─────────────────────────────────────────────────
function mirrorPoint(oc, shape, originPt) {
  const pnt  = new oc.gp_Pnt_3(...originPt);
  const trsf = new oc.gp_Trsf_1();
  trsf.SetMirror_1(pnt);                        // point mirror
  const result = applyTransform(oc, shape, trsf);
  [pnt, trsf].forEach(o => o.delete());
  return result;
}
```

---

## 2. Linear Array (1D)

```js
// n copies spaced by (dx, dy, dz)
function linearArray(oc, shape, count, dx, dy, dz) {
  const copies = [];
  for (let i = 0; i < count; i++) {
    const vec  = new oc.gp_Vec_4(dx * i, dy * i, dz * i);
    const trsf = new oc.gp_Trsf_1();
    trsf.SetTranslation_1(vec);
    copies.push(applyTransform(oc, shape, trsf));
    vec.delete(); trsf.delete();
  }
  return makeCompound(oc, copies);
}

// 5 copies spaced 10 units along X:
const arr = linearArray(oc, shape, 5, 10, 0, 0);
```

---

## 3. Rectangular (2D Grid) Array

```js
// rows × cols grid, spaced (stepX, stepY) along two directions
function rectangularArray(oc, shape, cols, rows, stepX, stepY) {
  const copies = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const vec  = new oc.gp_Vec_4(col * stepX, row * stepY, 0);
      const trsf = new oc.gp_Trsf_1();
      trsf.SetTranslation_1(vec);
      copies.push(applyTransform(oc, shape, trsf));
      vec.delete(); trsf.delete();
    }
  }
  return makeCompound(oc, copies);
}

// 4×3 grid, 15 units apart in X, 20 in Y:
const grid = rectangularArray(oc, shape, 4, 3, 15, 20);
```

---

## 4. Box (3D) Array

```js
// cols × rows × layers, spaced (stepX, stepY, stepZ)
function boxArray(oc, shape, cols, rows, layers, stepX, stepY, stepZ) {
  const copies = [];
  for (let z = 0; z < layers; z++)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const vec  = new oc.gp_Vec_4(x * stepX, y * stepY, z * stepZ);
        const trsf = new oc.gp_Trsf_1();
        trsf.SetTranslation_1(vec);
        copies.push(applyTransform(oc, shape, trsf));
        vec.delete(); trsf.delete();
      }
  return makeCompound(oc, copies);
}

// 3×3×3 cube of copies:
const cube = boxArray(oc, shape, 3, 3, 3, 10, 10, 10);
```

---

## 5. Radial / Polar Array

`gp_Trsf.SetRotation` takes a `gp_Ax1` (axis + point) and an angle in radians. Apply it via `BRepBuilderAPI_Transform` to produce a rotated copy at each angular step.

```js
// count copies evenly around an axis, spanning totalAngle radians (2*PI = full circle)
function radialArray(oc, shape, count, axisOrigin, axisDir, totalAngle = 2 * Math.PI) {
  const copies    = [];
  const origin    = new oc.gp_Pnt_3(...axisOrigin);
  const dir       = new oc.gp_Dir_4(...axisDir);
  const ax1       = new oc.gp_Ax1_2(origin, dir);
  const stepAngle = totalAngle / count;

  for (let i = 0; i < count; i++) {
    const trsf = new oc.gp_Trsf_1();
    trsf.SetRotation_1(ax1, stepAngle * i);
    copies.push(applyTransform(oc, shape, trsf));
    trsf.delete();
  }
  [origin, dir, ax1].forEach(o => o.delete());
  return makeCompound(oc, copies);
}

// 6 copies around Z axis, full circle:
const star = radialArray(oc, shape, 6, [0,0,0], [0,0,1]);
// 4 copies over 180°:
const half = radialArray(oc, shape, 4, [0,0,0], [0,0,1], Math.PI);
```

---

## 6. Cylindrical Array (Radial + Axial)

Combines rotation and translation along the axis — like bolt holes on a cylinder with height offset.

```js
function cylindricalArray(oc, shape, count, height, axisOrigin, axisDir) {
  const copies    = [];
  const origin    = new oc.gp_Pnt_3(...axisOrigin);
  const dir       = new oc.gp_Dir_4(...axisDir);
  const ax1       = new oc.gp_Ax1_2(origin, dir);
  const stepAngle = (2 * Math.PI) / count;
  const stepZ     = height / count;

  for (let i = 0; i < count; i++) {
    const rot = new oc.gp_Trsf_1();
    rot.SetRotation_1(ax1, stepAngle * i);

    const vec  = new oc.gp_Vec_4(
      axisDir[0] * stepZ * i,
      axisDir[1] * stepZ * i,
      axisDir[2] * stepZ * i
    );
    const trans = new oc.gp_Trsf_1();
    trans.SetTranslation_1(vec);

    // Combine: rotate first, then translate
    trans.Multiply(rot);
    copies.push(applyTransform(oc, shape, trans));
    [rot, trans, vec].forEach(o => o.delete());
  }
  [origin, dir, ax1].forEach(o => o.delete());
  return makeCompound(oc, copies);
}
```

---

## 7. Spherical Array (Latitude × Longitude Grid)

```js
// latCount × lonCount copies distributed over a sphere surface
function sphericalArray(oc, shape, latCount, lonCount, radius) {
  const copies = [];
  for (let lat = 0; lat < latCount; lat++) {
    const phi = (Math.PI / (latCount + 1)) * (lat + 1); // avoid poles
    for (let lon = 0; lon < lonCount; lon++) {
      const theta = (2 * Math.PI / lonCount) * lon;

      // Position on sphere surface
      const px = radius * Math.sin(phi) * Math.cos(theta);
      const py = radius * Math.cos(phi);
      const pz = radius * Math.sin(phi) * Math.sin(theta);

      const vec  = new oc.gp_Vec_4(px, py, pz);
      const trsf = new oc.gp_Trsf_1();
      trsf.SetTranslation_1(vec);
      copies.push(applyTransform(oc, shape, trsf));
      vec.delete(); trsf.delete();
    }
  }
  return makeCompound(oc, copies);
}

// 4 lat bands × 8 lon steps, distributed over sphere of radius 20:
const sphere = sphericalArray(oc, shape, 4, 8, 20);
```

---

## 8. Scale

For uniform or non-uniform scaling, use `BRepBuilderAPI_Transform` for `gp_Trsf` (uniform scale only) or `BRepBuilderAPI_GTransform` for `gp_GTrsf` (non-uniform / shear).

```js
// Uniform scale around a point
function scaleUniform(oc, shape, factor, centerPt = [0,0,0]) {
  const center = new oc.gp_Pnt_3(...centerPt);
  const trsf   = new oc.gp_Trsf_1();
  trsf.SetScale(center, factor);
  const builder = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
  const result  = builder.Shape();
  [center, trsf, builder].forEach(o => o.delete());
  return result;
}

// Non-uniform scale (different X/Y/Z factors) — requires GTrsf
function scaleNonUniform(oc, shape, sx, sy, sz) {
  const gtrsf = new oc.gp_GTrsf_1();
  gtrsf.SetVectorialPart({
    // 3×3 matrix rows: [row1col1, row1col2, row1col3, ...]
    Value: (r, c) => (r === c ? [sx, sy, sz][r - 1] : 0)
  });
  // Use BRepBuilderAPI_GTransform for general transforms
  const builder = new oc.BRepBuilderAPI_GTransform_2(shape, gtrsf, true);
  const result  = builder.Shape();
  [gtrsf, builder].forEach(o => o.delete());
  return result;
}
```

---

## 9. Combined / Chained Transforms

A sequence of `gp_Trsf` transformations can be pre-multiplied into a single matrix using `Multiply`, defining a total transformation without intermediate shapes.

```js
// Rotate 45° around Z, then translate +10 along X
const rot   = new oc.gp_Trsf_1();
rot.SetRotation_1(zAx1, Math.PI / 4);

const trans = new oc.gp_Trsf_1();
trans.SetTranslation_1(new oc.gp_Vec_4(10, 0, 0));

// Combine: trans applied after rot
trans.Multiply(rot);
const result = applyTransform(oc, shape, trans);
```

---

## Quick Reference Table

| Pattern | Built with | Key `gp_Trsf` method |
|---|---|---|
| **Mirror (plane)** | `BRepBuilderAPI_Transform` | `SetMirror_3(gp_Ax2)` |
| **Mirror (axis)** | `BRepBuilderAPI_Transform` | `SetMirror_2(gp_Ax1)` |
| **Mirror (point)** | `BRepBuilderAPI_Transform` | `SetMirror_1(gp_Pnt)` |
| **Linear array** | loop + Compound | `SetTranslation_1(gp_Vec)` |
| **Rectangular 2D** | nested loop + Compound | `SetTranslation_1(gp_Vec)` |
| **Box 3D** | triple loop + Compound | `SetTranslation_1(gp_Vec)` |
| **Radial / Polar** | loop + Compound | `SetRotation_1(gp_Ax1, angle)` |
| **Cylindrical** | loop + Compound | `Multiply(rot, trans)` |
| **Spherical** | double loop + Compound | `SetTranslation_1(gp_Vec)` |
| **Uniform scale** | `BRepBuilderAPI_Transform` | `SetScale(gp_Pnt, factor)` |
| **Non-uniform scale** | `BRepBuilderAPI_GTransform` | `gp_GTrsf` matrix |

---

**Key gotcha:** `makeCompound` gives you a non-merged collection. If you need one fused solid from the array (e.g. to do further booleans on it), pipe the compound through `BOPAlgo_MakerVolume` or chain `BRepAlgoAPI_Fuse` over all copies.