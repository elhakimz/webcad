// GEOL (Geometric Engine Optimized Library) - Sliders Module
// Highly optimized, library-free linear V-groove carriage sliders and rails.
// Created: 2026-05-19

// ==========================================
// 1. General Constants & Directional Vectors
// ==========================================
PRINTER_SLOP = 0.05;

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
// 2. High-Performance Utility Modules
// ==========================================
module up(z)    { translate([0, 0, z]) children(); }
module down(z)  { translate([0, 0, -z]) children(); }

module orient_and_align(size, orient=ORIENT_Z, align=V_CENTER, orig_orient=ORIENT_Z) {
    // Map rotated size based on target orientation for post-rotation translation alignment
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

// 3. Slider Support Helpers
module slider_base(w, l, h, chamfer) {
    if (chamfer <= 0) {
        translate([0, 0, h/2]) cube([w, l, h], center=true);
    } else {
        difference() {
            translate([0, 0, h/2]) cube([w, l, h], center=true);
            // Vertical corner cuts
            for (xs = [-1, 1], ys = [-1, 1]) {
                translate([xs*w/2, ys*l/2, h/2])
                    rotate([0, 0, 45])
                    cube([chamfer*sqrt(2), chamfer*sqrt(2), h+0.1], center=true);
            }
            // Top-front and Top-back cuts
            for (ys = [-1, 1]) {
                translate([0, ys*l/2, h])
                    rotate([45, 0, 0])
                    cube([w+0.1, chamfer*sqrt(2), chamfer*sqrt(2)], center=true);
            }
        }
    }
}

module slider_wall(ww, l, hw, chamfer, is_right) {
    if (chamfer <= 0) {
        translate([0, 0, hw/2]) cube([ww, l, hw], center=true);
    } else {
        difference() {
            translate([0, 0, hw/2]) cube([ww, l, hw], center=true);
            // Top outer edge cut
            x_edge = is_right ? ww/2 : -ww/2;
            translate([x_edge, 0, hw])
                rotate([0, is_right ? 45 : -45, 0])
                cube([chamfer*sqrt(2), l+0.1, chamfer*sqrt(2)], center=true);
            // Front and back outer edge cuts
            for (ys = [-1, 1]) {
                translate([x_edge, ys*l/2, hw/2])
                    rotate([0, 0, is_right ? 45 : -45])
                    cube([chamfer*sqrt(2), chamfer*sqrt(2), hw+0.1], center=true);
            }
        }
    }
}

module slider_wedge(l, h, ang, is_right) {
    depth = h/2 * tan(ang);
    // Triangle in XZ plane, extruded along Y
    rotate([90, 0, 0]) {
        linear_extrude(height=l, center=true) {
            if (is_right) {
                // Right wall wedge points left (towards XNEG)
                polygon(points=[ [0, h/2], [0, -h/2], [-depth, 0] ]);
            } else {
                // Left wall wedge points right (towards XPOS)
                polygon(points=[ [0, h/2], [0, -h/2], [depth, 0] ]);
            }
        }
    }
}

// ==========================================
// 4. Core Slider and Rail Modules
// ==========================================

// Module: slider()
// Creates a matching carriage/slider block that rides on a V-groove rail.
module slider(l=30, w=10, h=10, chamfer=2, base=10, wall=5, ang=30, slop=PRINTER_SLOP, orient=ORIENT_Y, align=V_UP) {
    full_width = w + 2*wall;
    full_height = h + base;

    orient_and_align([full_width, l, h+2*base], orient, align, orig_orient=ORIENT_Y) {
        down(base+h/2) {
            // Carriage Base
            slider_base(full_width, l, base-slop, chamfer);

            // Carriage Side Walls
            translate([w/2+slop, 0, 0]) {
                slider_wall(wall, l, full_height, chamfer, is_right=true);
            }
            translate([-(w/2+slop), 0, 0]) {
                slider_wall(wall, l, full_height, chamfer, is_right=false);
            }

            // V-Groove Carriage Wedge Inserts
            translate([w/2+slop+0.02, 0, base+h/2]) {
                slider_wedge(l, h, ang, is_right=true);
            }
            translate([-(w/2+slop+0.02), 0, base+h/2]) {
                slider_wedge(l, h, ang, is_right=false);
            }
        }
    }
}

// Module: rail()
// Creates a high-precision sliding guide rail with V-grooves.
module rail(l=30, w=10, h=10, chamfer=1.0, ang=30, orient=ORIENT_Y, align=V_UP) {
    attack_ang = 30;
    attack_len = 2;

