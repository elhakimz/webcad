// GEOL (Geometric Engine Optimized Library) - Shapes Module
// Custom geometric primitive shapes and advanced structured solids built natively.
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
function get_radius(r=undef, d=undef, default_val=1) =
    is_def(r) ? r : (is_def(d) ? d/2 : default_val);

// Helper to select the first defined value
function first_defined(arr, i=0) =
    (i >= len(arr)) ? undef : (is_def(arr[i]) ? arr[i] : first_defined(arr, i+1));

// Segment helper and quantizer for shapes
function quantup(val, step) = ceil(val/step)*step;
function segs(r) = is_def($fn) && $fn > 0 ? $fn : max(5, min(100, ceil(2 * 3.14159 * r / 2)));

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


// 1. Hexagonal Prism
module hexagon(d=10, h=5) {
    cylinder(d=d, h=h, center=true, $fn=6);
}

// 2. Star 2D Profile
module star_2d(r_outer=10, r_inner=5, points=5) {
    polygon(points=[
        for (i = [0 : points * 2 - 1])
            let (r = (i % 2 == 0) ? r_outer : r_inner)
            let (a = i * (180 / points))
            [r * cos(a), r * sin(a)]
    ]);
}

// 3. Twisted Star Column
module star_column(h=20, r_outer=10, r_inner=5, points=5, twist=90, scale=1.0, slices=40) {
    linear_extrude(height=h, twist=twist, scale=scale, slices=slices, center=true) {
        star_2d(r_outer=r_outer, r_inner=r_inner, points=points);
    }
}

// 4. Beveled Cube (Vertical edges chamfered)
module beveled_cube(size=[10, 10, 10], chamfer=1) {
    dx = size[0] / 2;
    dy = size[1] / 2;
    dz = size[2] / 2;
    
    difference() {
        cube(size, center=true);
        // Subtract 4 vertical corner chamfer cutters
        for (x = [-dx, dx]) {
            for (y = [-dy, dy]) {
                translate([x, y, 0]) {
                    rotate([0, 0, 45]) {
                        cube([chamfer * 1.414, chamfer * 1.414, size[2] + 2], center=true);
                    }
                }
            }
        }
    }
}

// 5. Rounded Cube (Vertical edges filleted)
module rounded_cube(size=[10, 10, 10], fillet=1) {
    dx = size[0] / 2;
    dy = size[1] / 2;
    dz = size[2] / 2;
    
    difference() {
        cube(size, center=true);
        // Subtract 4 vertical corner fillet cutters
        for (x = [-1, 1]) {
            for (y = [-1, 1]) {
                translate([x * (dx - fillet), y * (dy - fillet), -dz - 1]) {
                    difference() {
                        // The solid bounding box for the cutter
                        translate([x * fillet / 2, y * fillet / 2, dz + 1]) {
                            cube([fillet * 1.05, fillet * 1.05, size[2] + 4], center=true);
                        }
                        // Subtract the cylinder to leave the concave corner cutter
                        cylinder(r=fillet, h=size[2] + 4, $fn=32);
                    }
                }
            }
        }
    }
}

// 6. Prismoid
module prismoid(size1=[10,10], size2=[5,5], h=10, shift=[0,0], orient=ORIENT_Z, align=undef, center=undef) {
    // Determine alignment
    local_align = is_def(center) ? (center ? V_CENTER : [0, 0, 1]) : (is_def(align) ? align : [0, 0, 1]);
    
    // Z shift based on vertical centering
    z_shift = (local_align == V_CENTER || local_align == [0,0,0]) ? 0 : h/2;
    
    s = is_def(shift) ? shift : [0, 0];
    
    w1 = size1[0];
    l1 = size1[1];
    w2 = size2[0];
    l2 = size2[1];
    
    p0 = [-w1/2, -l1/2, -h/2];
    p1 = [ w1/2, -l1/2, -h/2];
    p2 = [ w1/2,  l1/2, -h/2];
    p3 = [-w1/2,  l1/2, -h/2];
    
