// OpenSCAD Primitive Solids Test Suite
// Based on: https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Primitive_Solids

$fn = 24; // Standard resolution for curves

// ==========================================
// ROW 1: Standard Primitives (Top Row)
// ==========================================

// 1. Centered Cube
translate([-45, 40, 0]) {
    color("dodgerblue") 
        cube(size = [20, 20, 20], center = true);
}

// 2. Sphere using Radius (r)
translate([0, 40, 0]) {
    color("limegreen") 
        sphere(r = 12);
}

// 3. Centered Cylinder
translate([45, 40, 0]) {
    color("orangered") 
        cylinder(h = 25, r = 10, center = true);
}


// ==========================================
// ROW 2: Polyhedron Primitive (Center)
// ==========================================

// 4. Square-based Pyramid (Polyhedron)
// Points defined in 3D space, base at z=0, apex at z=18
pyramid_points = [
  [-10, -10, 0],  // 0: Bottom-Left
  [10, -10, 0],   // 1: Bottom-Right
  [10, 10, 0],    // 2: Top-Right
  [-10, 10, 0],   // 3: Top-Left
  [0, 0, 18]      // 4: Apex
];

// Polygonal faces (vertices in CCW order when looking from the outside)
pyramid_faces = [
  [3, 2, 1, 0],   // Base face
  [0, 1, 4],      // Front triangle
  [1, 2, 4],      // Right triangle
  [2, 3, 4],      // Back triangle
  [3, 0, 4]       // Left triangle
];

translate([0, 0, 0]) {
    color("crimson") 
        polyhedron(points = pyramid_points, faces = pyramid_faces);
}


// ==========================================
// ROW 3: Custom Parameters & Cones (Bottom Row)
// ==========================================

// 5. Non-Centered Rectangular Block (Cube with 3D size array)
translate([-45, -40, 0]) {
    color("gold") 
        cube(size = [15, 20, 25], center = false);
}

// 6. Sphere using Diameter (d)
translate([0, -40, 0]) {
    color("mediumorchid") 
        sphere(d = 20);
}

// 7. Cone (Cylinder with different r1 and r2)
translate([45, -40, 0]) {
    color("darkturquoise") 
        cylinder(h = 25, r1 = 12, r2 = 3, center = false);
}
