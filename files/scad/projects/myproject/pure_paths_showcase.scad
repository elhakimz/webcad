// WebCAD Pure SCAD High-Performance Paths & Sweeps Showcase
// Demonstrates native, library-free helical coils, twisted columns, hollow sweeps, and vector extrusions.
// NO EXTERNAL LIBRARIES OR BOSL USED.

$fn = 32;

// ==========================================
// 1. Vector Extrusion Module (Helper)
// ==========================================
module pure_extrude_from_to(pt1, pt2) {
    v = pt2 - pt1;
    d = norm(v);
    // standard OpenSCAD acos and atan2 return values in degrees
    pitch = acos(v[2] / d);
    yaw = atan2(v[1], v[0]);
    
    translate(pt1) {
        rotate([0, pitch, yaw]) {
            linear_extrude(height=d) {
                children();
            }
        }
    }
}


// ==========================================
// ROW 1 (y = 20): Helical Springs and Twisted Columns
// ==========================================

// 1. Helical Spring / Coil
echo("--- STARTING TEST 1: Pure Helical Spring ---");
translate([-20, 20, -10]) {
    color("crimson") {
        linear_extrude(height=20, twist=720, slices=80) {
            translate([7, 0, 0]) circle(r=2);
        }
    }
}

// 2. Twisted Star Column
echo("--- STARTING TEST 2: Pure Twisted Column ---");
translate([20, 20, -10]) {
    color("gold") {
        linear_extrude(height=20, twist=180, slices=60, scale=1.2) {
            difference() {
                circle(r=8, $fn=6);
                for (a = [30 : 60 : 360]) {
                    rotate([0, 0, a]) translate([8, 0, 0]) circle(r=2);
                }
            }
        }
    }
}


// ==========================================
// ROW 2 (y = -20): Hollow Star Shells and Vector Trees
// ==========================================

// 3. Twisted Hollow Star Shell
echo("--- STARTING TEST 3: Pure Hollow Shell ---");
translate([-20, -20, -10]) {
    color("limegreen") {
        linear_extrude(height=20, twist=90, slices=40) {
            difference() {
                circle(r=8, $fn=8);
                circle(r=6.5, $fn=8); // creates the hollow wall of thickness 1.5
            }
        }
    }
}

// 4. Vector Tree Structure (Multi-segment Extrusions)
echo("--- STARTING TEST 4: Pure Vector Tree ---");
translate([20, -20, -10]) {
    color("dodgerblue") {
        // Base trunk
        pure_extrude_from_to([0, 0, 0], [0, 0, 10]) circle(r=2);
        
        // Left branch
        pure_extrude_from_to([0, 0, 10], [-6, 0, 20]) circle(r=1.5);
        
        // Right branch
        pure_extrude_from_to([0, 0, 10], [6, 0, 20]) circle(r=1.5);
    }
}
