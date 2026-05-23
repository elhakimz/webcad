// GEOL (Geometric Engine Optimized Library) - Torx Drive Showcase
// Demonstrates high-performance parametric Torx driver bits.
// Evaluates in milliseconds using OpenCascade B-Rep!

use <GEOL/torx_drive.scad>

echo("--- STARTING SHOWCASE: GEOL TORX DRIVE ---");

// 1. Torx size T10 (Left, X = -15)
translate([-15, 0, 0]) {
    color("dodgerblue") {
        torx_drive(size=10, l=15);
    }
}

// 2. Torx size T20 (Center, X = 0)
translate([0, 0, 0]) {
    color("gold") {
        torx_drive(size=20, l=15);
    }
}

// 3. Torx size T30 (Right, X = 15)
translate([15, 0, 0]) {
    color("crimson") {
        torx_drive(size=30, l=15);
    }
}

echo("--- SHOWCASE PREPARED FOR VIEWING ---");
