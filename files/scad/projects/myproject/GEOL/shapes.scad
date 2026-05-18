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
