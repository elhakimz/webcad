// GEOL (Geometric Engine Optimized Library) - Torx Drive Module
// High-performance, library-free parametric Torx driver bit and screwdriver bits.
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
// 1. Functions (Lookup tables for standard Torx sizes)
// ==========================================

function torx_outer_diam(size) = lookup(size, [
    [  6,  1.75],
    [  8,  2.40],
    [ 10,  2.80],
    [ 15,  3.35],
    [ 20,  3.95],
    [ 25,  4.50],
    [ 30,  5.60],
    [ 40,  6.75],
    [ 45,  7.93],
    [ 50,  8.95],
    [ 55, 11.35],
    [ 60, 13.45],
    [ 70, 15.70],
    [ 80, 17.75],
    [ 90, 20.20],
    [100, 22.40]
]);

function torx_inner_diam(size) = lookup(size, [
    [  6,  1.27],
    [  8,  1.75],
    [ 10,  2.05],
    [ 15,  2.40],
    [ 20,  2.85],
    [ 25,  3.25],
    [ 30,  4.05],
    [ 40,  4.85],
    [ 45,  5.64],
    [ 50,  6.45],
    [ 55,  8.05],
    [ 60,  9.60],
    [ 70, 11.20],
    [ 80, 12.80],
    [ 90, 14.40],
    [100, 16.00]
]);

function torx_depth(size) = lookup(size, [
    [  6,  1.82],
    [  8,  3.05],
    [ 10,  3.56],
    [ 15,  3.81],
    [ 20,  4.07],
    [ 25,  4.45],
    [ 30,  4.95],
    [ 40,  5.59],
    [ 45,  6.22],
    [ 50,  6.48],
    [ 55,  6.73],
    [ 60,  8.17],
    [ 70,  8.96],
    [ 80,  9.90],
    [ 90, 10.56],
    [100, 11.35]
]);

function torx_tip_radius(size) = lookup(size, [
    [  6, 0.132],
    [  8, 0.190],
    [ 10, 0.229],
    [ 15, 0.267],
    [ 20, 0.305],
    [ 25, 0.375],
    [ 30, 0.451],
    [ 40, 0.546],
    [ 45, 0.574],
    [ 50, 0.775],
    [ 55, 0.867],
    [ 60, 1.067],
    [ 70, 1.194],
    [ 80, 1.526],
    [ 90, 1.530],
    [100, 1.720]
]);

function torx_rounding_radius(size) = lookup(size, [
    [  6, 0.383],
    [  8, 0.510],
    [ 10, 0.598],
    [ 15, 0.716],
    [ 20, 0.859],
    [ 25, 0.920],
    [ 30, 1.194],
    [ 40, 1.428],
    [ 45, 1.796],
    [ 50, 1.816],
    [ 55, 2.667],
    [ 60, 2.883],
    [ 70, 3.477],
    [ 80, 3.627],
    [ 90, 4.468],
    [100, 4.925]
]);

// Helper function to generate perfect mathematical Torx 2D profile points
function torx_drive2d_points(size, num_points=120) = [
    for (i = [0 : num_points - 1])
        let (
            theta = i * 360 / num_points,
            od = torx_outer_diam(size),
            tip = torx_tip_radius(size),
            base = od - 2 * tip,
            r_c = base / 2,
            
            // Lobe distance calculations (choose maximum intersection)
            d_lobe_0   = r_c * cos(theta)     + sqrt(max(0, tip*tip - r_c*r_c * sin(theta)*sin(theta))),
            d_lobe_60  = r_c * cos(theta-60)  + sqrt(max(0, tip*tip - r_c*r_c * sin(theta-60)*sin(theta-60))),
            d_lobe_120 = r_c * cos(theta-120) + sqrt(max(0, tip*tip - r_c*r_c * sin(theta-120)*sin(theta-120))),
            d_lobe_180 = r_c * cos(theta-180) + sqrt(max(0, tip*tip - r_c*r_c * sin(theta-180)*sin(theta-180))),
            d_lobe_240 = r_c * cos(theta-240) + sqrt(max(0, tip*tip - r_c*r_c * sin(theta-240)*sin(theta-240))),
            d_lobe_300 = r_c * cos(theta-300) + sqrt(max(0, tip*tip - r_c*r_c * sin(theta-300)*sin(theta-300))),
            
            r_star = max(r_c, max(d_lobe_0, max(d_lobe_60, max(d_lobe_120, max(d_lobe_180, max(d_lobe_240, d_lobe_300)))))),
            
            // Valley distance calculations (choose minimum subtracted intersection)
            id = torx_inner_diam(size),
            rounding = torx_rounding_radius(size),
            r_v = id / 2 + rounding,
            
            d_val_30  = r_v * cos(theta-30)  - sqrt(max(0, rounding*rounding - r_v*r_v * sin(theta-30)*sin(theta-30))),
            d_val_90  = r_v * cos(theta-90)  - sqrt(max(0, rounding*rounding - r_v*r_v * sin(theta-90)*sin(theta-90))),
            d_val_150 = r_v * cos(theta-150) - sqrt(max(0, rounding*rounding - r_v*r_v * sin(theta-150)*sin(theta-150))),
            d_val_210 = r_v * cos(theta-210) - sqrt(max(0, rounding*rounding - r_v*r_v * sin(theta-210)*sin(theta-210))),
            d_val_270 = r_v * cos(theta-270) - sqrt(max(0, rounding*rounding - r_v*r_v * sin(theta-270)*sin(theta-270))),
            d_val_330 = r_v * cos(theta-330) - sqrt(max(0, rounding*rounding - r_v*r_v * sin(theta-330)*sin(theta-330))),
            
            r_valley = min(d_val_30, min(d_val_90, min(d_val_150, min(d_val_210, min(d_val_270, d_val_330))))),
            
            r_final = min(r_star, r_valley)
        )
        [ r_final * cos(theta), r_final * sin(theta) ]
];

// ==========================================
// 2. Core Modules
// ==========================================

// Module: torx_drive2d()
// Description: Creates a 2D Torx profile as a single, perfectly closed, filled CAD polyline.
module torx_drive2d(size) {
    pts = torx_drive2d_points(size, 120);
    polyline2d(points=pts, closed=true);
}

// Module: torx_drive()
// Description: Creates a high-performance, watertight 3D Torx driver bit tip.
module torx_drive(
    size=30, 
    l=5, 
    orient=ORIENT_Z, 
    align=V_UP
) {
    od = torx_outer_diam(size);
    id = torx_inner_diam(size);
    tip = torx_tip_radius(size);
    rounding = torx_rounding_radius(size);
    base = od - 2 * tip;
    
    orient_and_align([od, od, l], orient, align) {
        down(l / 2) {
            difference() {
                union() {
                    // Center cylindrical core
                    cylinder(d=base, h=l, center=false, $fn=24);
                    
                    // 3D non-coplanar hull of the 6 star lobes
                    zring(n=2) {
                        hull() {
                            zring(n=3) {
                                translate([base / 2, 0, 0]) {
                                    cylinder(r=tip, h=l, center=false, $fn=12);
                                }
                            }
                        }
                    }
                }
                
                // Subtract 6 Z-oriented rounded valleys
                zring(n=6) {
                    zrot(180 / 6) {
                        translate([id / 2 + rounding, 0, 0]) {
                            cylinder(r=rounding, h=l + 0.1, center=false, $fn=24);
                        }
                    }
                }
            }
        }
    }
}
