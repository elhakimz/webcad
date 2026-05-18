// GEOL (Geometric Engine Optimized Library) - Cylindroids Module
// High-performance, library-free cylindroids, cones, hollow tubes, and torus rings.
// Created: 2026-05-18

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

// Helper to resolve diameter or radius
function get_radius(r=undef, d=undef, default_val=undef) =
    is_def(r) ? r : (is_def(d) ? d/2 : default_val);

// Helper to adjust radius for circumscribing
function adjust_radius(r, circum, fn_val) =
    (circum == true) ? r / cos(180 / (is_def(fn_val) && fn_val > 2 ? fn_val : 32)) : r;

// Symmetrical orientation and alignment tool
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

// 1. Master Cylindroid Module
module cyl(
    l=undef, h=undef, r=undef, d=undef, r1=undef, d1=undef, r2=undef, d2=undef,
    circum=false, realign=false, chamfer=undef, chamfer1=undef, chamfer2=undef,
    chamfang=undef, chamfang1=undef, chamfang2=undef, from_end=false,
    fillet=undef, fillet1=undef, fillet2=undef, orient=ORIENT_Z, align=V_CENTER, center=undef
) {
    // Resolve height/length
    len = is_def(h) ? h : (is_def(l) ? l : 1.0);
    
    // Resolve fn parameter
    fn_val = is_def($fn) && $fn > 2 ? $fn : 32;
    
    // Resolve bottom and top radius
    rad1 = adjust_radius(
        is_def(r1) ? r1 : (is_def(d1) ? d1/2 : (is_def(r) ? r : (is_def(d) ? d/2 : 0.5))),
        circum, fn_val
    );
    rad2 = adjust_radius(
        is_def(r2) ? r2 : (is_def(d2) ? d2/2 : (is_def(r) ? r : (is_def(d) ? d/2 : 0.5))),
        circum, fn_val
    );
    
    // Resolve alignment and shifts
    local_align = is_def(center) ? (center ? V_CENTER : [0, 0, 1]) : (is_def(align) ? align : V_CENTER);
    z_shift = (local_align == V_CENTER || local_align == [0,0,0]) ? 0 : len/2;
    
    // Resolve chamfers and fillets
    c1 = is_def(chamfer1) ? chamfer1 : (is_def(chamfer) ? chamfer : 0);
    c2 = is_def(chamfer2) ? chamfer2 : (is_def(chamfer) ? chamfer : 0);
    
    ca1 = is_def(chamfang1) ? chamfang1 : (is_def(chamfang) ? chamfang : 45);
    ca2 = is_def(chamfang2) ? chamfang2 : (is_def(chamfang) ? chamfang : 45);
    
    f1 = is_def(fillet1) ? fillet1 : (is_def(fillet) ? fillet : 0);
    f2 = is_def(fillet2) ? fillet2 : (is_def(fillet) ? fillet : 0);
    
    // Rotation for realign parameter
    rot_z = (realign == true) ? 180 / fn_val : 0;
    
    rotate(orient) {
        translate([0, 0, z_shift]) {
            rotate([0, 0, rot_z]) {
                if (c1 == 0 && c2 == 0 && f1 == 0 && f2 == 0) {
                    // Standard vertical cylinder
                    cylinder(r1=rad1, r2=rad2, h=len, center=true, $fn=fn_val);
                } else {
                    // High-performance revolved profile
                    steps = 8;
                    
                    dx1 = c1 * (from_end ? 1 : tan(ca1));
                    dz1 = c1 * (from_end ? 1/tan(ca1) : 1);
                    
                    dx2 = c2 * (from_end ? 1 : tan(ca2));
                    dz2 = c2 * (from_end ? 1/tan(ca2) : 1);
                    
                    bottom_points = 
                        (f1 > 0) ? [
                            for (i = [0 : steps])
                                let(a = 270 + i * 90 / steps)
                                let(px = rad1 - f1 + f1 * cos(a), pz = -len/2 + f1 + f1 * sin(a))
                                [px, pz]
                        ] : (
                        (c1 > 0) ? [
                            [rad1 - dx1, -len/2],
                            [rad1, -len/2 + dz1]
                        ] : [
                            [rad1, -len/2]
                        ]);
                        
                    top_points = 
                        (f2 > 0) ? [
                            for (i = [0 : steps])
                                let(a = i * 90 / steps)
                                let(px = rad2 - f2 + f2 * cos(a), pz = len/2 - f2 + f2 * sin(a))
                                [px, pz]
                        ] : (
                        (c2 > 0) ? [
                            [rad2, len/2 - dz2],
                            [rad2 - dx2, len/2]
                        ] : [
                            [rad2, len/2]
                        ]);
                        
                    profile_points = concat(
                        [[0, -len/2]],
                        bottom_points,
                        top_points,
                        [[0, len/2]]
                    );
                    
                    rotate_extrude($fn=fn_val) {
                        polygon(points=profile_points);
                    }
                }
            }
        }
    }
}

