// GEOL (Geometric Engine Optimized Library) - Cylindroids Showcase
// Demonstrates native, high-performance cylinders, tapered cones, hollow tubes, and torus rings.
// Created: 2026-05-18

use <GEOL/transforms.scad>
use <GEOL/shape_cyl.scad>

$fn = 32;

// ==========================================================
// GRID ARRANGEMENT OF ALL USER EXAMPLES (Spacing: 80mm)
// ==========================================================

// --- Row 1: cyl() Examples 1 to 3 ---

// Example 1: By Radius
echo("--- Example 1: By Radius ---");
translate([-120, 120, 0]) {
    color("crimson") {
        translate([-15, 0, 0]) cyl(l=40, r=10);
        translate([15, 0, 0]) cyl(l=40, r1=10, r2=5);
    }
}

// Example 2: By Diameter
echo("--- Example 2: By Diameter ---");
translate([-40, 120, 0]) {
    color("dodgerblue") {
        translate([-15, 0, 0]) cyl(l=40, d=25);
        translate([15, 0, 0]) cyl(l=40, d1=25, d2=10);
    }
}

// Example 3: Chamfering
echo("--- Example 3: Chamfering ---");
translate([40, 120, 0]) {
    color("gold") {
        translate([-30, 0, 0]) cyl(l=40, d=40, chamfer=7);
        translate([0, 0, 0])  cyl(l=40, d=40, chamfer=7, chamfang=30, from_end=false);
        translate([30, 0, 0])  cyl(l=40, d=40, chamfer=7, chamfang=30, from_end=true);
    }
}

// Example 4: Rounding/Filleting
echo("--- Example 4: Rounding/Filleting ---");
translate([120, 120, 0]) {
    color("forestgreen") {
        cyl(l=40, d=40, fillet=10);
    }
}


// --- Row 2: cyl() Examples 5 & 6, downcyl() ---

// Example 5: Heterogenous Chamfers and Fillets
echo("--- Example 5: Heterogenous Chamfers and Fillets ---");
translate([-120, 40, 0]) {
    color("orchid") {
        translate([-30, 0, 0]) cyl(l=40, d=40, fillet1=15, orient=ORIENT_X);
        translate([0, 0, 0])  cyl(l=40, d=40, chamfer2=5, orient=ORIENT_X);
        translate([30, 0, 0])  cyl(l=40, d=40, chamfer1=12, fillet2=10, orient=ORIENT_X);
    }
}

// Example 6: Putting it all together
echo("--- Example 6: Putting it all together ---");
translate([-40, 40, 0]) {
    color("orange") {
        cyl(l=40, d1=25, d2=15, chamfer1=10, chamfang1=30, from_end=true, fillet2=5);
    }
}

// downcyl() Examples
echo("--- downcyl() Examples ---");
translate([40, 40, 0]) {
    color("darkturquoise") {
        translate([-15, 0, 0]) downcyl(r=20, h=40);
        translate([15, 0, 0])  downcyl(r1=10, r2=20, h=40);
    }
}


// --- Row 3: xcyl(), ycyl(), zcyl() ---

// xcyl() Examples
echo("--- xcyl() Examples ---");
translate([-120, -40, 0]) {
    color("teal") {
        translate([-15, -15, 0]) xcyl(l=35, r=10);
        translate([15, -15, 0])  xcyl(l=35, r1=15, r2=5);
        translate([-15, 15, 0])  xcyl(l=35, d=20);
        translate([15, 15, 0])   xcyl(l=35, d1=30, d2=10);
    }
}

// ycyl() Examples
echo("--- ycyl() Examples ---");
translate([-40, -40, 0]) {
    color("blueviolet") {
        translate([-15, -15, 0]) ycyl(l=35, r=10);
        translate([15, -15, 0])  ycyl(l=35, r1=15, r2=5);
        translate([-15, 15, 0])  ycyl(l=35, d=20);
        translate([15, 15, 0])   ycyl(l=35, d1=30, d2=10);
    }
}

// zcyl() Examples
echo("--- zcyl() Examples ---");
translate([40, -40, 0]) {
    color("coral") {
        translate([-15, -15, 0]) zcyl(l=35, r=10);
        translate([15, -15, 0])  zcyl(l=35, r1=15, r2=5);
        translate([-15, 15, 0])  zcyl(l=35, d=20);
        translate([15, 15, 0])   zcyl(l=35, d1=30, d2=10);
    }
}


// --- Row 4: tube() and torus() ---

// tube() Examples
echo("--- tube() Examples ---");
translate([-40, -120, 0]) {
    color("yellowgreen") {
        // Shown in a small mini-grid
        translate([-25, -25, 0]) tube(h=30, or=20, wall=3);
        translate([25, -25, 0])  tube(h=30, ir=15, wall=3);
        translate([-25, 25, 0])  tube(h=30, or=20, ir=15);
        translate([25, 25, 0])   tube(h=30, od=40, id=30);
        
        translate([-25, -75, 0]) tube(h=30, or1=20, or2=12.5, wall=3);
        translate([25, -75, 0])  tube(h=30, ir1=15, or2=10, wall=3);
        translate([-25, 75, 0])  tube(h=30, or1=20, or2=12.5, ir1=15, ir2=10);
        translate([25, 75, 0])   tube(h=30, or1=20, or2=15, ir1=10, ir2=15);
    }
}

// torus() Examples
echo("--- torus() Examples ---");
translate([40, -120, 0]) {
    color("tomato") {
        translate([-25, -25, 0]) torus(r=15, r2=5);
        translate([25, -25, 0])  torus(d=30, d2=10);
        translate([-25, 25, 0])  torus(or=20, ir=10);
        translate([25, 25, 0])   torus(od=40, id=20);
    }
}
