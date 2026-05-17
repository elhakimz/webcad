# Lessons Learned: WebCAD 3D Stabilization

## 1. OpenCascade Memory Safety: The "Maker" Trap
**Pattern**: Any shape returned by a Maker (e.g., `BRepPrimAPI_MakeBox`) is a reference owned by that Maker. Deleting the Maker invalidates the shape immediately.
**Correction**: Always use a `detachShape` helper to create an independent copy BEFORE deleting the Maker.
```typescript
function detachShape(oc, shape) {
  const loc = new oc.TopLoc_Location_1();
  const copy = shape.Located(loc); // identity copy is high-performance
  loc.delete();
  return copy;
}
```

## 2. WebWorker Persistence: STEP vs BRep
**Pattern**: `BRepTools` can be unstable in some Emscripten builds due to string/binary encoding issues.
**Correction**: Use `STEPControl_Writer` and `STEPControl_Reader`. They are more robust and provide better interoperability. 

## 3. WASM Filesystem: Lazy Loading
**Pattern**: `reader.ReadFile(path)` only parses the file structure. The actual geometric data is streamed from the FS during `TransferRoots`.
**Correction**: NEVER `unlink` the temporary file immediately after `ReadFile`. Wait until the entire `TransferRoots` and `OneShape` sequence is complete.

## 4. Persistence Integrity Guards
**Pattern**: Failed exports often produce valid STEP headers but zero geometric data (approx 20-40 bytes).
**Correction**: Implement a minimum byte-length guard (e.g., `bytes.length > 50`) before saving to IndexedDB. This prevents a "corrupted session" from overwriting healthy historical data in the database.

## 5. Diagnostic Introspection
**Pattern**: WASM handles appear as `{}` in `console.log`.
**Correction**: Use specialized introspection helpers to log meaningful metadata:
```typescript
function shapeInfo(oc, shape) {
  const type = shape.ShapeType(); // Returns Enum value
  const isNull = shape.IsNull();
  // Count faces via TopExp_Explorer
  return `Type=${type} IsNull=${isNull} ...`;
}
```

## 6. Path Sensitivity in Emscripten FS
**Pattern**: Long or special-character paths in the virtual filesystem can cause silent failures in some OCC bindings.
**Correction**: Use simple, hardcoded paths for temporary operations (e.g., `/exp.step`, `/imp.step`) and clear them immediately after use.

## 7. UI Docked Panel Layout & Ergonomics
**Pattern**: Rotating docked panel/toolbar headers (e.g., using `writing-mode: vertical-rl` and `transform: rotate(180deg)`) on side docks to save horizontal space might seem ergonomic but negatively impacts readability and visual appeal.
**Correction**: Keep docked toolbar/panel headers horizontal on top of the toolbar grid, using a standard stacking layout (`flex-direction: column` and standard horizontal text header) to maintain high readability, consistency, and professional CAD aesthetics.

## 8. Three.js Scene Graph Lifecycle & Group Removal
**Pattern**: In hierarchical 3D scene graphs, temporary or preview objects are often nested under a specific sub-group (e.g., `mainGroup`) to support mode-toggling and geometric grouping.
**Correction**: Never use `this.scene.remove(obj)` to delete nested/grouped objects. In Three.js, `scene.remove(obj)` is a silent no-op if `obj` is not a direct child of the scene. Always use `obj.parent?.remove(obj)` to ensure robust, parent-relative removal regardless of where the object resides in the hierarchy. This prevents "hall of mirrors" rendering duplicates, memory leaks, and trailing outline artifacts.

## 9. Non-Uniform Scaling & Analytic Surface Integrity
**Pattern**: Applying `BRepBuilderAPI_GTransform` to standard CAD shapes (e.g., cylinders, spheres, cones) converts their analytic algebraic surfaces into complex, computationally expensive BSpline representations.
**Correction**: Always check if scaling factors are uniform (`fx === fy === fz`) with a small tolerance. If uniform, fall back to `BRepBuilderAPI_Transform` and `gp_Trsf.SetScale` to retain primitive properties, keeping geometry lightweight and performant.

## 10. Handedness-Aware Mirroring of Solids
**Pattern**: Applying direct mirror transforms can invert the coordinate system orientation, resulting in negative volumes or mathematically "inside-out" solids that cause downstream boolean operations to fail.
**Correction**: Upgrade mirroring to convert `gp_Trsf.SetMirror` matrices into `gp_GTrsf` applied with `copyGeometry = true` (via `BRepBuilderAPI_GTransform(shape, gTrsf, true)`). This correctly updates the face/normal orientation and determinant properties of the solid.

## 11. Mathematical Singularity Prevention on Affine Transformations
**Pattern**: Arbitrary user-defined custom transform matrices (`multmatrix`) can contain degenerate scale factors or zero scaling on one axis, collapsing 3D volumes into 2D planes and causing infinite loops in the solver.
**Correction**: Always implement strict determinant calculation validation guards ($\vert \det(M) \vert \ge 10^{-9}$) to reject singular affine matrices before they reach the OpenCascade geometric kernel.

## 12. OpenCascade MakeCone Domain Exceptions
**Pattern**: Constructing a frustum cone via `BRepPrimAPI_MakeCone` throws a silent OpenCascade C++ domain exception (often returning a numeric pointer address error like `16711256` in WASM) if the base radius ($R_1$) and top radius ($R_2$) are equal.
**Correction**: Implement a tolerance guard in the worker/creator. If the radii are mathematically equal within floating-point tolerance (e.g., $10^{-6}$), gracefully fall back to creating a standard cylinder primitive (`BRepPrimAPI_MakeCylinder`) instead of a degenerate cone frustum.

## 13. OpenCascade Emscripten Constructor Arity and Suffixes
**Pattern**: In Emscripten/WebIDL, overloaded C++ constructors with default arguments are often bound as either a single constructor requiring the maximum number of arguments, or as multiple suffixed properties (e.g., `Class_1`, `Class_2`, etc.) in the WASM build.
**Correction**: Design defensive instantiation helpers that wrap creation inside a try-catch cascading block, testing the signature with the most arguments down to zero arguments, or testing multiple suffixed variants (e.g. `BRepBuilderAPI_Sewing(tolerance, option, cutting, nonManifold, whichSide)` -> `BRepBuilderAPI_Sewing(tolerance)`). This guarantees constructor safety across different target builds.

## 14. Universal Progress Indicator and WebIDL Overload Resolution
**Pattern**: Methods expecting a progress reference (like `sewing.Perform(progress)`) will throw signature errors if called with 0 arguments or if passed `undefined` when the target class (like `Message_ProgressRange`) is not bound in the WASM module.
**Correction**: Inspect the keys of the `oc` WASM object at runtime to detect bound classes (such as `Handle_Message_ProgressIndicator` or `Message_ProgressRange`), construct the appropriate null reference handle or progress indicator object, and pass it explicitly. This satisfies the WebIDL overload resolution without throwing argument count exceptions.