    p4 = [-w2/2 + s[0], -l2/2 + s[1], h/2];
    p5 = [ w2/2 + s[0], -l2/2 + s[1], h/2];
    p6 = [ w2/2 + s[0],  l2/2 + s[1], h/2];
    p7 = [-w2/2 + s[0],  l2/2 + s[1], h/2];
    
    points = [p0, p1, p2, p3, p4, p5, p6, p7];
    faces = [
        [3, 2, 1, 0], // Bottom
        [4, 5, 6, 7], // Top
        [0, 1, 5, 4], // Front
        [1, 2, 6, 5], // Right
        [2, 3, 7, 6], // Back
        [3, 0, 4, 7]  // Left
    ];
    
    rotate(orient) {
        translate([0, 0, z_shift]) {
            polyhedron(points=points, faces=faces);
        }
    }
}

// Helper module for rounded_prismoid 2D profile
module rounded_rect_2d(w, l, r) {
    if (w <= 0.001 || l <= 0.001) {
        circle(r=0.0001);
    } else {
        actual_r = is_def(r) ? r : 0;
        if (actual_r <= 0.001) {
            square([w, l], center=true);
        } else {
            max_r = min(actual_r, w/2, l/2);
            hull() {
                dx = w/2 - max_r;
                dy = l/2 - max_r;
                for (x = [-dx, dx]) {
                    for (y = [-dy, dy]) {
                        translate([x, y]) circle(r=max_r);
                    }
                }
            }
        }
    }
}

// 7. Rounded Prismoid
module rounded_prismoid(size1=[10,10], size2=[5,5], h=10, r=undef, r1=undef, r2=undef, shift=[0,0], orient=ORIENT_Z, align=undef, center=undef) {
    rad1 = is_def(r1) ? r1 : (is_def(r) ? r : 0);
    rad2 = is_def(r2) ? r2 : (is_def(r) ? r : 0);
    
    local_align = is_def(center) ? (center ? V_CENTER : [0, 0, 1]) : (is_def(align) ? align : [0, 0, 1]);
    z_shift = (local_align == V_CENTER || local_align == [0,0,0]) ? 0 : h/2;
    
    s = is_def(shift) ? shift : [0, 0];
    
    w1 = size1[0];
    l1 = size1[1];
    w2 = size2[0];
    l2 = size2[1];
    
    rotate(orient) {
        translate([0, 0, z_shift]) {
            hull() {
                translate([0, 0, -h/2 + 0.0005]) {
                    linear_extrude(height=0.001, center=true) {
                        rounded_rect_2d(w1, l1, rad1);
                    }
                }
                translate([s[0], s[1], h/2 - 0.0005]) {
                    linear_extrude(height=0.001, center=true) {
                        rounded_rect_2d(w2, l2, rad2);
                    }
                }
            }
        }
    }
}

// 8. Right Triangle Prism
module right_triangle(size=[10,10,10], orient=ORIENT_Y, align=undef, center=undef) {
    w = size[0];
    t = size[1];
    h = size[2];
    
    local_align = is_def(center) ? (center ? V_CENTER : [1, 1, 1]) : (is_def(align) ? align : [1, 1, 1]);
    
    tx = (local_align[0] - 1) * w / 2;
    ty = (local_align[1] - 1) * t / 2;
    tz = (local_align[2] - 1) * h / 2;
    
    rotate(orient) {
        translate([tx, ty, tz]) {
            translate([0, t/2, 0]) {
                rotate([90, 0, 0]) {
                    linear_extrude(height=t, center=true) {
                        polygon(points=[[0,0], [w,0], [0,h]]);
                    }
                }
            }
        }
    }
}

// 9. Teardrop 2D Profile
module teardrop2d(r=1, d=undef, ang=45, cap_h=undef) {
    eps = 0.01;
    rad = get_radius(r, d, 1);
    
