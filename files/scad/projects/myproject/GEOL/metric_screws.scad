// GEOL (Geometric Engine Optimized Library) - Metric Screws Module
// High-performance, library-free parametric metric screws, bolts, and nuts.
// Optimized for fast OpenCascade kernel evaluation.
// Created: 2026-05-19

use <threading.scad>

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

ALIGN_POS    = 1;
ALIGN_NEG    = -1;
ALIGN_CENTER = 0;

// Helper to check if a variable is defined
function is_def(v) = (v != undef);

// Segment helper
function segs(r) = is_def($fn) && $fn > 0 ? $fn : max(5, min(100, ceil(2 * 3.14159 * r / 2)));

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
// 1. Database Lookup Functions
// ==========================================

function get_metric_bolt_head_size(size) = lookup(size, [
		[ 3.0,  5.5],
		[ 4.0,  7.0],
		[ 5.0,  8.0],
		[ 6.0, 10.0],
		[ 7.0, 11.0],
		[ 8.0, 13.0],
		[10.0, 17.0],
		[12.0, 19.0],
		[14.0, 22.0],
		[16.0, 24.0],
		[18.0, 27.0],
		[20.0, 30.0],
		[24.0, 36.0],
		[30.0, 46.0],
		[36.0, 55.0],
		[42.0, 65.0],
		[48.0, 75.0],
		[56.0, 85.0],
		[64.0, 95.0]
	]);

function get_metric_bolt_head_height(size) = lookup(size, [
		[ 1.6,  1.23],
		[ 2.0,  1.53],
		[ 2.5,  1.83],
		[ 3.0,  2.13],
		[ 4.0,  2.93],
		[ 5.0,  3.65],
		[ 6.0,  4.15],
		[ 8.0,  5.45],
		[10.0,  6.58],
		[12.0,  7.68],
		[14.0,  8.98],
		[16.0, 10.18],
		[20.0, 12.72],
		[24.0, 15.35],
		[30.0, 19.12],
		[36.0, 22.92],
		[42.0, 26.42],
		[48.0, 30.42],
		[56.0, 35.50],
		[64.0, 40.50]
	]);

function get_metric_socket_cap_diam(size) = lookup(size, [
		[ 1.6,  3.0],
		[ 2.0,  3.8],
		[ 2.5,  4.5],
		[ 3.0,  5.5],
		[ 4.0,  7.0],
		[ 5.0,  8.5],
		[ 6.0, 10.0],
		[ 8.0, 13.0],
		[10.0, 16.0],
		[12.0, 18.0],
		[14.0, 21.0],
		[16.0, 24.0],
		[18.0, 27.0],
		[20.0, 30.0],
		[22.0, 33.0],
		[24.0, 36.0],
		[27.0, 40.0],
		[30.0, 45.0],
		[33.0, 50.0],
		[36.0, 54.0],
		[42.0, 63.0],
		[48.0, 72.0],
		[56.0, 84.0],
		[64.0, 96.0]
	]);

function get_metric_socket_cap_height(size) = lookup(size, [
		[ 1.6,  1.7],
		[ 2.0,  2.0],
		[ 2.5,  2.5],
		[ 3.0,  3.0],
		[ 4.0,  4.0],
		[ 5.0,  5.0],
		[ 6.0,  6.0],
		[ 8.0,  8.0],
		[10.0, 10.0],
		[12.0, 12.0],
		[14.0, 14.0],
		[16.0, 16.0],
		[18.0, 18.0],
		[20.0, 20.0],
		[22.0, 22.0],
		[24.0, 24.0],
		[27.0, 27.0],
		[30.0, 30.0],
		[33.0, 33.0],
		[36.0, 36.0],
		[42.0, 42.0],
		[48.0, 48.0],
		[56.0, 56.0],
		[64.0, 64.0]
	]);

function get_metric_socket_cap_socket_size(size) = lookup(size, [
		[ 1.6,  1.5],
		[ 2.0,  1.5],
		[ 2.5,  2.0],
		[ 3.0,  2.5],
		[ 4.0,  3.0],
		[ 5.0,  4.0],
		[ 6.0,  5.0],
		[ 8.0,  6.0],
		[10.0,  8.0],
		[12.0, 10.0],
		[14.0, 12.0],
		[16.0, 14.0],
		[18.0, 14.0],
		[20.0, 17.0],
		[22.0, 17.0],
		[24.0, 19.0],
		[27.0, 19.0],
		[30.0, 22.0],
		[33.0, 24.0],
		[36.0, 27.0],
		[42.0, 32.0],
		[48.0, 36.0],
		[56.0, 41.0],
		[64.0, 46.0]
	]);

