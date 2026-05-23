// --------------------------------------------------------
// Parametric Sheet Metal Dimple / Dowel Simulation
// --------------------------------------------------------

module dimpled_plate(length, width, thickness, dimple_x, dimple_y, radius, depth, draft_angle) {
    
    // 1. Calculate horizontal thickness offset to maintain normal wall thickness
    t_h = thickness / cos(draft_angle);
    
    // 2. Calculate Outer Cone Radii (The exterior metal surface)
    r_out_top = radius;
    r_out_bot = radius - (depth + thickness) * tan(draft_angle);
    
    // 3. Calculate Inner Cone Radii (The air / stamping punch)
    r_in_top = r_out_top - t_h;
    r_in_bot = r_out_bot - t_h;

    union() {
        // --- BASE PLATE ---
        difference() {
            // Position plate so the top face is at Z = 0
            translate([0, 0, -thickness])
                cube([length, width, thickness]);
            
            // Cut a hole exactly where the dimple begins
            translate([dimple_x, dimple_y, -thickness - 1])
                cylinder(h = thickness + 2, r = radius, $fn = 64);
        }
        
        // --- DIMPLE SHELL ---
        translate([dimple_x, dimple_y, 0]) {
            difference() {
                // The Outer Solid (Metal)
                translate([0, 0, -(depth + thickness)])
                    cylinder(h = depth + thickness, r1 = r_out_bot, r2 = r_out_top, $fn = 64);
                    
                // The Inner Cutout (Air)
                // We make the height +1 to ensure a clean Boolean cut at the top
                translate([0, 0, -depth])
                    cylinder(h = depth + 1, r1 = r_in_bot, r2 = r_in_top + 1 * tan(draft_angle), $fn = 64);
            }
        }
    }
}

// ==========================================
// Example Render (With Cross-Section Cutaway)
// ==========================================

difference() {
    color("SteelBlue")
    dimpled_plate(
        length = 75, 
        width = 75, 
        thickness = 2, 
        dimple_x = 25, 
        dimple_y = 25, 
        radius = 12, 
        depth = 8, 
        draft_angle = 25
    );
    
    // Boolean cut to remove the front half of the plate.
    // This allows you to inspect the constant thickness of the cross-section.
    translate([-5, -5, -20])
        cube([60, 30, 40]); 
}