    safe_ang = (ang > 0 && ang < 90) ? ang : 45;
    cord = 2 * rad * cos(safe_ang);
    cord_h = rad * sin(safe_ang);
    
    tip_y = (cord / 2) / tan(safe_ang);
    local_cap_h = is_def(cap_h) ? min(cap_h, tip_y + cord_h) : (tip_y + cord_h);
    cap_w = (tip_y > 0.001) ? cord * (1 - (local_cap_h - cord_h) / tip_y) : 0.001;
    
    difference() {
        hull() {
            rotate([0, 0, 90]) {
                circle(r=rad, $fn=(is_def($fn) ? $fn : 32));
            }
            translate([0, local_cap_h - eps / 2]) {
                square([max(eps, cap_w), eps], center=true);
            }
        }
        translate([0, rad + local_cap_h]) {
            square(2 * rad, center=true);
        }
    }
}

// 10. 3D Teardrop Shape
module teardrop(r=undef, d=undef, l=undef, h=undef, ang=45, cap_h=undef, orient=ORIENT_Y, align=V_CENTER) {
    rad = get_radius(r, d, 1);
    length = first_defined([l, h, 1.0]);
    
    orient_and_align([rad * 2, rad * 2, length], orient, align, orig_orient=ORIENT_Z) {
        linear_extrude(height=length, center=true, slices=2) {
            teardrop2d(r=rad, ang=ang, cap_h=cap_h);
        }
    }
}

// 11. Onion Shape (3D Teardrop)
module onion(cap_h=undef, r=undef, d=undef, maxang=45, h=undef, orient=ORIENT_Z, align=V_CENTER) {
    rad = get_radius(r, d, 1);
    height_cap = first_defined([cap_h, h]);
    
    safe_ang = (maxang > 0 && maxang < 90) ? maxang : 45;
    r_tangent = rad * cos(safe_ang);
    h_tangent = rad * sin(safe_ang);
    h_tip = rad / sin(safe_ang);
    h_cone = h_tip - h_tangent;
    
    local_cap_h = is_def(height_cap) ? min(height_cap, h_tip) : h_tip;
    z_center = (local_cap_h - rad) / 2;
    
    orient_and_align([rad * 2, rad * 2, rad + local_cap_h], orient, align, orig_orient=ORIENT_Z) {
        translate([0, 0, -z_center]) {
            difference() {
                union() {
                    sphere(r=rad, $fn=(is_def($fn) ? $fn : 32));
                    translate([0, 0, h_tangent - 0.001]) {
                        cylinder(r1=r_tangent, r2=0, h=h_cone + 0.001, $fn=(is_def($fn) ? $fn : 32));
                    }
                }
                if (is_def(height_cap)) {
                    translate([0, 0, local_cap_h + rad]) {
                        cube([rad * 4, rad * 4, rad * 2], center=true);
                    }
                }
            }
        }
    }
}


// 12. Narrowing Strut
module narrowing_strut(w=10, l=100, wall=5, ang=30, orient=ORIENT_Y, align=V_UP) {
    h = wall + w / 2 / tan(ang);
    
    orient_and_align([w, h, l], orient, align, orig_orient=ORIENT_Z) {
        translate([0, -h/2, 0]) {
            linear_extrude(height=l, center=true, slices=2) {
                translate([0, wall/2]) {
                    square([w, wall], center=true);
                }
                translate([0, wall - 0.001]) {
                    scale([1, 1/tan(ang)]) {
                        difference() {
                            rotate([0, 0, 45]) {
                                square(w / sqrt(2), center=true);
                            }
                            translate([0, -w/2]) {
                                square(w, center=true);
                            }
                        }
                    }
            }
        }
    }
}
}


// 13. Thinning Wall
module thinning_wall(h=50, l=100, thick=5, ang=30, strut=5, wall=2, orient=ORIENT_X, align=V_CENTER) {
    l1 = (l[0] == undef) ? l : l[0];
    l2 = (l[1] == undef) ? l : l[1];

