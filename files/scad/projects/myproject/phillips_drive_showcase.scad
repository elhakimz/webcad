// GEOL (Geometric Engine Optimized Library) - Phillips Drive Showcase
// Demonstrates high-performance parametric phillips driver bits.
// Evaluates in milliseconds using OpenCascade B-Rep!

use <GEOL/phillips_drive.scad>

echo("--- STARTING SHOWCASE: GEOL PHILLIPS DRIVE ---");

// 1. Phillips size #1 (Left, X = -15)
translate([-15, 0, 0]) {
    color("dodgerblue") {
        phillips_drive(size="#1", shaft=4, l=20);
    }
}

// 2. Phillips size #2 (Center, X = 0)
translate([0, 0, 0]) {
    color("gold") {
        phillips_drive(size="#2", shaft=6, l=20);
    }
}

// 3. Phillips size #3 (Right, X = 15)
translate([15, 0, 0]) {
    color("crimson") {
        phillips_drive(size="#3", shaft=6, l=20);
    }
}

echo("--- SHOWCASE PREPARED FOR VIEWING ---");
