// GEOL (Geometric Engine Optimized Library) - Shapes Module
// Custom geometric primitive shapes and advanced structured solids built natively.
// Created: 2026-05-18

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
