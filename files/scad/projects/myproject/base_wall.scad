// --------------------------------------------------------
// Parametric "Base Wall" (Planar Sheet Metal)
// --------------------------------------------------------

// The module applies a uniform thickness to ANY 2D shape provided to it.
module base_wall(thickness) {
    // linear_extrude pushes the 2D shape up along the Z-axis
    linear_extrude(height = thickness) {
        children(); // This pulls in whatever 2D geometry is nested inside the module call
    }
}

// ==========================================
// Example Usage & Visualization
// ==========================================

// Example 1: A simple rectangular Base Wall (e.g., a standard blank)
color("Silver")
base_wall(thickness = 2) {
    // This is your "Sketch"
    square([100, 50], center = true);
}

// Example 2: A Base Wall from a custom profile (Polygon)
translate([0, 70, 0])
color("LightSlateGray")
base_wall(thickness = 3) {
    // This represents a custom sketched boundary
    polygon(points=[
        [-40, -20], 
        [40, -20], 
        [60, 10], 
        [20, 40], 
        [-40, 10]
    ]);
}

// Example 3: A Base Wall with internal cutouts sketched directly into it
translate([0, -80, 0])
color("SteelBlue")
base_wall(thickness = 1.5) {
    // In CATIA, putting a circle inside another circle in a sketch creates a hole.
    // In OpenSCAD, we use 2D difference() inside the base_wall to achieve the same result.
    difference() {
        // Outer profile
        circle(d = 80, $fn=64);
        
        // Inner cutouts (holes)
        circle(d = 20, $fn=32);
        translate([25, 0, 0]) circle(d = 10, $fn=32);
        translate([-25, 0, 0]) circle(d = 10, $fn=32);
    }
}