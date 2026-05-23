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