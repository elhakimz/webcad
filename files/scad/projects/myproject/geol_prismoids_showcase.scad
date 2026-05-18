// GEOL (Geometric Engine Optimized Library) - Prismoids and Right Triangles Showcase
// Demonstrates native, high-performance prismoid, rounded prismoid, and right triangle modules.
// Created: 2026-05-18

use <GEOL/transforms.scad>
use <GEOL/shapes.scad>

$fn = 24;

// ==========================================================
// GRID ARRANGEMENT OF ALL USER EXAMPLES (Grid Spacing: 80mm)
// ==========================================================

// --- Row 1: Prismoids 1 to 4 ---

// Example 1: Rectangular Pyramid
echo("--- Example 1: Rectangular Pyramid ---");
translate([-120, 120, 0]) {
    color("crimson") {
        prismoid(size1=[40,40], size2=[0,0], h=20);
    }
}

// Example 2: Prism
echo("--- Example 2: Prism ---");
translate([-40, 120, 0]) {
    color("dodgerblue") {
        prismoid(size1=[40,40], size2=[0,40], h=20);
    }
}

// Example 3: Truncated Pyramid
echo("--- Example 3: Truncated Pyramid ---");
translate([40, 120, 0]) {
    color("gold") {
        prismoid(size1=[35,50], size2=[20,30], h=20);
    }
}

// Example 4: Wedge
echo("--- Example 4: Wedge ---");
translate([120, 120, 0]) {
    color("forestgreen") {
        prismoid(size1=[60,35], size2=[30,0], h=30);
    }
}


// --- Row 2: Prismoids 5 to 8 ---

// Example 5: Truncated Tetrahedron
echo("--- Example 5: Truncated Tetrahedron ---");
translate([-120, 40, 0]) {
    color("orchid") {
        prismoid(size1=[10,40], size2=[40,10], h=40);
    }
}

// Example 6: Inverted Truncated Pyramid
echo("--- Example 6: Inverted Truncated Pyramid ---");
translate([-40, 40, 0]) {
    color("orange") {
        prismoid(size1=[15,5], size2=[30,20], h=20);
    }
}

// Example 7: Right Prism
echo("--- Example 7: Right Prism ---");
translate([40, 40, 0]) {
    color("darkturquoise") {
        prismoid(size1=[30,60], size2=[0,60], shift=[-15,0], h=30);
    }
}

// Example 8: Shifting/Skewing
echo("--- Example 8: Shifting/Skewing ---");
translate([120, 40, 0]) {
    color("magenta") {
        prismoid(size1=[50,30], size2=[20,20], h=20, shift=[15,5]);
    }
}


// --- Row 3: Rounded Prismoids 1 to 4 ---

// Rounded Example 1: Rounded Pyramid
echo("--- Rounded Example 1: Rounded Pyramid ---");
translate([-120, -40, 0]) {
    color("teal") {
        rounded_prismoid(size1=[40,40], size2=[0,0], h=25, r=5);
    }
}

// Rounded Example 2: Centered Rounded Pyramid
echo("--- Rounded Example 2: Centered Rounded Pyramid ---");
translate([-40, -40, 0]) {
    color("blueviolet") {
        rounded_prismoid(size1=[40,40], size2=[0,0], h=25, r=5, center=true);
    }
}

// Rounded Example 3: Disparate Top and Bottom Radii
echo("--- Rounded Example 3: Disparate Top and Bottom Radii ---");
translate([40, -40, 0]) {
    color("coral") {
        rounded_prismoid(size1=[40,60], size2=[40,60], h=20, r1=3, r2=10, $fn=24);
    }
}

// Rounded Example 4: Shifting/Skewing
echo("--- Rounded Example 4: Shifting/Skewing ---");
translate([120, -40, 0]) {
    color("limegreen") {
        rounded_prismoid(size1=[50,30], size2=[20,20], h=20, shift=[15,5], r=5);
    }
}


// --- Row 4: Right Triangles 1 and 2 ---

// Right Triangle Example 1: Centered
echo("--- Right Triangle Example 1: Centered ---");
translate([-40, -120, 0]) {
    color("yellowgreen") {
        right_triangle([60, 10, 40], center=true);
    }
}

// Right Triangle Example 2: Non-Centered
echo("--- Right Triangle Example 2: Non-Centered ---");
translate([40, -120, 0]) {
    color("tomato") {
        right_triangle([60, 10, 40]);
    }
}
