// GEOL (Geometric Engine Optimized Library) - Phillips Drive Module
// High-performance, library-free parametric phillips driver bit and screwdriver bits.
// Optimized for fast OpenCascade kernel evaluation.
// Created: 2026-05-19

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
module right(x)   { translate([x, 0, 0]) children(); }
module left(x)    { translate([-x, 0, 0]) children(); }
module back(y)    { translate([0, y, 0]) children(); }
module fwd(y)     { translate([0, -y, 0]) children(); }
module xrot(a)    { rotate([a, 0, 0]) children(); }
module yrot(a)    { rotate([0, a, 0]) children(); }
module zrot(a)    { rotate([0, 0, a]) children(); }

module zring(n=2) {
    for (i = [0 : n - 1]) {
        rotate([0, 0, i * 360 / n]) children();
    }
}

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
// 1. Functions (Lookup tables for standard Phillips tip sizes)
// ==========================================

function get_phillips_drive_radius(size) = lookup(size, [
        [1.0, 1.25],
        [2.0, 1.77],
        [3.0, 2.65]
    ]);

// ==========================================
// 2. Core Modules
// ==========================================

module phillips_drive(
    size="#2", 
    shaft=6, 
    l=20, 
    orient=ORIENT_Z, 
    align=V_UP
) {
    // Standard measurement parameters
    ang = 11;
    
    // Parse named size to lookup float equivalent
    sz_num = (size == "#1" || size == "1") ? 1.0 :
             (size == "#3" || size == "3") ? 3.0 : 2.0;
             
    r = get_phillips_drive_radius(sz_num);
    cr = r / 2;
    
    orient_and_align([shaft, shaft, l], orient, align) {
        down(l / 2) {
            difference() {
                // Watertight intersect boundary
                intersection() {
                    union() {
                        clip = (shaft - 1.2 * r) / 2 / tan(26.5);
                        zrot(360 / 8 / 2) 
                            cylinder(h=clip, d1=1.2 * r / cos(360 / 8 / 2), d2=shaft / cos(360 / 8 / 2), center=false, $fn=8);
                        up(clip - 0.01) 
                            cylinder(h=l - clip, d=shaft, center=false, $fn=24);
                    }
                    cylinder(d=shaft, h=l, center=false, $fn=24);
                }
                
                // Subtract 4 cruciform slots rotated around Z
                zrot(45) {
                    zring(n=4) {
                        yrot(ang) {
                            zrot(-45) {
                                off = (r / 2 - cr * (sqrt(2) - 1)) / sqrt(2);
                                translate([off, off, 0]) {
                                    linear_extrude(height=l * 2, convexity=4, center=false) {
                                        difference() {
                                            union() {
                                                square([shaft, shaft], center=false);
                                                back(cr) zrot(1.125) square([shaft, shaft], center=false);
                                                right(cr) zrot(-1.125) square([shaft, shaft], center=false);
                                            }
                                            difference() {
                                                square([cr * 2, cr * 2], center=true);
                                                translate([cr, cr, 0]) circle(r=cr, $fn=8);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
