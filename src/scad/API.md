# WebCAD OpenSCAD API Reference

WebCAD provides a high-performance OpenSCAD interpreter powered by the OpenCascade.js 3D kernel. This document outlines the supported primitives, transformations, and logic.

## 3D Primitives

### `cube(size, center)`
Creates a rectangular prism.
*   **`size`**: A single number (for a cube) or a 3-element array `[x, y, z]`. Default: `1`.
*   **`center`**: If `true`, the object is centered at the origin. If `false`, it is placed in the positive octant. Default: `false`.

### `sphere(r | d)`
Creates a sphere at the origin.
*   **`r`**: Radius.
*   **`d`**: Diameter (overrides `r`).
*   **`$fn`**: (Supported soon) Controls the smoothness of the mesh.

### `cylinder(h, r | r1, r2 | d | d1, d2, center)`
Creates a cylinder or a cone.
*   **`h`**: Height.
*   **`r`**: Radius of both top and bottom.
*   **`r1`, `r2`**: Bottom and top radii (for cones/tapered cylinders).
*   **`center`**: If `true`, the cylinder is centered vertically. Default: `false`.

### `cone(r | d, h, center)`
Creates a cone at the origin.
*   **`r`**: Radius of the base. Default: `1`.
*   **`d`**: Diameter of the base (overrides `r`).
*   **`h`**: Height. Default: `1`.
*   **`center`**: If `true`, the cone is centered vertically. Default: `false`.

### `polyhedron(points, faces)`
Creates a custom 3D polyhedron shape from a list of 3D vertices and a list of polygonal faces.
*   **`points`**: An array of 3D coordinate arrays `[[x1,y1,z1], [x2,y2,z2], ...]`.
*   **`faces`**: An array of index lists mapping vertices to form faces (e.g., `[[0,1,2], [0,2,3], ...]`).

---

## 2D CAD Drafting & Primitives

### Standard 2D Region Primitives
These primitives generate 2D region outlines, which can be combined or extruded.
*   **`square(size, center)`**: Rectangle of `size` (single number or `[x, y]`).
*   **`circle(r | d)`**: Circle with radius `r` or diameter `d`.
*   **`polygon(points)`**: Custom polygon boundary from coordinate list `[[x1,y1], [x2,y2], ...]`.

### High-Fidelity 2D CAD Primitives (`2d.*`)
These modules draw high-fidelity drafting elements directly into the active document context, making them fully snappable, selectable, and ready for true DXF export.
*   **`2d.line(p1, p2 | x1, y1, x2, y2, color, layer)`**: A 2D drafting line.
*   **`2d.circle(center | cx, cy, r | d, color, layer)`**: A high-fidelity circle.
*   **`2d.arc(center | cx, cy, r, start_angle, end_angle, ccw, color, layer)`**: A 2D drafting arc with angles in degrees.
*   **`2d.polyline(points, closed, color, layer)`**: A snappable 2D polyline, where points can be `[x,y]` arrays or objects with bulge parameters `[x, y, bulge]`.
*   **`2d.mtext(text, center | cx, cy, height, width, rotation, color, layer)`**: High-fidelity multi-line technical text.
*   **`2d.text(text, center | cx, cy, height, rotation, color, layer)`**: Single-line text.
*   **`2d.hatch(pattern, points, scale, angle, color, layer)`**: Fills a 2D closed loop contour with drafting pattern hatching (e.g. `"ANSI31"`).

---

## Technical Dimensioning Annotations (`dim.*`)

These modules draw professional snappable dimension annotations. They automatically measure distances and place technical dimension arrows, extension lines, and labels.

