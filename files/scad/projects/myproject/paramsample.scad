/*
 * @file parametric_short_example.scad
 * @brief Short example of a parametric model
 * @copyright Cameron K. Brooks 2025
 * @license CC-BY-SA-4.0
 * @details This is a short example of a parametric model that creates a dovetail joint.
 */

X = 10; // Width of the base
Y = 6; // Length of the object

A = 4; // Length of the dovetail
B = 2; // Width of the top edge of the dovetail
C = 4; // Width of the lower edge of the dovetail
D = 0.1; // Delta value for allowance

H = 2; // Height of the object

// Module to define a 2D polygon
module base_shape(X, Y, A, B, C, D, M = false) {
  AA = M ? A : -A; // Invert the dovetail if female
  BB = M ? B - D : B; // Apply allowance to male B dimension
  CC = M ? C - D : C; // Apply allowance to male C dimension
  polygon(
    points=[
      [0, 0], // Bottom-left corner
      [X, 0], // Bottom-right corner
      [X, Y], // Top-right corner
      [X / 2 - BB / 2, Y], // Top-right corner of the dovetail
      [X / 2 - CC / 2, Y + AA], // Bottom-right corner of the dovetail
      [X / 2 + CC / 2, Y + AA], // Bottom-left corner of the dovetail
      [X / 2 + BB / 2, Y], // Top-left corner of the dovetail
      [0, Y], // Top-left corner
    ]
  );
}

// Linear extrusion to create the 3D object
linear_extrude(H) {
  base_shape(X, Y, A, B, C, D, true);
  mirror([0, 1, 0]) translate([0, -Y * 2, 0]) base_shape(X, Y - D / 2, A, B, C, D, false);
}