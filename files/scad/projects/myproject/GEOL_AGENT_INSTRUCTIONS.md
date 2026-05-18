# GEOL (Geometric Engine Optimized Library) - AI Agent Instruction Manual

This document provides comprehensive instructions and best practices for AI agents (and human developers) designing high-performance 3D CAD geometry in WebCAD using the **GEOL** library.

---

## 1. Core Philosophy: Why GEOL Wins

When working in web-based CAD systems (such as WebCAD running OpenCascade via WebAssembly), standard geometric libraries like BOSL often cause **extreme CPU overheating, memory bloat, and long rendering hangs**.

### ❌ The BOSL Polyhedron Approach
* **How it works**: Computes massive arrays of 3D points in JavaScript loops, manually rotates coordinates to form helices/sweeps, sews triangles, and feeds a huge `polyhedron(points, faces)` structure to the CAD engine.
* **Impact**: Pegs the browser's single-threaded JS engine at 100%, generates massive garbage collection overhead, and forces heavy data transfers to the worker, causing severe thermal throttling.

### 🟢 The GEOL Native Sweep Approach
* **How it works**: Generates simple, lightweight 2D polygons in JS (takes under **0.1 milliseconds**). Hands these closed profile wires off to the highly optimized, WebAssembly-compiled **OpenCascade C++ kernel** to perform native sweeps (`rotate_extrude` or `linear_extrude` with `twist`).
* **Impact**: Compiles instantly, uses near-zero memory, guarantees 100% watertight manifold topology, and keeps your CPU cool!

---

## 2. Importing GEOL Modules

Always use relative paths to import GEOL modules inside your SCAD files:

```openscad
use <GEOL/transforms.scad>
use <GEOL/shapes.scad>
use <GEOL/masks.scad>
use <GEOL/threading.scad>
use <GEOL/paths.scad>
use <GEOL/beziers.scad>
```

---

## 3. Module API Reference

### 🛠️ GEOL/transforms.scad
Shortcuts for common transformations and distribution patterns.
* `move(x, y, z)`: Translation shortcut.
* `xrot(a)`, `yrot(a)`, `zrot(a)`: Rotation shortcuts around individual axes.
* `mirror_x()`, `mirror_y()`, `mirror_z()`: Mirror helpers that retain the original shape and add the mirrored one.
* `grid_spread(spacing_x, spacing_y, count_x, count_y)`: Distributes children in a symmetrical 2D grid centered at the origin.
* `radial_spread(r, count)`: Distributes children in a radial ring of radius `r`.

### 📐 GEOL/shapes.scad
Custom primitive shapes and treated solids.
* `hexagon(d, h)`: Centered hexagonal prism.
* `star_2d(r_outer, r_inner, points)`: 2D star profile polygon.
* `star_column(h, r_outer, r_inner, points, twist, scale, slices)`: Extruded star column.
* `beveled_cube(size, chamfer)`: Cube with all 4 vertical edges cleanly chamfered.
* `rounded_cube(size, fillet)`: Cube with all 4 vertical edges cleanly filleted.

### 😷 GEOL/masks.scad
Precision masking cutters built with boundary extensions to prevent coplanar face collisions.
* `chamfer_edge_mask(l, chamfer)`: Vertical edge bevel cutter.
* `fillet_edge_mask(l, fillet)`: Vertical edge round cutter.
* `chamfer_cylinder_mask(d, h, chamfer)`: Top outer cylinder rim-chamfer cutter.
* `fillet_cylinder_mask(d, h, fillet)`: Top outer cylinder rim-rounding cutter.
* `chamfer_hole_mask(d, h, chamfer)`: Internal countersink cutter.
* `fillet_hole_mask(d, h, fillet)`: Internal rounded entry lip cutter.

