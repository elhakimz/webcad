// =====================================================================
// Parametric Flanged Hole (Sheet Metal Piercing) for OpenSCAD
// =====================================================================

module flanged_hole(hole_r, flange_h, t, bend_r, plate_r, sweep_angle=360) {
    // RESOLUTION: Number of fragments for smooth arcs
    $fn = 64; 
    
    // We define the 2D polygon in the +X, +Y quadrant.
    // X axis = radial distance from the center of the hole.
    // Y axis = Z-height of the final 3D part.
    
    // Center of the bend arcs.
    // To maintain uniform thickness 't', the inner and outer arcs MUST share a center point.
    cx = hole_r + t + bend_r;
    cy = bend_r;

    // Generate the 3D revolved geometry
    rotate_extrude(angle = sweep_angle) {
        polygon([
            // 1. Top of the vertical flange (Inner to Outer edge)
            [hole_r, flange_h],
            [hole_r + t, flange_h],
            
            // 2. Straight vertical wall (Outer surface, going down to bend)
            [hole_r + t, cy],
            
            // 3. Inner Bend Arc (connecting Outer Flange to Top Plate)
            // Center is [cx, cy], radius is bend_r
            // Sweeps from left (180 deg) to bottom (270 deg)
            for (a = [180 : -5 : 270]) 
                [ cx + bend_r * cos(a), cy + bend_r * sin(a) ],
                
            // 4. Straight horizontal wall (Top surface of the plate)
            [cx, 0], // Ensures flush connection
            [plate_r, 0],
            
            // 5. Plate Outer Edge (Drop down by thickness)
            [plate_r, -t],
            
            // 6. Straight horizontal wall (Bottom surface of the plate)
            [cx, -t],
            
            // 7. Outer Bend Arc (connecting Bottom Plate to Inner Flange)
            // Center is [cx, cy], radius is bend_r + t (Crucial for uniform thickness!)
            // Sweeps from bottom (270 deg) back up to left (180 deg)
            for (a = [270 : 5 : 180]) 
                [ cx + (bend_r + t) * cos(a), cy + (bend_r + t) * sin(a) ],
                
            // 8. Straight vertical wall (Inner surface, going up to top)
            [hole_r, cy]
            
            // Polygon automatically closes back to [hole_r, flange_h]
        ]);
    }
}

// ==========================================
// Example Usage & Visualization
// ==========================================

// Render a Flanged Hole with a 270-degree cutaway to see the cross-section
color("SteelBlue")
flanged_hole(
    hole_r = 10,       // Radius of the final pierced hole
    flange_h = 12,     // Height of the flange above the plate
    t = 2,             // Sheet metal thickness
    bend_r = 3,        // Inner radius of the forming die
    plate_r = 40,      // Total radius of the base plate to generate
    sweep_angle = 270  // Set to 360 for a complete part
);

// Add a flat reference plane to visualize Z=0 (Top surface of the unformed plate)
%color("LightSlateGray", 0.3)
translate([0,0, -2]) 
    cylinder(r=45, h=2, $fn=64);