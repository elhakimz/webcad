// GEOL (Geometric Engine Optimized Library) - Sliders Showcase
// Demonstrates high-performance carriage sliders and rails.
// Evaluates in milliseconds using OpenCascade B-Rep!

use <GEOL/transforms.scad>
use <GEOL/sliders.scad>

echo("--- STARTING SHOWCASE: GEOL SLIDERS & RAILS ---");

// 1. Assembled Slider & Rail Combination (Center, X = 0)
// Demonstrates precise 0.2mm slop tolerances for absolute alignment
translate([0, 0, 0]) {
    color("dodgerblue") {
        rail(l=100, w=15, h=10, chamfer=1.5, ang=45);
    }
    translate([0, 0, 5]) {
        color("gold") {
            slider(l=40, w=15, h=10, chamfer=1.5, base=6, wall=4, ang=45, slop=0.2);
        }
    }
}

// 2. Standalone Rail (Left, X = -45)
// Showcases V-groove guide track profiles and end attack angles
translate([-45, 0, 0]) {
    color("deepskyblue") {
        rail(l=100, w=15, h=10, chamfer=1.5, ang=45);
    }
}

// 3. Standalone Slider Block (Right, X = 45)
// Showcases V-protrusion wedges and secure side mounting walls
translate([45, 0, 5]) {
    color("crimson") {
        slider(l=40, w=15, h=10, chamfer=1.5, base=6, wall=4, ang=45, slop=0.2);
    }
}

echo("--- SHOWCASE PREPARED FOR VIEWING ---");