    trap_ang = atan2((l2-l1)/2, h);
    corr1 = 1 + sin(trap_ang);
    corr2 = 1 - sin(trap_ang);

    z1 = h/2;
    z2 = max(0.1, z1 - strut);
    z3 = max(0.05, z2 - (thick-wall)/2*sin(90-ang)/sin(ang));

    x1 = l2/2;
    x2 = max(0.1, x1 - strut*corr1);
    x3 = max(0.05, x2 - (thick-wall)/2*sin(90-ang)/sin(ang)*corr1);
    x4 = l1/2;
    x5 = max(0.1, x4 - strut*corr2);
    x6 = max(0.05, x5 - (thick-wall)/2*sin(90-ang)/sin(ang)*corr2);

    y1 = thick/2;
    y2 = y1 - min(z2-z3, x2-x3) * sin(ang);

    orient_and_align([l1, thick, h], orient, align, orig_orient=ORIENT_X) {
        polyhedron(
            points=[
                [-x4, -y1, -z1],
                [ x4, -y1, -z1],
                [ x1, -y1,  z1],
                [-x1, -y1,  z1],

                [-x5, -y1, -z2],
                [ x5, -y1, -z2],
                [ x2, -y1,  z2],
                [-x2, -y1,  z2],

                [-x6, -y2, -z3],
                [ x6, -y2, -z3],
                [ x3, -y2,  z3],
                [-x3, -y2,  z3],

                [-x4,  y1, -z1],
                [ x4,  y1, -z1],
                [ x1,  y1,  z1],
                [-x1,  y1,  z1],

                [-x5,  y1, -z2],
                [ x5,  y1, -z2],
                [ x2,  y1,  z2],
                [-x2,  y1,  z2],

                [-x6,  y2, -z3],
                [ x6,  y2, -z3],
                [ x3,  y2,  z3],
                [-x3,  y2,  z3],
            ],
            faces=[
                [ 4,  5,  1],
                [ 5,  6,  2],
                [ 6,  7,  3],
                [ 7,  4,  0],

                [ 4,  1,  0],
                [ 5,  2,  1],
                [ 6,  3,  2],
                [ 7,  0,  3],

                [ 8,  9,  5],
                [ 9, 10,  6],
                [10, 11,  7],
                [11,  8,  4],

                [ 8,  5,  4],
                [ 9,  6,  5],
                [10,  7,  6],
                [11,  4,  7],

                [11, 10,  9],
                [20, 21, 22],

                [11,  9,  8],
                [20, 22, 23],

                [16, 17, 21],
                [17, 18, 22],
                [18, 19, 23],
                [19, 16, 20],

                [16, 21, 20],
                [17, 22, 21],
                [18, 23, 22],
                [19, 20, 23],

                [12, 13, 17],
                [13, 14, 18],
                [14, 15, 19],
                [15, 12, 16],

                [12, 17, 16],
                [13, 18, 17],
                [14, 19, 18],
                [15, 16, 19],

                [ 0,  1, 13],
                [ 1,  2, 14],
                [ 2,  3, 15],
                [ 3,  0, 12],

                [ 0, 13, 12],
                [ 1, 14, 13],
                [ 2, 15, 14],
                [ 3, 12, 15],
            ],
            convexity=6
        );
    }
}