function get_metric_socket_cap_socket_depth(size) = lookup(size, [
		[ 1.6,  0.7],
		[ 2.0,  1.0],
		[ 2.5,  1.1],
		[ 3.0,  1.3],
		[ 4.0,  2.0],
		[ 5.0,  2.5],
		[ 6.0,  3.0],
		[ 8.0,  4.0],
		[10.0,  5.0],
		[12.0,  6.0],
		[14.0,  7.0],
		[16.0,  8.0],
		[18.0,  9.0],
		[20.0, 10.0],
		[22.0, 11.0],
		[24.0, 12.0],
		[27.0, 13.5],
		[30.0, 15.5],
		[33.0, 18.0],
		[36.0, 19.0],
		[42.0, 24.0],
		[48.0, 28.0],
		[56.0, 34.0],
		[64.0, 38.0]
	]);

function get_metric_iso_coarse_thread_pitch(size) = lookup(size, [
		[ 1.6, 0.35],
		[ 2.0, 0.40],
		[ 2.5, 0.45],
		[ 3.0, 0.50],
		[ 4.0, 0.70],
		[ 5.0, 0.80],
		[ 6.0, 1.00],
		[ 7.0, 1.00],
		[ 8.0, 1.25],
		[10.0, 1.50],
		[12.0, 1.75],
		[14.0, 2.00],
		[16.0, 2.00],
		[18.0, 2.50],
		[20.0, 2.50],
		[22.0, 2.50],
		[24.0, 3.00],
		[27.0, 3.00],
		[30.0, 3.50],
		[33.0, 3.50],
		[36.0, 4.00],
		[39.0, 4.00],
		[42.0, 4.50],
		[45.0, 4.50],
		[48.0, 5.00],
		[56.0, 5.50],
		[64.0, 6.00]
	]);

function get_metric_iso_fine_thread_pitch(size) = lookup(size, [
		[ 1.6, 0.35],
		[ 2.0, 0.40],
		[ 2.5, 0.45],
		[ 3.0, 0.50],
		[ 4.0, 0.70],
		[ 5.0, 0.80],
		[ 6.0, 1.00],
		[ 7.0, 1.00],
		[ 8.0, 1.00],
		[10.0, 1.25],
		[12.0, 1.50],
		[14.0, 1.50],
		[16.0, 2.00],
		[18.0, 2.50],
		[20.0, 2.50],
		[22.0, 2.50],
		[24.0, 3.00],
		[27.0, 3.00],
		[30.0, 3.50],
		[33.0, 3.50],
		[36.0, 4.00],
		[39.0, 4.00],
		[42.0, 4.50],
		[45.0, 4.50],
		[48.0, 5.00],
		[56.0, 5.50],
		[64.0, 6.00]
	]);

function get_metric_iso_superfine_thread_pitch(size) = lookup(size, [
		[ 1.6, 0.35],
		[ 2.0, 0.40],
		[ 2.5, 0.45],
		[ 3.0, 0.50],
		[ 4.0, 0.70],
		[ 5.0, 0.80],
		[ 6.0, 1.00],
		[ 7.0, 1.00],
		[ 8.0, 1.00],
		[10.0, 1.00],
		[12.0, 1.25],
		[14.0, 1.50],
		[16.0, 2.00],
		[18.0, 2.50],
		[20.0, 2.50],
		[22.0, 2.50],
		[24.0, 3.00],
		[27.0, 3.00],
		[30.0, 3.50],
		[33.0, 3.50],
		[36.0, 4.00],
		[39.0, 4.00],
		[42.0, 4.50],
		[45.0, 4.50],
		[48.0, 5.00],
		[56.0, 5.50],
		[64.0, 6.00]
	]);

function get_metric_jis_thread_pitch(size) = lookup(size, [
		[ 2.0, 0.40],
		[ 2.5, 0.45],
		[ 3.0, 0.50],
		[ 4.0, 0.70],
		[ 5.0, 0.80],
		[ 6.0, 1.00],
		[ 7.0, 1.00],
		[ 8.0, 1.25],
		[10.0, 1.25],
		[12.0, 1.25],
		[14.0, 1.50],
		[16.0, 1.50],
		[18.0, 1.50],
		[20.0, 1.50]
	]);

