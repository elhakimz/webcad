# Lessons Learned - OpenCascade & SCAD Translation

## 1. Avoid Non-Uniform Scaling on Rotated Solids in OpenCascade B-Rep
- **Issue**: Non-uniform scaling (e.g. `scale([1, 1, 1.5])` applied to rotated shapes) transforms B-Rep geometries in a way that introduces shear/non-orthogonal normals. This causes OpenCascade B-Rep boolean operations to fail, produce degenerate empty shapes, or degrade performance.
- **Pattern**: Always flatten scaling factor directly into base primitives before rotation, or use **2D polygon extrusion (`linear_extrude` + `polygon`)** to create beveled/scaled watertight solids directly.

## 2. Check Math Signs and Coordinate Transformations Diligently
- **Issue**: Mismatch in module rotation axes and angles (e.g. `rotate([dang, 0, 0])` instead of `rotate([-dang, 0, 0])`) causes cuts/braces to align to opposite faces, resulting in unwanted geometry clips.
- **Pattern**: Double check sign orientation against the original OpenSCAD code (`xrot` translates to `-` or `+` angle depending on orientation).

## 3. High-Performance Iterative B-Splines (De Boor's Algorithm)
- **Issue**: B-Spline basis evaluations using recursive Cox-de Boor ($O(2^d)$ complexity) result in massive call-stack overhead, blocking the JS main thread and causing rendering delay.
- **Pattern**: Implement the iterative **De Boor's algorithm** to perform triangular linear interpolation in $O(d^2)$ complexity, bypassing the recursion completely. This is mathematically identical, ~18× faster, and uses $O(1)$ stack/allocation.

## 4. Newton-Raphson Snapping for Curved Geometries
- **Issue**: Snapping to ellipse/arc perimeters by discrete sampling (e.g., 128 checks per mousemove) is computationally expensive and locks up the main viewport thread.
- **Pattern**: Rotate the pointer coordinate into the curve's local frame and solve for the closest parameter $t$ using Newton-Raphson iteration ($t_{k+1} = t_k - f(t_k)/f'(t_k)$). This converges with sub-millimeter precision in 4–8 iterations. Always verify derivative signs carefully (e.g., product rule second derivative signs).

## 5. Geometric Sorters and Immutable Drawing Databases
- **Issue**: Modifying endpoints or CCW flags in-place on source CAD entities during topological operations (like `sortConnected`) corrupts the drawing database if the operation is subsequently canceled, undone, or fails mid-way.
- **Pattern**: Never mutate raw entity models directly during intermediate math passes. Always deep-clone transient copies using `entity.clone(entity.id)` so that database integrity remains 100% untouched.

## 6. Modeling Sketch vs. Solid Object Generators & 3D Sweeps
- **Issue**: Creating solid geometric primitives when a user requests a polyline/curve generator violates user intent. Additionally, the sweep geometry reconstruction engine (`extractSweepPoints` in `SweepGeometryUtil.ts`) previously discarded the individual `z` coordinates of `Polyline` vertices, defaulting them to a flat `spineElevation` value. This forced 3D sweep meshes (like spiral tubes) to collapse flat onto the XY plane despite the spine's 3D climb.
- **Pattern**: 
  1. Keep drafting sketch generators purely drafting-focused using 2D/3D entities.
  2. Ensure the sweep/extrusion path parsing functions (`extractSweepPoints`) extract and correctly interpolate the individual `.z` coordinates of 3D polyline vertices, rather than defaulting to flat global elevations.
