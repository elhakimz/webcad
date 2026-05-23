// GEOL (Geometric Engine Optimized Library) - Linear Bearings Showcase
// Demonstrates high-performance parametric linear bearing clamp housings.
// Evaluates in milliseconds using OpenCascade B-Rep!

use <GEOL/linear_bearings.scad>

echo("--- STARTING SHOWCASE: GEOL LINEAR BEARINGS ---");

// 1. Standard LM8UU Housing (Left, X = -45)
// Demonstrates standard 8mm shaft inner bearing mount
translate([-45, 0, 0]) {
    color("dodgerblue") {
        lmXuu_housing(size=8, wall=2.5, tab=6, screwsize=3);
    }
}

// 2. Generic Custom Cartridge Housing (Center, X = 0)
// Demonstrates a larger custom bearing cartridge (e.g. 19mm outer diameter, 29mm length)
translate([0, 0, 0]) {
    color("gold") {
        linear_bearing_housing(d=19, l=29, wall=3, tab=8, screwsize=3);
    }
}

// 3. Larger LM12UU Housing (Right, X = 45)
// Demonstrates larger 12mm shaft nominal size housing
translate([45, 0, 0]) {
    color("crimson") {
        lmXuu_housing(size=12, wall=3, tab=8, screwsize=3);
    }
}

echo("--- SHOWCASE PREPARED FOR VIEWING ---");