// 14. Braced Thinning Wall
module braced_thinning_wall(h=50, l=100, thick=5, ang=30, strut=5, wall=2, orient=ORIENT_Y, align=V_CENTER) {
    dang = atan(h/l);
    dlen = (h/sin(dang)) * 1.2;
    orient_and_align([thick, l, h], orient, align, orig_orient=ORIENT_Y) {
        union() {
            // Symmetrical copy 1: 0 degrees around X axis
            union() {
                translate([0, 0, -h/2]) {
                    narrowing_strut(w=thick, l=l, wall=strut, ang=ang);
                }
                translate([0, -l/2, 0]) {
                    rotate([-90, 0, 0]) {
                        narrowing_strut(w=thick, l=h-0.1, wall=strut, ang=ang);
                    }
                }
                intersection() {
                    cube(size=[thick + 2, l, h], center=true);
                    union() {
                        // Diagonal cross-brace copy 1: -dang
                        rotate([-dang, 0, 0]) {
                            rotate([90, 0, 0]) linear_extrude(height=dlen, center=true) {
                                polygon(points=[
                                    [0, strut/4 + thick*1.5/2],
                                    [thick/2, strut/4],
                                    [thick/2, -strut/4],
                                    [0, -strut/4 - thick*1.5/2],
                                    [-thick/2, -strut/4],
                                    [-thick/2, strut/4]
                                ]);
                            }
                        }
                        // Diagonal cross-brace copy 2: dang
                        rotate([dang, 0, 0]) {
                            rotate([90, 0, 0]) linear_extrude(height=dlen, center=true) {
                                polygon(points=[
                                    [0, strut/4 + thick*1.5/2],
                                    [thick/2, strut/4],
                                    [thick/2, -strut/4],
                                    [0, -strut/4 - thick*1.5/2],
                                    [-thick/2, -strut/4],
                                    [-thick/2, strut/4]
                                ]);
                            }
                        }
                    }
                }
            }
            // Symmetrical copy 2: 180 degrees around X axis
            rotate([180, 0, 0]) {
                union() {
                    translate([0, 0, -h/2]) {
                        narrowing_strut(w=thick, l=l, wall=strut, ang=ang);
                    }
                    translate([0, -l/2, 0]) {
                        rotate([-90, 0, 0]) {
                            narrowing_strut(w=thick, l=h-0.1, wall=strut, ang=ang);
                        }
                    }
                    intersection() {
                        cube(size=[thick + 2, l, h], center=true);
                        union() {
                            // Diagonal cross-brace copy 1: -dang
                            rotate([-dang, 0, 0]) {
                                rotate([90, 0, 0]) linear_extrude(height=dlen, center=true) {
                                    polygon(points=[
                                        [0, strut/4 + thick*1.5/2],
                                        [thick/2, strut/4],
                                        [thick/2, -strut/4],
                                        [0, -strut/4 - thick*1.5/2],
                                        [-thick/2, -strut/4],
                                        [-thick/2, strut/4]
                                    ]);
                                }
                            }
                            // Diagonal cross-brace copy 2: dang
                            rotate([dang, 0, 0]) {
                                rotate([90, 0, 0]) linear_extrude(height=dlen, center=true) {
                                    polygon(points=[
                                        [0, strut/4 + thick*1.5/2],
                                        [thick/2, strut/4],
                                        [thick/2, -strut/4],
                                        [0, -strut/4 - thick*1.5/2],
                                        [-thick/2, -strut/4],
                                        [-thick/2, strut/4]
                                    ]);
                                }
                            }
                        }
                    }
                }
            }
            // Center thinned wall web
            cube(size=[wall, l-0.1, h-0.1], center=true);

            // Corner-filling solid blocks to ensure 100% continuous watertight corner joins
            intersection() {
                cube(size=[thick, l, h], center=true);
                union() {
                    for (sy = [-1, 1]) {
                        for (sz = [-1, 1]) {
                            translate([0, sy * (l/2 - strut), sz * (h/2 - strut)]) {
                                cube(size=[thick, strut * 3, strut * 3], center=true);
                            }
                        }
                    }
                }
            }
        }
    }
}

// 15. Thinning Triangle
module thinning_triangle(h=50, l=100, thick=5, ang=30, strut=5, wall=3, diagonly=false, center=undef, orient=ORIENT_Y, align=V_CENTER) {
    dang = atan(h/l);
    dlen = h/sin(dang);
    align_resolved = is_def(center) ? (center ? V_CENTER : (V_UP + V_BACK)) : align;

