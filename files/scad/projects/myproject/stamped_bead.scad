// --------------------------------------------------------
// Parametric Sheet Metal Bead (Stiffening Rib)
// --------------------------------------------------------

$fn = 32; // Resolution for spheres and cylinders (keep reasonable to avoid lag)

// --------------------------------------------------------
// Helper Modules for Sweeping
// --------------------------------------------------------

// Sweeps a 3D sphere along an array of points
module path_tube(pts, r) {
    for (i = [0 : len(pts) - 2]) {
        hull() {
            translate([pts[i][0], pts[i][1], 0]) sphere(r=r);
            translate([pts[i+1][0], pts[i+1][1], 0]) sphere(r=r);
        }
    }
}

// Sweeps a 2D circle along an array of points (for base plate cutting)
module path_footprint(pts, r) {
    for (i = [0 : len(pts) - 2]) {
        hull() {
            translate([pts[i][0], pts[i][1], 0]) circle(r=r);
            translate([pts[i+1][0], pts[i+1][1], 0]) circle(r=r);
        }
    }
}

// Discards anything below Z = 0
module keep_top_half() {
    intersection() {
        children();
        // A massive bounding box starting exactly at Z=0
        translate([-5000, -5000, 0]) cube([10000, 10000, 5000]);
    }
}

// --------------------------------------------------------
// Main Feature Module
// --------------------------------------------------------

module stamped_bead(points, radius, thickness) {
    r_in = radius - thickness;

    difference() {
        // 1. Add the raised metal to the base plate
        union() {
            children(); // The base plate passed by the user
            
            // Add the upper half of the swept outer tube
            keep_top_half() path_tube(points, radius);
        }
        
        // 2. Subtract the inner volumes to hollow it out
        if (r_in > 0) {
            // Hollow out the top bead
            keep_top_half() path_tube(points, r_in);
            
            // Punch the exact footprint through the base plate
            translate([0, 0, -thickness - 1])
                linear_extrude(height = thickness + 2)
                    path_footprint(points, r_in);
        }
    }
}

// ==========================================
// Example Usage & Visualization
// ==========================================

// Global Parameters
sheet_t = 1.5;
bead_r = 4; // Radius of the stamped rib

// Define Path 1: A simple straight line
straight_path = [ [10, 10], [50, 10] ];

// Define Path 2: A curved path (simulating a complex stiffener)
curved_path = [
    [10, 30],
    [25, 30],
    [35, 40], // Angled transition
    [35, 55],
    [25, 65]  // Curve back
];

// Assembly
color("SteelBlue") {
    // We apply both beads to a single base plate
    stamped_bead(points = straight_path, radius = bead_r, thickness = sheet_t) {
        stamped_bead(points = curved_path, radius = bead_r, thickness = sheet_t) {
            
            // The main base plate geometry
            translate([0, 0, -sheet_t])
                cube([60, 75, sheet_t]);
                
        }
    }
}