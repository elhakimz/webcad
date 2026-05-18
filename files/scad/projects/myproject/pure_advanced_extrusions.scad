// WebCAD Pure Advanced Extrusions Showcase
// Implements 3 complex BOSL path extrusion modules in pure SCAD.
// NO EXTERNAL LIBRARIES OR BOSL USED.

$fn = 32;

// ==========================================
// 1. Pure SCAD Module Definitions
// ==========================================

// Module 1: extrude_from_to
module extrude_from_to(pt1, pt2, twist=undef, scale=undef, slices=undef) {
    v = pt2 - pt1;
    d = norm(v);
    pitch = acos(v[2] / d);
    yaw = atan2(v[1], v[0]);
    
    translate(pt1) {
        rotate([0, pitch, yaw]) {
            linear_extrude(height=d, twist=twist, scale=scale, slices=slices) {
                children();
            }
        }
    }
}

// Module 2: extrude_2d_hollow
module extrude_2d_hollow(wall=2, height=50, twist=90, slices=60) {
    linear_extrude(height=height, twist=twist, slices=slices) {
        difference() {
            children();
            offset(r=-wall) {
                children();
            }
        }
    }
}

// Module 3: extrude_2dpath_along_spiral
module extrude_2dpath_along_spiral(h, r, twist=360, steps=30) {
    for (p = [0 : steps - 1]) {
        a1 = twist * (p / steps);
        pt1 = [r * cos(a1), r * sin(a1), h * (p / steps)];
        
        a2 = twist * ((p + 1) / steps);
        pt2 = [r * cos(a2), r * sin(a2), h * ((p + 1) / steps)];
        
        extrude_from_to(pt1, pt2) {
            children();
        }
    }
}


// ==========================================
// 2. Showcase Grid Layout
// ==========================================

// Test 1: extrude_from_to
echo("--- STARTING TEST 1: extrude_from_to ---");
translate([-30, 0, -15]) {
    color("crimson") {
        extrude_from_to([0,0,0], [10,20,30], twist=360, scale=3.0, slices=40) {
            // Pure SCAD equivalent of xspread(3)
            translate([-3, 0]) circle(r=2, $fn=32);
            translate([3, 0]) circle(r=2, $fn=32);
        }
    }
}

// Test 2: extrude_2d_hollow
echo("--- STARTING TEST 2: extrude_2d_hollow ---");
translate([0, 0, -15]) {
    color("limegreen") {
        extrude_2d_hollow(wall=1.5, height=30, twist=90, slices=50) {
            circle(r=10, $fn=6);
        }
    }
}

// Test 3: extrude_2dpath_along_spiral
echo("--- STARTING TEST 3: extrude_2dpath_along_spiral ---");
translate([30, 0, -20]) {
    color("dodgerblue") {
        poly = [[-4,0], [-1,-2], [1,-2], [4,0], [0,-8]];
        extrude_2dpath_along_spiral(h=40, r=15, twist=720, steps=32) {
            polygon(points=poly);
        }
    }
}