    orient_and_align([thick, l, h], orient, align_resolved, orig_orient=ORIENT_Y) {
        difference() {
            union() {
                if (!diagonly) {
                    translate([0, 0, -h/2]) {
                        narrowing_strut(w=thick, l=l, wall=strut, ang=ang);
                    }
                    translate([0, -l/2, 0]) {
                        rotate([-90, 0, 0]) {
                            narrowing_strut(w=thick, l=h-0.1, wall=strut, ang=ang);
                        }
                    }
                }
                intersection() {
                    cube(size=[thick, l, h], center=true);
                    rotate([-dang, 0, 0]) rotate([0, 180, 0]) {
                        narrowing_strut(w=thick, l=dlen*1.2, wall=strut, ang=ang);
                    }
                }
                cube(size=[wall, l-0.1, h-0.1], center=true);
            }
            rotate([-dang, 0, 0]) {
                translate([0, 0, h/2]) {
                    cube(size=[thick+0.1, l*2, h], center=true);
                }
            }
        }
    }
}

// 16. Spiral Polyline
// Generates a 3D spiral polyline along any specified axis (x/y/z) with 3 diameters (origin, middle, end)
// interpolated using a quadratic polynomial D(t) = a*t^2 + b*t + c.
module spiral_polyline(d_origin=10, d_middle=15, d_end=20, h=50, axis="z", turns=5, thickness=1.5, center=true, $fn=100) {
    steps = is_def($fn) ? $fn : 100;
    
    // We solve for the coefficients of the quadratic interpolation for the diameter envelope:
    // D(t) = a * t^2 + b * t + c
    // D(0) = d_origin
    // D(0.5) = d_middle
    // D(1) = d_end
    a = 2 * d_origin - 4 * d_middle + 2 * d_end;
    b = -3 * d_origin + 4 * d_middle - d_end;
    c = d_origin;

    // Pre-calculate all points in a list using a list comprehension
    points = [
        for (i = [0 : steps])
            let (t = i / steps)
            let (r = (a * t * t + b * t + c) / 2)
            let (theta = t * turns * 360)
            let (pos_along = center ? (t - 0.5) * h : t * h)
            (axis == "x" || axis == "X") ? [pos_along, r * cos(theta), r * sin(theta)] :
            (axis == "y" || axis == "Y") ? [r * sin(theta), pos_along, r * cos(theta)] :
                                           [r * cos(theta), r * sin(theta), pos_along]
    ];

    // Connect consecutive points with spheres and cylinders
    union() {
        for (i = [0 : steps - 1]) {
            p1 = points[i];
            p2 = points[i+1];
            v = p2 - p1;
            len = sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
            union() {
                translate(p1) sphere(r=thickness/2, $fn=8);
                if (len > 1e-6) {
                    translate(p1)
                    rotate([0, acos(v[2]/len), atan2(v[1], v[0])])
                    cylinder(r=thickness/2, h=len, $fn=8);
                }
                if (i == steps - 1) {
                    translate(p2) sphere(r=thickness/2, $fn=8);
                }
            }
        }
    }
}

// 17. Sparse Strut (2D frame with internal truss/webbing)
module sparse_strut(h=50, l=100, thick=4, maxang=30, strut=5, max_bridge=20, orient=ORIENT_Y, align=V_CENTER) {
    zoff = h/2 - strut/2;
    yoff = l/2 - strut/2;

    maxhyp = 1.5 * (max_bridge+strut)/2 / sin(maxang);
    maxz = 2 * maxhyp * cos(maxang);

    zreps = ceil(2*zoff/maxz);
    zstep = 2*zoff / zreps;

    hyp = zstep/2 / cos(maxang);
    maxy = min(2 * hyp * sin(maxang), max_bridge+strut);

    yreps = ceil(2*yoff/maxy);
    ystep = 2*yoff / yreps;

    ang = atan(ystep/zstep);
    len = zstep / cos(ang);

