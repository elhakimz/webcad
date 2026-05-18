// GEOL (Geometric Engine Optimized Library) - Beziers Showcase
// Demonstrates trace_bezier, linear_extrude_bezier, rotate_extrude_bezier, and 3D sweeps.
// Created: 2026-05-18

use <GEOL/transforms.scad>
use <GEOL/beziers.scad>

$fn = 32;

// ==========================================
// Test 1: trace_bezier
// ==========================================
echo("--- STARTING TEST 1: trace_bezier ---");
translate([-25, 25, 0]) {
    // Cubic bezier path: start, control 1, control 2, end
    bez = [[0, 0, 0], [10, 30, 10], [30, -10, 20], [40, 20, 0]];
    trace_bezier(bez, N=3, size=1.0);
}


// ==========================================
// Test 2: linear_extrude_bezier
// ==========================================
echo("--- STARTING TEST 2: linear_extrude_bezier ---");
translate([25, 25, 0]) {
    color("crimson") {
        // A closed 2D bean shape using 2 connected cubic Bezier segments (total 7 points)
        bean_bez = [
            [-10, 0], [-15, 10], [0, 15], [10, 0],
            [15, -10], [-5, -10], [-10, 0]
        ];
        linear_extrude_bezier(bean_bez, height=20, splinesteps=16, twist=60, scale=0.8);
    }
}


// ==========================================
// Test 3: rotate_extrude_bezier
// ==========================================
echo("--- STARTING TEST 3: rotate_extrude_bezier ---");
translate([-25, -25, 0]) {
    color("gold") {
        // A closed 2D cup cross-section in positive half-plane x >= 0
        // (Outer curve, top lip, inner curve, base)
        cup_bez = [
            [5, 0], [12, 0], [15, 10], [15, 20],
            [13, 20], [12, 10], [5, 2], [5, 0]
        ];
        rotate_extrude_bezier(cup_bez, splinesteps=16);
    }
}


// ==========================================
// Test 4: extrude_2d_shapes_along_bezier
// ==========================================
echo("--- STARTING TEST 4: extrude_2d_shapes_along_bezier ---");
translate([10, -25, -5]) {
    color("dodgerblue") {
        // A 3D cubic Bezier curve sweep path
        path_bez = [[0, 0, 0], [10, 10, 10], [20, 10, -10], [35, 0, 0]];
        extrude_2d_shapes_along_bezier(path_bez, splinesteps=16) {
            circle(r=3.5, $fn=16);
        }
    }
}