// 2. Downward Cylinder
module downcyl(l=undef, h=undef, r=undef, d=undef, r1=undef, d1=undef, r2=undef, d2=undef) {
    len = is_def(h) ? h : (is_def(l) ? l : 1.0);
    translate([0, 0, -len/2]) {
        cyl(h=len, r=r, d=d, r1=r1, d1=d1, r2=r2, d2=d2, center=true);
    }
}

// 3. X-Axis Oriented Cylinder
module xcyl(l=undef, h=undef, r=undef, d=undef, r1=undef, d1=undef, r2=undef, d2=undef, align=V_CENTER, center=undef) {
    len = is_def(h) ? h : (is_def(l) ? l : 1.0);
    cyl(h=len, r=r, d=d, r1=r1, d1=d1, r2=r2, d2=d2, orient=ORIENT_X, align=align, center=center);
}

// 4. Y-Axis Oriented Cylinder
module ycyl(l=undef, h=undef, r=undef, d=undef, r1=undef, d1=undef, r2=undef, d2=undef, align=V_CENTER, center=undef) {
    len = is_def(h) ? h : (is_def(l) ? l : 1.0);
    cyl(h=len, r=r, d=d, r1=r1, d1=d1, r2=r2, d2=d2, orient=ORIENT_Y, align=align, center=center);
}

// 5. Z-Axis Oriented Cylinder
module zcyl(l=undef, h=undef, r=undef, d=undef, r1=undef, d1=undef, r2=undef, d2=undef, align=V_CENTER, center=undef) {
    len = is_def(h) ? h : (is_def(l) ? l : 1.0);
    cyl(h=len, r=r, d=d, r1=r1, d1=d1, r2=r2, d2=d2, orient=ORIENT_Z, align=align, center=center);
}

// 6. Hollow Tube
module tube(
    h=1, or=undef, od=undef, or1=undef, od1=undef, or2=undef, od2=undef,
    ir=undef, id=undef, ir1=undef, id1=undef, ir2=undef, id2=undef,
    wall=undef, realign=false, orient=ORIENT_Z, align=undef, center=undef
) {
    len = h;
    
    outer_d1 = is_def(od1) ? od1 : (is_def(or1) ? or1 * 2 : (is_def(od) ? od : (is_def(or) ? or * 2 : 2.0)));
    outer_d2 = is_def(od2) ? od2 : (is_def(or2) ? or2 * 2 : (is_def(od) ? od : (is_def(or) ? or * 2 : 2.0)));
    
    w = is_def(wall) ? wall : 0.5;
    
    inner_d1 = is_def(id1) ? id1 : (is_def(ir1) ? ir1 * 2 : (is_def(id) ? id : (is_def(ir) ? ir * 2 : outer_d1 - 2 * w)));
    inner_d2 = is_def(id2) ? id2 : (is_def(ir2) ? ir2 * 2 : (is_def(id) ? id : (is_def(ir) ? ir * 2 : outer_d2 - 2 * w)));

    difference() {
        cyl(h=len, d1=outer_d1, d2=outer_d2, realign=realign, orient=orient, align=align, center=center);
        cyl(h=len + 0.02, d1=inner_d1, d2=inner_d2, realign=realign, orient=orient, align=align, center=center);
    }
}

// 7. Torus Ring
module torus(r=undef, r2=undef, d=undef, d2=undef, or=undef, ir=undef, od=undef, id=undef, orient=ORIENT_Z, align=V_CENTER) {
    r_minor = 
        is_def(r2) ? r2 : (
        is_def(d2) ? d2 / 2 : (
        is_def(or) && is_def(ir) ? (or - ir) / 2 : (
        is_def(od) && is_def(id) ? (od - id) / 4 : 1.0
        )));
        
    r_major = 
        is_def(r) ? r : (
        is_def(d) ? d / 2 : (
        is_def(or) && is_def(ir) ? (or + ir) / 2 : (
        is_def(od) && is_def(id) ? (od + id) / 4 : 5.0
        )));
        
    size_box = [(r_major + r_minor) * 2, (r_major + r_minor) * 2, r_minor * 2];
    
    orient_and_align(size_box, orient, align, orig_orient=ORIENT_Z) {
        rotate_extrude() {
            translate([r_major, 0]) {
                circle(r=r_minor);
            }
        }
    }
}
