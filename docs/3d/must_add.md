# OpenCascade.js 3D Transformation Requirements

This document outlines the requirements and implementation patterns for advanced 3D transformations using `BRepBuilderAPI_GTransform` in `OCCWorker.ts`.

## 1. Non-Uniform Scaling (`scale`)
Standard `gp_Trsf` only supports uniform scaling. For non-uniform scaling (affinity), `gp_GTrsf` must be used.

### Requirements:
- **Matrix Mapping**: Manually set the diagonal and translation part to account for the base point $P(Px, Py, Pz)$.
- **API**: `BRepBuilderAPI_GTransform` with `copyGeometry = true`.

### Pattern:
```javascript
const gTrsf = new oc.gp_GTrsf_1();
// Diagonal Scaling
gTrsf.SetValue(1, 1, factorX);
gTrsf.SetValue(2, 2, factorY);
gTrsf.SetValue(3, 3, factorZ);
// Base Point Compensation: P * (1 - S)
gTrsf.SetValue(1, 4, baseX * (1 - factorX));
gTrsf.SetValue(2, 4, baseY * (1 - factorY));
gTrsf.SetValue(3, 4, baseZ * (1 - factorZ));

const gTransform = new oc.BRepBuilderAPI_GTransform_2(shape, gTrsf, true);
const result = gTransform.Shape();
```

---

## 2. Mirroring (`mirror`)
While mirroring is isometric, using it in a unified `GTransform` pipeline requires converting a `gp_Trsf` to a `gp_GTrsf`.

### Requirements:
- **API**: Use `gp_Trsf.SetMirror` for robust matrix calculation, then convert to `gp_GTrsf`.
- **Handedness**: Setting `copyGeometry = true` is critical to handle the determinant -1 (reflection) correctly in the underlying geometry.

### Pattern:
```javascript
const trsf = new oc.gp_Trsf_1();
const axis = new oc.gp_Ax2_3(point, direction);
trsf.SetMirror_3(axis);

const gTrsf = new oc.gp_GTrsf_2(trsf);
const gTransform = new oc.BRepBuilderAPI_GTransform_2(shape, gTrsf, true);
const result = gTransform.Shape();
```

---

## 3. Custom Matrix (`multmatrix`)
Allows applying arbitrary 4x4 transformation matrices (affine).

### Requirements:
- **Mapping**: Map the 4x4 matrix (excluding the bottom row `[0 0 0 1]`) to the 3x4 `gp_GTrsf`.
- **Indices**: `SetValue(row, col, value)` uses 1-based indexing (`row: 1-3`, `col: 1-4`).
- **Validation**: Ensure the $3 \times 3$ determinant is non-zero to avoid singular transformations.

### Pattern:
```javascript
const gTrsf = new oc.gp_GTrsf_1();
// row, col, value
gTrsf.SetValue(1, 1, m00); gTrsf.SetValue(1, 2, m01); gTrsf.SetValue(1, 3, m02); gTrsf.SetValue(1, 4, m03);
gTrsf.SetValue(2, 1, m10); gTrsf.SetValue(2, 2, m11); gTrsf.SetValue(2, 3, m12); gTrsf.SetValue(2, 4, m13);
gTrsf.SetValue(3, 1, m20); gTrsf.SetValue(3, 2, m21); gTrsf.SetValue(3, 3, m22); gTrsf.SetValue(3, 4, m23);

const gTransform = new oc.BRepBuilderAPI_GTransform_2(shape, gTrsf, true);
const result = gTransform.Shape();
```

---

## Critical Implementation Notes
1. **Geometry Conversion**: `GTransform` (especially with non-uniform scaling or shearing) will often convert analytic surfaces (Cylinders, Cones) into **BSpline surfaces**. This increases shape complexity.
2. **Memory Management**: Always call `.delete()` on `gp_GTrsf`, `gp_Trsf`, `gp_Ax2`, and `BRepBuilderAPI_GTransform` to prevent WASM heap exhaustion.
3. **Determinant**: Mirroring has a determinant of -1. Non-uniform scaling can have any positive/negative determinant. Only 0 is forbidden.
