// GEOL (Geometric Engine Optimized Library) - Integrated Showcase
// Demonstrates how to import and use transforms, shapes, masks, threading, and paths modules.
// Designed mathematically to render instantly with zero CPU load!

use <GEOL/transforms.scad>
use <GEOL/shapes.scad>
use <GEOL/masks.scad>
use <GEOL/threading.scad>
use <GEOL/paths.scad>

$fn = 32;

// ==========================================
// 1. Showcase transforms.scad and shapes.scad
// ==========================================
echo("--- STARTING SHOWCASE: TRANSFORMS & SHAPES ---");
translate([-30, 25, 0]) {
    // 1A. Use radial_spread from transforms and star_column from shapes
    radial_spread(r=12, count=4) {
        color("gold") {
            star_column(h=15, r_outer=3, r_inner=1.5, points=5, twist=45);
        }
    }
    
    // 1B. Use rounded_cube from shapes
    color("crimson") {
        rounded_cube(size=[12, 12, 12], fillet=2);
    }
}


// ==========================================
// 2. Showcase masks.scad
// ==========================================
echo("--- STARTING SHOWCASE: MASKS ---");
translate([0, 25, 0]) {
    // 2A. Cylinder with beveled top using chamfer_cylinder_mask
    move(x=-12) {
        color("limegreen") {
            difference() {
                cylinder(d=12, h=15, center=true, $fn=32);
                chamfer_cylinder_mask(d=12, h=15, chamfer=1.5);
            }
        }
    }
    
    // 2B. Cube block with filleted hole entry using fillet_hole_mask
    move(x=12) {
        color("orchid") {
            difference() {
                cube([15, 15, 12], center=true);
                // internal hole
                cylinder(d=8, h=16, center=true, $fn=32);
                // filleted rim entry (fits neatly on top at z=6)
                fillet_hole_mask(d=8, h=12, fillet=1.5);
            }
        }
    }
}


// ==========================================
// 3. Showcase threading.scad
// ==========================================
echo("--- STARTING SHOWCASE: THREADING ---");
translate([30, 25, 0]) {
    // A complete UTS symmetric V-thread bolt and beveled nut arranged side-by-side
    move(x=-10, z=5) {
        threaded_bolt(thread_d=8, thread_id=6.5, thread_len=20, pitch=1.25, type="V", hex_d=13, head_h=5);
    }
    
    move(x=10, z=5) {
        threaded_nut(hex_d=13, height=6, thread_d=8, thread_id=6.5, pitch=1.25, type="V");
    }
}


// ==========================================
// 4. Showcase paths.scad
// ==========================================
echo("--- STARTING SHOWCASE: PATHS & SWEEPS ---");
translate([-15, -25, -5]) {
    // 4A. Sweeping a 2D star along a curved wave path using extrude_2d_shapes_along_3dpath
    color("dodgerblue") {
        wave_path = [ [0, 0, 0], [10, 10, 5], [20, 10, 8], [30, 0, 0], [40, 0, 0] ];
        extrude_2d_shapes_along_3dpath(wave_path) {
            star_2d(r_outer=3, r_inner=1.5, points=5);
        }
    }
}

translate([20, -25, -10]) {
    // 4B. Helical wireframe path using trace_polyline
    helix_path = [for (a=[0:15:360]) [10*cos(a), 10*sin(a), 20*(a/360)]];
    trace_polyline(pline=helix_path, showpts=true, size=0.8, line_color="limegreen");
}
