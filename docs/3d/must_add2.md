# OpenCascade.js Advanced 3D Primitives & Operations

This document outlines the requirements and interaction models for complex 3D entities and algorithms in `OCCWorker.ts`.

## 1. Variable-Radius Cylinder / Cone (`frustum`)
Supports sharp cones, standard cylinders, and truncated cones (frustums).

### Technical Requirements:
- **API**: `BRepPrimAPI_MakeCone_1(R1, R2, H)`
- **Logic**: Unify `cylinder` and `cone` messages into a single `createFrustum` handler.
- **WASM**: Ensure `BRepPrimAPI_MakeCone_1` is exported.

### Interaction Model (Minimal):
1. **Center**: Click.
2. **Base Radius (R1)**: Move/Click.
3. **Height (H)**: Move vertically/Click.
4. **Top Radius (R2)**: Move horizontally. **ENTER** defaults $R2=0$ (Sharp Cone).

---

## 2. Polyhedron (`polyhedron`)
Builds a manifold solid from a list of points and face indices.

### Technical Requirements:
- **Vertex Management**: Use a Map to share `TopoDS_Vertex` objects by index.
- **Sewing**: Use `BRepOffsetAPI_Sewing` to stitch faces. This is more robust than manual `BRep_Builder` additions for orientation and edge merging.
- **Solidification**: `BRepBuilderAPI_MakeSolid` on the sewed shell.

### Interaction Model:
- **Face-Sketching**: User clicks vertices in sequence to define a face.
- **Boundary Highlighting**: Highlight "Naked Edges" (open boundaries) in RED to guide the user to a "water-tight" closure.
- **Auto-Bake**: Convert to `Solid3D` automatically once the shell is closed.

---

## 3. Convex Hull (`hull`)
Creates the smallest convex envelope around a set of points or shapes.

### Technical Requirements:
- **Extraction**: Tessellate input shapes (`BRepMesh_IncrementalMesh`) and extract all points.
- **Algorithm**: Use a JS-based **QuickHull** (e.g., `quickhull3d`) for performance.
- **Reconstruction**: Build a B-Rep solid from the resulting triangles using the **Polyhedron** pattern.

### Interaction Model:
- **Dynamic Container**: Selecting/moving child objects dynamically updates the "shrink-wrap" hull preview.
- **Live Preview**: Semi-transparent mesh updates in real-time as objects are added to the hull set.

---

## 4. Minkowski Sum (`minkowski`)
Dilation of a base shape by a "brush" shape.

### Technical Requirements:
- **Optimization**: Minkowski with a sphere is equivalent to a **3D Offset**. Use `BRepOffsetAPI_MakeOffsetShape` with `GeomAbs_Arc`.
- **General Case**: Requires decomposition into convex parts and pairwise unions (extremely slow).
- **Fallback**: Approximate complex brushes with their bounding boxes or low-poly versions.

### Interaction Model:
- **"Brush" Metaphor**: User picks a base and a brush.
- **Semantic Presets**: Provide "Round" (Sphere), "Square" (Box), and "Chamfer" styles.

---

## 5. Heightmap Surface (`surface`)
Creates 3D terrain/surfaces from image data or height grids.

### Technical Requirements:
- **API**: `GeomAPI_PointsToBSplineSurface` fits a smooth BSpline through an `NCollection_Array2` grid.
- **Interpolation vs Approximation**: Use interpolation for small grids; use approximation (with tolerance) for large image data.
- **Solidification**: Extrude boundary edges to $Z=0$ and add a bottom face to create a manifold solid.

### Interaction Model:
- **Image Import**: Drag-and-drop PNG/JPG.
- **Live Scaling**: Sliders for $Z$-Height and "Simplification" (Resolution).
- **Real-time Preview**: Low-poly mesh preview before committing to a B-Rep bake.
