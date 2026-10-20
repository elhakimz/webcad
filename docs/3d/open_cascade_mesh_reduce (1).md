# OpenCascade.js — Mesh Reduction Guide

## Quick Decision Guide

Start here before reading further:

```
Mesh too dense?
│
├── Re-meshing is OK → increase deflection (Section 1)
│   └── Model has many coplanar faces? → UnifySameDomain first (Section 2)
│
└── Cannot re-mesh (working from existing triangulation) → meshoptimizer (Section 3)
```

| Method | When to Use | Result |
| :--- | :--- | :--- |
| **Deflection Tuning** | During `BRepMesh` generation | Fastest; preserves geometric accuracy |
| **UnifySameDomain** | Before meshing, CAD models with fragmented faces | Best triangle-count reduction for boolean/extruded shapes |
| **External Decimation** | After mesh is already created; cannot re-mesh | Best for purely visual optimisation |

---

## 1. Adjusting Deflection Parameters

The most effective lever during meshing. `BRepMesh_IncrementalMesh_2` accepts five arguments — the third argument (`isRelative`) is just as impactful as the deflection numbers themselves.

### Arguments

| Position | Name | Effect |
| :--- | :--- | :--- |
| 1 | `shape` | The `TopoDS_Shape` to mesh |
| 2 | `linearDeflection` | Max distance between surface and triangle edge |
| 3 | `isRelative` | If `true`, deflection is relative to each face's bounding-box diagonal — strongly recommended for scenes with mixed-scale objects |
| 4 | `angularDeflection` | Max angle (radians) between successive segments on curved edges |
| 5 | `isInParallel` | If `true`, uses multi-threaded meshing |

**Increasing** `linearDeflection` or `angularDeflection` produces fewer triangles. Switching `isRelative` to `true` often has a larger effect than changing the numbers, especially when your model mixes large flat faces with small curved features.

### Code Example

```javascript
// Increase deflection values to REDUCE triangle count.
// isRelative = true means deflection is scaled per-face — usually better for CAD.
const linearDeflection  = 0.5;
const angularDeflection = 0.5; // ≈ 28°

const mesher = new oc.BRepMesh_IncrementalMesh_2(
  myShape,
  linearDeflection,
  true,            // isRelative
  angularDeflection,
  true             // isInParallel
);

// ✅ Meshing runs inside the constructor — there is no .Perform() method.
//    Call IsDone() to confirm success, then free the mesher.
if (!mesher.IsDone()) {
  console.warn("Meshing did not complete successfully.");
}
mesher.delete();
```

> **Common mistake:** `mesher.Perform()` does **not** exist in opencascade.js and will throw at runtime. The mesh is computed during construction.

### Advanced: Per-Face Deflection

For complex models you can assign different deflection values per face — keeping fine detail on visible faces while coarsening hidden or interior ones. This requires iterating the shape's topology with `TopExp_Explorer`, retrieving each face's `BRep_Tool` triangulation parameters, and setting face-specific mesh attributes via `BRep_Builder` before calling `BRepMesh_IncrementalMesh_2`. This is intermediate-level usage, but worth exploring when a uniform deflection value forces an unacceptable trade-off between visual quality and performance.

---

## 2. Geometric Simplification (Pre-Meshing)

If the underlying BRep geometry has many tiny or redundant faces, the mesher will produce a dense mesh regardless of your deflection settings. Simplify the geometry *before* meshing.

### `ShapeUpgrade_UnifySameDomain` — Merge Coplanar Faces

This is the single biggest win for most CAD models (extruded polygons, boolean operation results). It merges faces that share the same underlying surface and collapses collinear edges, removing the seams that force the mesher to create unnecessary triangles.

```javascript
// true, true, true → unify faces, unify edges, concat B-Splines
const unifier = new oc.ShapeUpgrade_UnifySameDomain_2(myShape, true, true, true);
unifier.Build();
const simplifiedShape = unifier.Shape();

// Now mesh the simplified shape
const mesher = new oc.BRepMesh_IncrementalMesh_2(
  simplifiedShape, 0.5, true, 0.5, true
);
if (!mesher.IsDone()) {
  console.warn("Meshing did not complete successfully.");
}
mesher.delete();
```

### Removing Short Edges

To eliminate very short edges that force the mesher to generate tiny local triangles, use `ShapeUpgrade_RemoveInternalWires` or filter edges below a length threshold with `TopExp_Explorer` + `BRep_Tool::Curve` before meshing.

> **Note on `ShapeFix_Shape`:** This module is a *validity corrector* — it repairs broken topology (missing seams, invalid orientation, degenerate edges). It does **not** simplify or reduce geometry and is not the right tool for triangle-count reduction. Use `ShapeUpgrade_UnifySameDomain` or `ShapeUpgrade_RemoveInternalWires` instead.

---

## 3. Post-Processing Decimation (External Libraries)

If you already have a `Poly_Triangulation` and cannot re-mesh the BRep, OpenCascade's own tools are limited. Pass the mesh to a specialised library instead.

### three.js `SimplifyModifier`

If you are already using Three.js for visualisation, its built-in `SimplifyModifier` is the path of least resistance — no additional dependencies.

```javascript
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';

const modifier  = new SimplifyModifier();
const count     = Math.floor(geometry.attributes.position.count * 0.5); // reduce by 50%
const simplified = modifier.modify(geometry, count);
```

### `meshoptimizer` (WASM)

A high-performance WASM decimation library — significantly faster than `SimplifyModifier` for large meshes.

```javascript
import { MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;

const [vertices, indices] = MeshoptSimplifier.simplify(
  srcVertices,  // Float32Array, 3 floats per vertex
  srcIndices,   // Uint32Array
  3,            // vertex stride
  targetCount,  // target index count
  0.01          // target error threshold
);
```

> **⚠ Worker / SharedArrayBuffer conflict:** `meshoptimizer`'s WASM build requires `SharedArrayBuffer` support. If you are running opencascade.js inside a Web Worker (the recommended setup), both libraries will compete for the same WASM memory model. Ensure your server sends the required COOP/COEP headers:
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
> And if using Node.js, start the worker with `--experimental-wasm-threads`. Without this, you will hit `SharedArrayBuffer is not defined` or silent memory errors.

---

## Summary

For most CAD workflows the most effective combination is:

1. Run `ShapeUpgrade_UnifySameDomain` on the raw BRep output.
2. Mesh with `BRepMesh_IncrementalMesh_2` using `isRelative = true` and a generous deflection.
3. If triangle count is still too high for a real-time viewer, pass the result to `meshoptimizer`.
