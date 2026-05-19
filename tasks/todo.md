# Implementation Plan - Fixing GEOL shapes.scad 3D Printing Geometry Bugs

## Tasks

- [x] Fix sign error in `thinning_triangle`'s diagonal cut and brace rotations (`dang` -> `-dang`).
- [x] Refactor `braced_thinning_wall` diagonal cross-braces to use watertight, high-performance extruded polygons (`linear_extrude` + `polygon` diamond) instead of non-uniformly scaled cubes which fail in OpenCascade.
- [x] Verify both modules evaluate and render perfectly.
- [x] Capture lessons in `tasks/lessons.md`.

## MathUtils Performance Optimization Tasks

- [x] Implement O(1) iterative De Boor's algorithm inside `evaluateSplinePoint` (Issue 1).
- [x] Implement robust quadratic Newton-Raphson iteration inside `distancePointToEllipse` (Issue 2).
- [x] Hoist static `ACI_COLORS` lookup table to module scope in `aciToRgb` (Issue 3).
- [x] Ensure non-destructive sorting connected chains in `sortConnected` using deep cloning (Issue 4).
- [x] DRY centralized branchless `normalizeAngle` utility implementation (Issue 5).
- [x] Hoist edge length calculations out of vertex loops in `calculatePolygonVerticesByEdge` (Issue 6).
- [x] Eliminate redundant trig evaluations in `reflectPointAcrossLine` (Issue 7).
- [x] Verify both `FastMath.test.ts` and `Scad.test.ts` pass successfully.

## 3D Spiral Polyline Sketch Generator
- [x] Refine drafting polyline model to support Z coordinate on `PolylineVertex`.
- [x] Update SCAD interpreter mapping to parse `[x,y,z]` coordinates in `2d.polyline`.
- [x] Adapt Three.js rendering viewport to support true 3D non-planar polylines and adapt thickness quads.
- [x] Create pure sketch-based `spiral_polyline.scad` under `generators/sketch/`.
- [x] Fix 3D sweep spine path Z-coordinate extraction in `SweepGeometryUtil.ts` to respect non-planar polylines.
- [x] Verify using unit tests and ensure ESLint compliance.
