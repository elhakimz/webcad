// GEOL (Geometric Engine Optimized Library) - Linear Bearings Module
// High-performance, library-free parametric linear bearing clips and housings.
// Optimized for fast OpenCascade kernel evaluation.
// Created: 2026-05-19

use <shapes.scad>
use <metric_screws.scad>

// ==========================================
// Directional Vectors & Orientation Constants
// ==========================================
V_LEFT   = [-1,  0,  0];
V_RIGHT  = [ 1,  0,  0];
V_FWD    = [ 0, -1,  0];
V_BACK   = [ 0,  1,  0];
V_DOWN   = [ 0,  0, -1];
V_UP     = [ 0,  0,  1];
V_CENTER = [ 0,  0,  0];

ORIENT_X = [90,  0,  90];
ORIENT_Y = [90,  0, 180];
ORIENT_Z = [ 0,  0,   0];

// ==========================================
// Utility Modules
// ==========================================
module up(z)      { translate([0, 0, z]) children(); }
module down(z)    { translate([0, 0, -z]) children(); }
module fwd(y)     { translate([0, -y, 0]) children(); }
module back(y)    { translate([0, y, 0]) children(); }
module xrot(a)    { rotate([a, 0, 0]) children(); }
module zrot(a)    { rotate([0, 0, a]) children(); }

// Helper to check if a variable is defined
function is_def(v) = (v != undef);

// Proportional orientation and alignment tool
module orient_and_align(size, orient=ORIENT_Z, align=V_CENTER, orig_orient=ORIENT_Z) {
    rotsize = 
        (orient == [90, 0, 90])  ? [size[2], size[0], size[1]] : // X
        (orient == [90, 0, 180]) ? [size[0], size[2], size[1]] : // Y
                                   [size[0], size[1], size[2]];  // Z
                                   
    tx = align[0] * rotsize[0] / 2;
    ty = align[1] * rotsize[1] / 2;
    tz = align[2] * rotsize[2] / 2;

    translate([tx, ty, tz]) {
        if (orig_orient == orient) {
            children();
        } else if (orig_orient == [90, 0, 180] && orient == [0, 0, 0]) {
            rotate([-90, 0, -180]) children();
        } else if (orig_orient == [90, 0, 180] && orient == [90, 0, 90]) {
            rotate([0, 0, 90]) children();
        } else {
            rotate(orient) rotate([-orig_orient[0], -orig_orient[1], -orig_orient[2]]) children();
        }
    }
}

// ==========================================
// 1. Functions (Lookup tables for standard LMxUU bearings)
// ==========================================

function get_lmXuu_bearing_diam(size) = lookup(size, [
		[  4.0,   8.0],
		[  5.0,  10.0],
		[  6.0,  12.0],
		[  8.0,  15.0],
		[ 10.0,  19.0],
		[ 12.0,  21.0],
		[ 13.0,  23.0],
		[ 16.0,  28.0],
		[ 20.0,  32.0],
		[ 25.0,  40.0],
		[ 30.0,  45.0],
		[ 35.0,  52.0],
		[ 40.0,  60.0],
		[ 50.0,  80.0],
		[ 60.0,  90.0],
		[ 80.0, 120.0],
		[100.0, 150.0]
	]);

function get_lmXuu_bearing_length(size) = lookup(size, [
		[  4.0,  12.0],
		[  5.0,  15.0],
		[  6.0,  19.0],
		[  8.0,  24.0],
		[ 10.0,  29.0],
		[ 12.0,  30.0],
		[ 13.0,  32.0],
		[ 16.0,  37.0],
		[ 20.0,  42.0],
		[ 25.0,  59.0],
		[ 30.0,  64.0],
		[ 35.0,  70.0],
		[ 40.0,  80.0],
		[ 50.0, 100.0],
		[ 60.0, 110.0],
		[ 80.0, 140.0],
		[100.0, 175.0]
	]);

// ==========================================
// 2. Modules
// ==========================================

module linear_bearing_housing(
    d=15, 
    l=24, 
    tab=7, 
    gap=5, 
    wall=3, 
    tabwall=5, 
    screwsize=3, 
    orient=ORIENT_X, 
    align=V_UP
) {
    od = d + 2*wall;
    ogap = gap + 2*tabwall;
    // Standard geometric positioning offset for the clamping tab
    tabh = tab/2 + od/2*sqrt(2) - ogap/2;
    
    orient_and_align([l, od, od], orient, align, orig_orient=ORIENT_X) {
        difference() {
            union() {
                // Main outer housing sleeve (oriented along Y by default, rotated to X)
                zrot(90) teardrop(r=od/2, h=l);
                
                // Clamping block mounting tab
                up(tabh) cube(size=[l, ogap, tab + 0.05], center=true);
                
                // Flat bottom transition/support wedge
                down(od/4) cube(size=[l, od, od/2], center=true);
            }
            
            // Central bore to house the bearing cartridge (0.05 tolerance safety margin)
            zrot(90) teardrop(r=d/2, h=l + 0.05);
            
            // Tightening slit/gap cutting through the top of the sleeve and tab
            up((d*sqrt(2) + tab)/2)
                cube(size=[l + 0.05, gap, d + tab], center=true);
                
            // Clamping screw and matching hex nut pockets
            up(tabh) {
                fwd(ogap/2 - 2 + 0.01)
                    xrot(90) screw(screwsize=screwsize * 1.06, screwlen=ogap, headsize=screwsize * 2, headlen=10);
                back(ogap/2 + 0.01)
                    xrot(90) metric_nut(size=screwsize, hole=false);
            }
        }
    }
}

module lmXuu_housing(
    size=8, 
    tab=7, 
    gap=5, 
    wall=3, 
    tabwall=5, 
    screwsize=3, 
    orient=ORIENT_X, 
    align=V_UP
) {
    d = get_lmXuu_bearing_diam(size);
    l = get_lmXuu_bearing_length(size);
    linear_bearing_housing(
        d=d, l=l, tab=tab, gap=gap, wall=wall, tabwall=tabwall, screwsize=screwsize, 
        orient=orient, align=align
    );
}
