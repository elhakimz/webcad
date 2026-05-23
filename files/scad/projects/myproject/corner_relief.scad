// --------------------------------------------------------
// Sheet Metal Corner Relief Simulation
// --------------------------------------------------------

// Standard Sheet Metal Parameters
t = 2;              // Material thickness
L = 30;             // Flange length
W = 30;             // Flange width
H = 20;             // Flange height
relief_r = 3.5;     // Radius of the corner relief cutout

// ==========================================
// 1. The "Bad" Corner (No Relief)
// ==========================================
// In reality, this corner would tear during folding.
translate([-40, 0, 0]) {
    color("IndianRed")
    union() {
        // Base plate (XY plane)
        cube([L, W, t]);
        // Front wall (XZ plane)
        cube([L, t, H]);
        // Side wall (YZ plane)
        cube([t, W, H]);
    }
}

// ==========================================
// 2. The "Good" Corner (With Relief)
// ==========================================
// We use a cylinder to cut away the intersecting material 
// at the exact junction of the three inner walls.
translate([10, 0, 0]) {
    color("SteelBlue")
    difference() {
        // Step A: Build the base overlapping corner
        union() {
            cube([L, W, t]);
            cube([L, t, H]);
            cube([t, W, H]);
        }
        
        // Step B: Cut out the corner relief
        // We place a cylinder exactly at the inner vertex [t, t]
        // We make it extra tall to ensure a clean boolean cut.
        translate([t, t, -1])
            cylinder(h = H + 2, r = relief_r, $fn = 64);
            
        // Optional: If you want to simulate a spherical dimple 
        // relief instead of a straight punch, you could use:
        // translate([t, t, t]) sphere(r = relief_r, $fn = 64);
    }
}

// Add some text labels for the viewer
color("black") {
    translate([-40, -10, 0]) 
        linear_extrude(1) text("No Relief (Tears)", size=4);
    translate([10, -10, 0]) 
        linear_extrude(1) text("With Corner Relief", size=4);
}