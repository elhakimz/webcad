// GEOL (Geometric Engine Optimized Library) - Masks Module
// High-performance masking cutters for edge chamfers, fillets, cylinder rims, and hole entries.
// Designed with boundary-extensions to ensure robust OpenCascade boolean operations.
// Created: 2026-05-18

// 1. Chamfer Vertical Edge Cutter
module chamfer_edge_mask(l=10, chamfer=1) {
    rotate([0, 0, 45]) {
        cube([chamfer * 1.414, chamfer * 1.414, l + 2], center=true);
    }
}

// 2. Fillet Vertical Edge Cutter
module fillet_edge_mask(l=10, fillet=1) {
    difference() {
        translate([fillet/2, fillet/2, 0]) {
            cube([fillet * 1.05, fillet * 1.05, l + 2], center=true);
        }
        cylinder(r=fillet, h=l + 4, center=true, $fn=32);
    }
}

// 3. Chamfer Cylinder Rim Cutter (revolved cone trim)
module chamfer_cylinder_mask(d=10, h=10, chamfer=1) {
    r = d / 2;
    translate([0, 0, h/2]) {
        difference() {
            cylinder(r=r + 1, h=chamfer + 0.1, center=false, $fn=32);
            translate([0, 0, -0.05]) {
                cylinder(r1=r - chamfer, r2=r, h=chamfer + 0.2, center=false, $fn=32);
            }
        }
    }
}

// 4. Fillet Cylinder Rim Cutter (revolved round trim)
module fillet_cylinder_mask(d=10, h=10, fillet=1) {
    r = d / 2;
    translate([0, 0, h/2]) {
        rotate_extrude(angle=360, $fn=32) {
            polygon(points=concat(
                [[r - fillet, -0.1], [r + 1, -0.1], [r + 1, fillet]],
                [for (a = [0 : 10 : 90]) [r - fillet + fillet * sin(a), fillet * cos(a)]]
            ));
        }
    }
}

// 5. Chamfer Hole Entrance Cutter (countersink)
module chamfer_hole_mask(d=8, h=10, chamfer=1) {
    r = d / 2;
    translate([0, 0, h/2 - chamfer]) {
        cylinder(r1=r, r2=r + chamfer, h=chamfer + 0.1, center=false, $fn=32);
    }
}

// 6. Fillet Hole Entrance Cutter (rounded lip)
module fillet_hole_mask(d=8, h=10, fillet=1) {
    r = d / 2;
    translate([0, 0, h/2]) {
        rotate_extrude(angle=360, $fn=32) {
            polygon(points=concat(
                [[r, 0.1], [r, 0]],
                [for (a = [0 : 10 : 90]) [r + fillet - fillet * sin(a), -fillet * cos(a)]],
                [[r + fillet + 1, -fillet], [r + fillet + 1, 0.1]]
            ));
        }
    }
}
