// --------------------------------------------------------
// FIXED: Parametric Sheet Metal Louver
// --------------------------------------------------------

// Module 1: The Cutout Tool
module louver_cutout(length, width, thickness) {
    // Extended Z-bounds to ensure a clean boolean cut all the way through
    translate([0, -width/2, -thickness - 1])
        cube([length, width, thickness + 2]);
}

// Module 2: The Stamped Flap & Sheared Walls
module rounded_louver_flap(length, width, height, thickness, radius) {
    // 1. Math Setup & Safety Clamps
    angle = max(atan2(height, length), 0.01); 
    
    // Prevent the radius from being physically too large for the requested length
    max_r = (length * 0.9) / sin(angle);
    r_in = min(max(radius, 0.001), max_r); 
    r_out = r_in + thickness;
    
    // 2. Calculate Exact Tangent Endpoints for the Roof
    tip_ix = length;
    tip_iy = (r_in - r_in * cos(angle)) + (length - r_in * sin(angle)) * tan(angle);
    
    // Offset the outer tip perpendicular to the roof angle to maintain thickness
    tip_ox = tip_ix + thickness * sin(angle);
    tip_oy = tip_iy - thickness * cos(angle);

    // 3. Construct perfectly matching 2D profiles
    // This traces the inner bend, goes to the tip, offsets, and traces the outer bend back
    flap_points = concat(
        [ for (a = [0 : angle]) [ r_in * sin(a), r_in - r_in * cos(a) ] ],
        [ [tip_ix, tip_iy], [tip_ox, tip_oy] ],
        [ for (a = [angle : -1 : 0]) [ r_out * sin(a), r_in - r_out * cos(a) ] ]
    );
    
    // The side wall perfectly traces the inner roof profile backwards to prevent poking through
    wall_points = concat(
        [ [0,0], [tip_ix, 0], [tip_ix, tip_iy] ],
        [ for (a = [angle : -1 : 0]) [ r_in * sin(a), r_in - r_in * cos(a) ] ]
    );

    union() {
        // A. The Rounded Roof Flap
        translate([0, width/2, 0])
            rotate([90, 0, 0])
                linear_extrude(height = width)
                    polygon(flap_points);
                    
        // B. The Left Sheared Wall
        translate([0, -width/2 + thickness, 0])
            rotate([90, 0, 0])
                linear_extrude(height = thickness)
                    polygon(wall_points);
                    
        // C. The Right Sheared Wall
        translate([0, width/2, 0])
            rotate([90, 0, 0])
                linear_extrude(height = thickness)
                    polygon(wall_points);
    }
}

// Module 3: Assembly Wrapper
module stamped_louver(length, width, height, thickness, radius=1) {
    difference() {
        children(); // The base plate passed by the user
        louver_cutout(length, width, thickness);
    }
    rounded_louver_flap(length, width, height, thickness, radius);
}

// ==========================================
// Example Usage & Visualization
// ==========================================

sheet_t = 1.5;
l_len = 25;
l_wid = 15;
l_hgt = 8;
bend_r = 3; 

// Render a base plate with the corrected louver punched into it
color("SteelBlue") {
    stamped_louver(length = l_len, width = l_wid, height = l_hgt, thickness = sheet_t, radius = bend_r) {
        // Base plate geometry
        translate([-10, -20, -sheet_t])
            cube([45, 40, sheet_t]);
    }
}