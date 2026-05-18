include <BOSL/constants.scad>
use <BOSL/transforms.scad>
use <BOSL/paths.scad>

// WebCAD Belfry OpenSCAD Library (BOSL) Paths Showcase
// Demonstrates all key path extrusion, modulation, and tracing modules with echo statements and vibrant colors.

$fn = 32;

// ==========================================
// ROW 1 (y = 25): Circle Modulation and Basic Extrusion
// ==========================================

// 1. Modulated Circle (Extruded to 3D)
echo("--- STARTING TEST 1: modulated_circle ---");
translate([-30, 25, 0]) {
    color("crimson") linear_extrude(height=15, center=true) {
        modulated_circle(r=12, sines=[[2, 7], [0.5, 17]]);
    }
}

// 2. Extrude From To
echo("--- STARTING TEST 2: extrude_from_to ---");
translate([0, 25, -7.5]) {
    color("gold") extrude_from_to([0, 0, 0], [0, 0, 15], twist=180, scale=1.5) {
        xspread(3) circle(r=2, $fn=32);
    }
}

// 3. Extrude 2D Hollow
echo("--- STARTING TEST 3: extrude_2d_hollow ---");
translate([30, 25, 0]) {
    color("limegreen") extrude_2d_hollow(wall=1.5, height=15, twist=90, slices=40) {
        circle(r=8, $fn=6);
    }
}


// ==========================================
// ROW 2 (y = -25): Spiral Extrusions, 3D Paths, and Tracing
// ==========================================

// 4. Extrude 2D Path Along Spiral
echo("--- STARTING TEST 4: extrude_2dpath_along_spiral ---");
translate([-30, -25, -10]) {
    color("teal") {
        poly = [[-3,0], [-1,-1.5], [1,-1.5], [3,0], [0,-8]];
        extrude_2dpath_along_spiral(poly, h=20, r=8, twist=360, $fn=24);
    }
}

// 5. Extrude 2D Path Along 3D Path
echo("--- STARTING TEST 5: extrude_2dpath_along_3dpath ---");
translate([0, -25, -10]) {
    color("dodgerblue") {
        shape = path2d_regular_ngon(n=5, r=3);
        path = path3d_spiral(turns=1, h=20, n=24, r=8);
        extrude_2dpath_along_3dpath(shape, path);
    }
}

// 6. Trace Polyline
echo("--- STARTING TEST 6: trace_polyline ---");
translate([30, -25, 0]) {
    color("orchid") {
        polyline = [for (a=[0:30:360]) 8*[cos(a), sin(a), sin(a)/2]];
        trace_polyline(polyline, showpts=true, size=0.8, color="gold");
    }
}
