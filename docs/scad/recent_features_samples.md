# WebCAD OpenSCAD Advanced Feature Samples

This document showcases working, visual, and highly descriptive SCAD scripts utilizing the recently introduced **Cone**, **Polyhedron**, and **Convex Hull** features. 

---

## 1. Cone Showcase (`cone_showcase.scad`)
The `cone` primitive creates a perfect sharp cone starting with a base radius `r` and tapering completely to a point at height `h`.

```openscad
// Showcase 1: Chess Pawn Core
union() {
  // Base ring (cylinder)
  cylinder(h=2, r=12, center=false);

  // Main body tapered support (cone)
  translate([0, 0, 2])
    cone(r=10, h=12, center=false);

  // Top neck transition (frustum via cylinder)
  translate([0, 0, 10])
    cylinder(r1=6, r2=4, h=6, center=false);

  // Spherical head
  translate([0, 0, 19])
    sphere(r=4);
}
```

---

## 2. Polyhedron Showcase (`polyhedron_showcase.scad`)
The `polyhedron` primitive constructs a custom 3D mesh boundary from an indexed set of 3D points and polygonal faces.

```openscad
// Showcase 2: 3D Pyramid
// Define the 5 vertices of a square-based pyramid
pyramid_points = [
  [0, 0, 0],     // 0: Base Bottom-Left
  [15, 0, 0],    // 1: Base Bottom-Right
  [15, 15, 0],   // 2: Base Top-Right
  [0, 15, 0],    // 3: Base Top-Left
  [7.5, 7.5, 12] // 4: Apex (Tip)
];

// Define the 5 polygonal faces (vertices in CCW order from the outside)
pyramid_faces = [
  [3, 2, 1, 0],  // Square base face
  [0, 1, 4],     // Side triangle 1
  [1, 2, 4],     // Side triangle 2
  [2, 3, 4],     // Side triangle 3
  [3, 0, 4]      // Side triangle 4
];

polyhedron(points=pyramid_points, faces=pyramid_faces);
```

---

## 3. Convex Hull Showcase (`hull_showcase.scad`)
The `hull` operation computes the minimal convex bounding solid enclosing all children. It is perfect for designing organic, rounded, or swept brackets and connecting parts.

```openscad
// Showcase 3: Rounded Barbell Bracket
hull() {
  // Left pivot anchor
  translate([-20, 0, 0])
    sphere(r=8);

  // Right pivot anchor
  translate([20, 0, 0])
    sphere(r=8);

  // Top structural riser
  translate([0, 0, 12])
    cube([10, 10, 4], center=true);
}
```