*   **`dim.linear(p1, p2, offset, color, layer)`**: Horizontal or vertical dimensioning between `p1` and `p2` placed at `offset`.
*   **`dim.aligned(p1, p2, offset, color, layer)`**: Aligned dimensioning measuring the direct diagonal distance.
*   **`dim.angular(p1, p2, offset, color, layer)`**: Angular dimension line.
*   **`dim.radial(p1, p2, offset, color, layer)`**: Radius dimensioning for circles/arcs.
*   **`dim.diameter(p1, p2, offset, color, layer)`**: Diameter dimensioning.
*   **`dim.dimension(type, p1, p2, offset, color, layer)`**: Generic dimension annotation where type can be `"LINEAR"`, `"ALIGNED"`, `"ANGULAR"`, `"RADIUS"`, or `"DIAMETER"`.

---

## Boolean Operations

All boolean operations support an arbitrary number of children. Multiple children are automatically unioned if necessary.

### `union() { ... }`
Combines all child shapes into a single manifold solid.

### `hull() { ... }`
Computes the 3D Convex Hull (minimal convex bounding volume) enclosing all child geometries.
*   **Note**: Requires at least 4 non-coplanar points total across children.

### `difference() { ... }`
Subtracts all subsequent children from the first child.
```javascript
difference() {
  cube(10);
  sphere(r=5);
}
```

### `intersection() { ... }`
Creates a solid representing the overlapping volume of all children.

---

## Transformations

Transformations produce a **new copy** of the geometry, leaving the original handles intact if needed (though the SCAD interpreter manages this automatically).

### `translate([x, y, z]) { ... }`
Moves children by the specified vector.

### `rotate([x, y, z]) { ... }`
Rotates children around the X, Y, and Z axes (in degrees).

### `scale([x, y, z]) { ... }`
Scales children. Uses non-uniform B-Rep scaling.

### `mirror([x, y, z]) { ... }`
Mirrors children across a plane perpendicular to the specified vector.

### `linear_extrude(height, center) { ... }`
Extrudes 2D region primitives (e.g. `circle`, `square`, `polygon`) into 3D shapes along the Z-axis.
*   **`height`**: Height of the extrusion. Default: `1`.
*   **`center`**: If `true`, the extruded solid is centered along the Z-axis. Default: `false`.

---

## Modular Design & Libraries

WebCAD fully supports OpenSCAD's modular directory structure, recursive imports, and standard library architectures like **BOSL**.

### `include <path>` / `include "path"`
Imports all variables, constants, functions, modules, and top-level geometry from the target file into the current scope.
*   **Example**: `include <BOSL/constants.scad>`

### `use <path>` / `use "path"`
Imports only the functions and modules defined in the target file. It completely ignores top-level variable declarations, constants, and geometry instantiations, preventing them from polluting your main file's scope.
*   **Example**: `use <BOSL/threading.scad>`

---

## Language Logic

### Variables & Expressions
Supports standard mathematical operators and variable assignment.
```javascript
thickness = 2;
radius = thickness * 5;
cube([radius, 10, thickness]);
```

### Modules (User Defined)
Modules allow you to group geometry and reuse it.
```javascript
module hole(pos) {
  translate(pos) cylinder(h=20, r=2);
}

difference() {
  cube(20);
  hole([10, 10, 0]);
}
```

### Functions (User Defined)
Functions allow you to compute values or construct customized data records.
```javascript
function double(x) = x * 2;
function add(a, b) = a + b;
```

### Control Flow
*   **`for(i = [start:end])`**: Repeatedly renders geometry.
*   **`if(condition) { ... } else { ... }`**: Conditional rendering.

---

## Technical Integration Notes

### Performance & Memory
WebCAD uses an **Off-Main-Thread Execution** model.
1.  **CPU Phase**: The script is parsed and evaluated on the main thread (very fast).
2.  **GPU Phase**: The resulting CSG tree is sent to the `OCCWorker`.
3.  **WASM Phase**: OpenCascade executes the Booleans in C++.
4.  **Cleanup**: Intermediate shapes are automatically released from WASM memory after rendering to prevent browser crashes.

### Implicit Union
Per OpenSCAD standards, if a module or a transformation has multiple children, they are implicitly unioned before the operation is applied.

### Unit Scale
All dimensions are interpreted as **millimeters (mm)** by default in WebCAD.