    orient_and_align([thick, l, h], orient, align, orig_orient=ORIENT_Y) {
        // Top and bottom chords
        for (z = [-zoff, zoff]) {
            translate([0, 0, z]) cube(size=[thick, l, strut], center=true);
        }
        // End posts
        for (y = [-yoff, yoff]) {
            translate([0, y, 0]) cube(size=[thick, strut, h], center=true);
        }
        // Webbing diagonals
        for (yi = [0 : yreps - 1]) {
            ypos = (yi - (yreps - 1) / 2) * ystep;
            for (zi = [0 : zreps - 1]) {
                zpos = (zi - (zreps - 1) / 2) * zstep;
                translate([0, ypos, zpos]) {
                    rotate([ang, 0, 0]) cube(size=[thick, strut, len], center=true);
                    rotate([-ang, 0, 0]) cube(size=[thick, strut, len], center=true);
                }
            }
        }
    }
}

// 18. Sparse Strut 3D (3D structural truss constructed from 6 boundary sparse struts + inner diagonal sparse struts)
module sparse_strut3d(h=50, l=100, w=50, thick=3, maxang=40, strut=3, max_bridge=30, orient=ORIENT_Y, align=V_CENTER) {
    xoff = w - thick;
    yoff = l - thick;
    zoff = h - thick;

    // Diagonal calculations for inner cross struts
    d_inner = sqrt(xoff*xoff + yoff*yoff);
    ang_inner = atan2(xoff, yoff);

    orient_and_align([w, l, h], orient, align, orig_orient=ORIENT_Y) {
        // 1 & 2: Left and Right boundary struts
        for (xs = [-xoff/2, xoff/2]) {
            translate([xs, 0, 0]) {
                sparse_strut(h=h, l=l, thick=thick, maxang=maxang, strut=strut, max_bridge=max_bridge);
            }
        }

        // 3 & 4: Front and Back boundary struts
        for (ys = [-yoff/2, yoff/2]) {
            translate([0, ys, 0]) {
                rotate([0, 0, 90]) {
                    sparse_strut(h=h, l=w, thick=thick, maxang=maxang, strut=strut, max_bridge=max_bridge);
                }
            }
        }

        // 5 & 6: Top and Bottom boundary struts
        for (zs = [-zoff/2, zoff/2]) {
            translate([0, 0, zs]) {
                rotate([0, 90, 0]) {
                    sparse_strut(h=w, l=l, thick=thick, maxang=maxang, strut=strut, max_bridge=max_bridge);
                }
            }
        }

        // Inner diagonal cross-bracing sparse struts
        rotate([0, 0, ang_inner]) {
            sparse_strut(h=zoff, l=d_inner, thick=thick, maxang=maxang, strut=strut, max_bridge=max_bridge);
        }
        rotate([0, 0, -ang_inner]) {
            sparse_strut(h=zoff, l=d_inner, thick=thick, maxang=maxang, strut=strut, max_bridge=max_bridge);
        }
    }
}

// 19. Corrugated Wall (Wavy stress-relieved wall)
module corrugated_wall(h=50, l=100, thick=5, strut=5, wall=2, orient=ORIENT_Y, align=V_CENTER) {
    amplitude = (thick - wall) / 2;
    period = min(15, thick * 2);
    steps = quantup(segs(thick/2), 4);
    step = period/steps;
    il = l - 2*strut + 2*step;
    orient_and_align([thick, l, h], orient, align, orig_orient=ORIENT_Y) {
        linear_extrude(height=h-2*strut+0.1, slices=2, convexity=ceil(2*il/period), center=true) {
            polygon(
                points=concat(
                    [for (y=[-il/2:step:il/2]) [amplitude*sin(y/period*360)-wall/2, y] ],
                    [for (y=[il/2:-step:-il/2]) [amplitude*sin(y/period*360)+wall/2, y] ]
                )
            );
        }

        difference() {
            cube([thick, l, h], center=true);
            cube([thick+0.5, l-2*strut, h-2*strut], center=true);
        }
    }
}
