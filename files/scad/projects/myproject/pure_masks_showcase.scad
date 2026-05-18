// WebCAD Pure SCAD Masks and Edge Treatments Showcase
// Demonstrates how to implement chamfers, fillets, edge cuts, and hole masks mathematically from scratch.
// NO EXTERNAL LIBRARIES OR BOSL USED.

$fn = 32;

// ==========================================
// ROW 1 (y = 20): Cube Edge Treatments and Chamfer Cylinder
// ==========================================

// 1. Chamfer Cube Edge
echo("--- STARTING TEST 1: Chamfer Edge Mask ---");
translate([-25, 20, 0]) {
    color("crimson") {
        difference() {
            cube([15, 15, 15], center=true);
            // Chamfer cutter rotated 45 degrees cutting the top-right edge
            translate([7.5, 7.5, 0]) {
                rotate([0, 0, 45]) {
                    cube([6, 6, 20], center=true);
                }
            }
        }
    }
}

// 2. Fillet Cube Edge
echo("--- STARTING TEST 2: Fillet Edge Mask ---");
translate([0, 20, 0]) {
    color("gold") {
        difference() {
            cube([15, 15, 15], center=true);
            // Fillet cutter cutting the top-right edge
            translate([7.5 - 3, 7.5 - 3, -10]) {
                difference() {
                    cube([3.1, 3.1, 20], center=false);
                    translate([0, 0, -1]) {
                        cylinder(r=3, h=22, $fn=32);
                    }
                }
            }
        }
    }
}

// 3. Chamfer Cylinder Top Edge
echo("--- STARTING TEST 3: Chamfer Cylinder Mask ---");
translate([25, 20, -7.5]) {
    color("limegreen") {
        // Revolve a beveled profile to build a chamfered cylinder
        chamfer_profile = [
            [0, 0],
            [7.5, 0],
            [7.5, 13],
            [5.5, 15],
            [0, 15]
        ];
        rotate_extrude(angle=360) {
            polygon(points=chamfer_profile);
        }
    }
}


// ==========================================
// ROW 2 (y = -20): Fillet Cylinder and Hole Entrance Treatments
// ==========================================

// 4. Fillet Cylinder Top Edge
echo("--- STARTING TEST 4: Fillet Cylinder Mask ---");
translate([-25, -20, -7.5]) {
    color("teal") {
        // Revolve a profile with a circular top-right corner
        fillet_profile = concat(
            [[0, 0], [7.5, 0]],
            [for (a = [0 : 10 : 90]) [5.5 + 2 * cos(a), 13 + 2 * sin(a)]],
            [[0, 15]]
        );
        rotate_extrude(angle=360) {
            polygon(points=fillet_profile);
        }
    }
}

// 5. Chamfer Hole Mask
echo("--- STARTING TEST 5: Chamfer Hole Mask ---");
translate([0, -20, 0]) {
    color("dodgerblue") {
        difference() {
            cube([15, 15, 10], center=true);
            // Cylinder hole
            cylinder(d=8, h=12, center=true, $fn=32);
            // Conical chamfer cutter at top entrance
            translate([0, 0, 5 - 1]) {
                cylinder(d1=8, d2=10, h=1.1, center=false, $fn=32);
            }
        }
    }
}

// 6. Fillet Hole Mask
echo("--- STARTING TEST 6: Fillet Hole Mask ---");
translate([25, -20, 0]) {
    color("orchid") {
        difference() {
            cube([15, 15, 10], center=true);
            // Cylinder hole
            cylinder(d=8, h=12, center=true, $fn=32);
            // Revolved fillet cutter translated to top of the hole rim (extends above z=5 to avoid coplanar collision)
            translate([0, 0, 5]) {
                rotate_extrude(angle=360) {
                    polygon(points=concat(
                        [[4, 1], [4, 0]],
                        [for (a = [0 : 10 : 90]) [5 - sin(a), -cos(a)]],
                        [[6, -1], [6, 1]]
                    ));
                }
            }
        }
    }
}