### 🔩 GEOL/threading.scad
Ultra-fast, native parametric threaded rods, nuts, and bolts.
* `threaded_rod(d, id, length, pitch, type)`: Generates a revolved thread rod. Supported types: `"V"` (UTS/ISO Symmetric), `"ACME"` / `"Trapezoidal"`, `"Square"`, and `"Buttress"`.
* `threaded_nut(hex_d, height, thread_d, thread_id, pitch, type)`: Double-chamfered hex nut with perfect internal threads.
* `threaded_bolt(thread_d, thread_id, thread_len, pitch, type, hex_d, head_h)`: Proportional, intersect-beveled bolt.

### 📈 GEOL/paths.scad
Arbitrary 3D sweeps, curve tracking, and visual wireframe debug tools.
* `extrude_from_to(pt1, pt2, twist, scale, slices)`: Extrudes 2D children between two arbitrary 3D coordinates.
* `extrude_2d_hollow(wall, height, twist, slices)`: Extrudes 2D children into a hollow shell.
* `extrude_2dpath_along_spiral(h, r, twist, steps)`: Sweeps 2D children along a helical spiral path.
* `extrude_2d_shapes_along_3dpath(path)`: Sweeps 2D children along an arbitrary 3D polyline path.
* `trace_polyline(pline, showpts, size, line_color)`: Visualizes 3D paths as tubes with custom gold/coral vertex spheres.
* `debug_polygon(points, paths)`: Visualizes a 2D polygon with color-coded markers (first vertex is gold, others alternate between crimson and blue).

### ♾️ GEOL/beziers.scad
Native recursive De Casteljau bezier path evaluation, closed curves, and 3D sweeps.
* `bez_point(curve, u)`: Recursive De Casteljau evaluator for Bezier curves of any degree N.
* `bez_tangent(curve, u)`: Recursive tangent vector evaluator for Bezier curves.
* `bezier_polyline(bezier, splinesteps, N)`: Converts a concatenated Bezier path into a flat polyline.
* `bezier_polygon(bezier, splinesteps, N)`: Creates a closed 2D polygon from a 2D Bezier path.
* `linear_extrude_bezier(bezier, height, splinesteps, N, twist, scale, slices)`: Linearly extrudes a closed 2D Bezier path.
* `rotate_extrude_bezier(bezier, splinesteps, N, angle)`: Revolve-extrudes a closed 2D Bezier path.
* `extrude_2d_shapes_along_bezier(bezier, splinesteps, N)`: Sweeps 2D children perpendicularly along a 3D Bezier curve.
* `trace_bezier(bez, N, size)`: Visualizes a Bezier control path with control points and a smooth interpolated path.

---

## 4. Key Rules for AI Agents

When editing or writing SCAD scripts utilizing the GEOL library, always follow these three strict mathematical rules:

### Rule 1: Always Prevent Coplanar Boundary Collisions
In OpenCascade's C++ boolean engine, subtracting two shapes that have exactly overlapping coplanar faces (e.g. subtracting a hole cutter sitting exactly at $z=5$ from a block whose top face is exactly at $z=5$) can cause a topological boundary collision.
* **The Solution**: Always design your masking cutters to extend slightly *past* the solid boundaries (e.g. sitting from $z=-1$ to $z=6$ instead of $z=0$ to $z=5$).
* **How GEOL does it**: All masks in `GEOL/masks.scad` feature built-in boundary extensions to ensure 100% robust boolean operations.

### Rule 2: Keep Revolved Profiles in the Positive Right Half-Plane ($x \ge 0$)
Revolving profiles via `rotate_extrude` around the Z-axis requires that all 2D profile coordinates reside strictly in the non-negative half-plane ($x \ge 0$).
* **The Risk**: Introducing points with negative X coordinates ($x < 0$) produces degenerate C++ solids and will trigger an Emscripten WASM worker crash (`wasmTable.get is not a function`).
* **The Solution**: When defining profiles for threads or circular sweeps, always keep points at $x \ge 0$.

### Rule 3: Leverage Native Sweeps Over Complex Unions
To build helical springs, screw drives, or twisted pipes:
* **Do NOT**: Union hundreds of individual translated segments (this causes rendering bottlenecks).
* **DO**: Translate your shape in 2D away from the origin in the XY plane, then apply a native `linear_extrude` with `twist` and `slices` to build a clean native coil instantly.