function get_metric_nut_size(size) = lookup(size, [
		[ 2.0,  4.0],
		[ 2.5,  5.0],
		[ 3.0,  5.5],
		[ 4.0,  7.0],
		[ 5.0,  8.0],
		[ 6.0, 10.0],
		[ 7.0, 11.0],
		[ 8.0, 13.0],
		[10.0, 17.0],
		[12.0, 19.0],
		[14.0, 22.0],
		[16.0, 24.0],
		[18.0, 27.0],
		[20.0, 30.0],
		[22.0, 32.0],
		[24.0, 36.0],
		[27.0, 41.0],
		[30.0, 46.0],
		[33.0, 50.0],
		[36.0, 55.0],
		[39.0, 60.0],
		[42.0, 65.0],
		[45.0, 70.0],
		[48.0, 75.0],
		[52.0, 80.0],
		[56.0, 85.0],
		[60.0, 90.0],
		[64.0, 95.0],
		[68.0, 100.0],
		[72.0, 105.0]
	]);

function get_metric_nut_thickness(size) = lookup(size, [
		[ 1.6,  1.3],
		[ 2.0,  1.6],
		[ 2.5,  2.0],
		[ 3.0,  2.4],
		[ 4.0,  3.2],
		[ 5.0,  4.0],
		[ 6.0,  5.0],
		[ 7.0,  5.5],
		[ 8.0,  6.5],
		[10.0,  8.0],
		[12.0, 10.0],
		[14.0, 11.0],
		[16.0, 13.0],
		[18.0, 15.0],
		[20.0, 16.0],
		[24.0, 21.5],
		[30.0, 25.6],
		[36.0, 31.0],
		[42.0, 34.0],
		[48.0, 38.0],
		[56.0, 45.0],
		[64.0, 51.0]
	]);


// ==========================================
// 2. Alignment Helpers
// ==========================================

module orient_and_align_screw(headlen, screwlen, headsize, orient, align) {
    H = headlen + screwlen;
    is_named = (align == "base" || align == "sunken");
    
    z_shift = 
        (align == "base") ? -(screwlen/2 - headlen/2) :
        (align == "sunken") ? -(screwlen/2 + headlen/2) :
        0;
        
    if (is_named) {
        rotate(orient) {
            translate([0, 0, z_shift]) {
                children();
            }
        }
    } else {
        orient_and_align([headsize, headsize, H], orient, align) {
            children();
        }
    }
}

module orient_and_align_bolt(headlen, l, shank, flange, D, orient, align) {
    H = headlen + l;
    is_named = (align == "base" || align == "sunken" || align == "shank");
    
    z_shift = 
        (align == "base") ? -(l/2 - headlen/2) :
        (align == "sunken") ? -(l/2 + headlen/2) :
        (align == "shank") ? -(l/2 - headlen/2 - shank) :
        0;
        
    if (is_named) {
        rotate(orient) {
            translate([0, 0, z_shift]) {
                children();
            }
        }
    } else {
        orient_and_align([D+flange, D+flange, H], orient, align) {
            children();
        }
    }
}

module orient_and_align_nut(H, D, flange, center, orient, align) {
    local_align = is_def(center) ? (center ? V_CENTER : V_UP) : align;
    orient_and_align([D+flange, D+flange, H], orient, local_align) {
        children();
    }
}


// ==========================================
// 3. Core Modules
// ==========================================

// Module: screw()
// Description: Makes a very simple screw model, useful for making screw holes.
module screw(
    screwsize=3,
    screwlen=10,
    headsize=6,
    headlen=3,
    pitch=undef,
    countersunk=false,
    orient=ORIENT_Z,
    align="base"
) {
    H_total = headlen + screwlen;
    algn = countersunk ? "sunken" : align;
    sides = max(12, segs(screwsize/2));
    
    orient_and_align_screw(headlen, screwlen, headsize, orient, algn) {
        // Shaft (silver/grey)
        color("silver") {
            if (is_def(pitch) && pitch > 0) {
                translate([0, 0, -H_total/2 + screwlen]) {
                    threaded_rod(d=screwsize, id=screwsize - pitch, length=screwlen, pitch=pitch);
                }
            } else {
                translate([0, 0, -H_total/2 + screwlen/2]) {
                    cylinder(r=screwsize/2, h=screwlen, center=true, $fn=sides);
                }
            }
        }
        
        // Head
        color("grey") {
            translate([0, 0, H_total/2 - headlen/2]) {
                cylinder(r=headsize/2, h=headlen, center=true, $fn=sides*2);
            }
        }
    }
}