    fudge = 1.177;
    chamf = sqrt(2) * chamfer;
    cosa = cos(ang*fudge);
    sina = sin(ang*fudge);

    z1 = h/2;
    z2 = z1 - chamf * cosa;
    z3 = z1 - attack_len * sin(attack_ang);
    z4 = 0;

    x1 = w/2;
    x2 = x1 - chamf * sina;
    x3 = x1 - chamf;
    x4 = x1 - attack_len * sin(attack_ang);
    x5 = x2 - attack_len * sin(attack_ang);
    x6 = x1 - z1 * sina;
    x7 = x4 - z1 * sina;

    y1 = l/2;
    y2 = y1 - attack_len * cos(attack_ang);

    orient_and_align([w, l, h], orient, align, orig_orient=ORIENT_Y) {
        polyhedron(
            convexity=4,
            points=[
                [-x5, -y1,  z3],
                [ x5, -y1,  z3],
                [ x7, -y1,  z4],
                [ x4, -y1, -z1-0.05],
                [-x4, -y1, -z1-0.05],
                [-x7, -y1,  z4],

                [-x3, -y2,  z1],
                [ x3, -y2,  z1],
                [ x2, -y2,  z2],
                [ x6, -y2,  z4],
                [ x1, -y2, -z1-0.05],
                [-x1, -y2, -z1-0.05],
                [-x6, -y2,  z4],
                [-x2, -y2,  z2],

                [ x5,  y1,  z3],
                [-x5,  y1,  z3],
                [-x7,  y1,  z4],
                [-x4,  y1, -z1-0.05],
                [ x4,  y1, -z1-0.05],
                [ x7,  y1,  z4],

                [ x3,  y2,  z1],
                [-x3,  y2,  z1],
                [-x2,  y2,  z2],
                [-x6,  y2,  z4],
                [-x1,  y2, -z1-0.05],
                [ x1,  y2, -z1-0.05],
                [ x6,  y2,  z4],
                [ x2,  y2,  z2],
            ],
            faces=[
                [0, 1, 2],
                [0, 2, 5],
                [2, 3, 4],
                [2, 4, 5],

                [0, 13, 6],
                [0, 6, 7],
                [0, 7, 1],
                [1, 7, 8],
                [1, 8, 9],
                [1, 9, 2],
                [2, 9, 10],
                [2, 10, 3],
                [3, 10, 11],
                [3, 11, 4],
                [4, 11, 12],
                [4, 12, 5],
                [5, 12, 13],
                [5, 13, 0],

                [14, 15, 16],
                [14, 16, 19],
                [16, 17, 18],
                [16, 18, 19],

                [14, 27, 20],
                [14, 20, 21],
                [14, 21, 15],
                [15, 21, 22],
                [15, 22, 23],
                [15, 23, 16],
                [16, 23, 24],
                [16, 24, 17],
                [17, 24, 25],
                [17, 25, 18],
                [18, 25, 26],
                [18, 26, 19],
                [19, 26, 27],
                [19, 27, 14],

                [6, 21, 20],
                [6, 20, 7],
                [7, 20, 27],
                [7, 27, 8],
                [8, 27, 26],
                [8, 26, 9],
                [9, 26, 25],
                [9, 25, 10],
                [10, 25, 24],
                [10, 24, 11],
                [11, 24, 23],
                [11, 23, 12],
                [12, 23, 22],
                [12, 22, 13],
                [13, 22, 21],
                [13, 21, 6],
            ]
        );
    }
}
