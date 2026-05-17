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
*(Experimental)* Scales children. Currently uses non-uniform B-Rep scaling.

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