// Module: metric_bolt()
// Description: Makes a standard metric screw model.
module metric_bolt(
    headtype="socket",
    size=3,
    l=12,
    shank=0,
    pitch=undef,
    details=false,
    coarse=true,
    flange=0,
    phillips=undef,
    torx=undef,
    orient=ORIENT_Z,
    align="base"
) {
    D = (headtype != "hex") ? get_metric_socket_cap_diam(size) : get_metric_bolt_head_size(size);
    H = (headtype == "socket") ? get_metric_socket_cap_height(size) : get_metric_bolt_head_height(size);
    P = coarse ? 
        (is_def(pitch) ? pitch : get_metric_iso_coarse_thread_pitch(size)) :
        (is_def(pitch) ? pitch : get_metric_iso_fine_thread_pitch(size));
        
    headlen = (
        (headtype == "pan" || headtype == "round" || headtype == "button") ? H * 0.75 :
        (headtype == "countersunk") ? (D - size) / 2 :
        (headtype == "oval") ? ((D - size) / 2 + D / 2 / 3) :
        H
    );
    
    tlen = l - min(l, shank);
    H_total = headlen + l;
    
    orient_and_align_bolt(headlen, l, shank, flange, D, orient, align) {
        color("silver") {
            // 1. Head Rendering
            translate([0, 0, H_total/2 - headlen/2]) {
                if (headtype == "hex") {
                    cylinder(d=D/cos(30), h=headlen, center=true, $fn=6);
                } else if (headtype == "socket") {
                    difference() {
                        cylinder(d=D, h=headlen, center=true, $fn=32);
                        if (details) {
                            sockw = get_metric_socket_cap_socket_size(size);
                            sockd = get_metric_socket_cap_socket_depth(size);
                            translate([0, 0, headlen/2 - sockd/2 + 0.05]) {
                                cylinder(d=sockw/cos(30), h=sockd + 0.1, center=true, $fn=6);
                            }
                        }
                    }
                } else if (headtype == "pan") {
                    cylinder(d=D, h=headlen, center=true, $fn=32);
                } else if (headtype == "round" || headtype == "button") {
                    intersection() {
                        sphere(d=D, $fn=32);
                        translate([0, 0, -D/2 + headlen/2]) {
                            cube([D+1, D+1, headlen], center=true);
                        }
                    }
                } else if (headtype == "countersunk") {
                    cylinder(d1=size, d2=D, h=headlen, center=true, $fn=32);
                } else if (headtype == "oval") {
                    cone_h = (D - size) / 2;
                    dome_h = headlen - cone_h;
                    union() {
                        translate([0, 0, -headlen/2 + cone_h/2]) {
                            cylinder(d1=size, d2=D, h=cone_h, center=true, $fn=32);
                        }
                        translate([0, 0, headlen/2 - dome_h/2]) {
                            intersection() {
                                sphere(d=D, $fn=32);
                                translate([0, 0, -D/2 + dome_h/2]) {
                                    cube([D+1, D+1, dome_h], center=true);
                                }
                            }
                        }
                    }
                }
            }
            
            // 2. Flange
            if (flange > 0) {
                flange_h = headlen / 8;
                translate([0, 0, H_total/2 - headlen + flange_h/2]) {
                    cylinder(d=D+flange, h=flange_h, center=true, $fn=32);
                }
            }
            
            // 3. Unthreaded Shank
            if (shank > 0) {
                translate([0, 0, H_total/2 - headlen - shank/2]) {
                    cylinder(d=size, h=shank + 0.02, center=true, $fn=32);
                }
            }
            
            // 4. Threaded Shaft Portion
            if (tlen > 0) {
                translate([0, 0, -H_total/2 + tlen]) {
                    if (is_def(P) && P > 0) {
                        threaded_rod(d=size, id=size - P, length=tlen, pitch=P);
                    } else {
                        translate([0, 0, -tlen/2]) {
                            cylinder(d=size, h=tlen, center=true, $fn=32);
                        }
                    }
                }
            }
        }
    }
}


// Module: metric_nut()
// Description: Makes a model of a standard nut for a standard metric screw.
module metric_nut(
    size=3,
    hole=true,
    pitch=undef,
    details=false,
    flange=0,
    center=undef,
    orient=ORIENT_Z,
    align=V_UP
) {
    H = get_metric_nut_thickness(size);
    D = get_metric_nut_size(size);
    dcirc = D / cos(30);
    
    orient_and_align_nut(H, D, flange, center, orient, align) {
        difference() {
            union() {
                // Hexagon body
                cylinder(d=dcirc, h=H, center=true, $fn=6);
                
                // Optional Flange
                if (flange > 0) {
                    flange_h = H / 8;
                    translate([0, 0, -H/2 + flange_h/2]) {
                        cylinder(d=D+flange, h=flange_h, center=true, $fn=32);
                    }
                }
            }
            
            // Central hole with native thread subtract
            if (hole == true) {
                if (is_def(pitch) && pitch > 0) {
                    translate([0, 0, H/2 + 0.25]) {
                        threaded_rod(d=size + 0.1, id=size - pitch, length=H + 0.5, pitch=pitch);
                    }
                } else {
                    cylinder(r=size/2, h=H+0.5, center=true, $fn=32);
                }
            }
        }
    }
}
