
// ==========================================
// Example Usage & Visualization
// ==========================================

// 1. Draw a dummy base plate for visual context
// (Assuming the base plate extends into the +Y direction and thickness goes down into -Z)
color("LightSlateGray")
translate([0, 0, -2]) // Offset by -thickness
    linear_extrude(height = 2, center = false)
        polygon(points=[[10,10], [60,40], [80,10], [40,-10]]);

// 2. Flange 1: 90-degree bend with a LARGE RADIUS (5mm)
color("SteelBlue")
wall_on_edge(
    p1 = [10, 10], 
    p2 = [60, 40], 
    bend_angle = 90, 
    height = 15, 
    thickness = 2,
    radius = 3 // Noticeable curved bend
);

// 3. Flange 2: Obtuse bend (135 deg) with a SHARP RADIUS (0mm)
color("DarkOrange")
wall_on_edge(
    p1 = [80, 10], 
    p2 = [60, 40], 
    bend_angle = 135, 
    height = 20, 
    thickness = 2,
    radius = 0 // Simulates a sharp fold
);

// --------------------------------------------------------
// Parametric "Wall on Edge" with Bend Radius
// --------------------------------------------------------

module wall_on_edge(p1, p2, bend_angle, height, thickness, radius=0) {
    // 1. Calculate the edge length and heading vector
    dx = p2[0] - p1[0];
    dy = p2[1] - p1[1];
    edge_length = norm([dx, dy]);
    z_rot = atan2(dy, dx);
    
    // Clamp radius to a tiny number if 0 is entered to prevent degenerate geometry
    r = max(radius, 0.001);
    
    // 2. Position and orient the extruded profile
    translate([p1[0], p1[1], 0])
        rotate([0, 0, z_rot])
            // Map the 2D profile axes into 3D edge space:
            // Extrusion Z-axis -> Local X (along the edge)
            // Profile X-axis   -> Local Y (perpendicular to edge on base plate)
            // Profile Y-axis   -> Local Z (upwards)
            rotate([0, 90, 0])
                rotate([0, 0, 90])
                    linear_extrude(height = edge_length)
                        flange_profile_2d(thickness, height, bend_angle, r);
}

// --------------------------------------------------------
// 2D Sheet Metal Cross-Section Generator
// --------------------------------------------------------
module flange_profile_2d(t, h, angle, r) {
    fn = 32; // Resolution of the bend arcs
    start_a = -90;
    end_a = -90 + angle;
    
    // Construct the continuous polygon for the cross-section
    polygon([
        // 1. Inner Arc
        for (i = [0 : fn])
            let (a = start_a + i * (angle / fn))
                [ r * cos(a), r + r * sin(a) ],
                
        // 2. Inner edge of the straight wall
        [ r * cos(end_a) - h * sin(end_a), 
          r + r * sin(end_a) + h * cos(end_a) ],
          
        // 3. Outer edge of the straight wall
        [ (r + t) * cos(end_a) - h * sin(end_a), 
          r + (r + t) * sin(end_a) + h * cos(end_a) ],
          
        // 4. Outer Arc (drawn in reverse to close the polygon)
        for (i = [fn : -1 : 0])
            let (a = start_a + i * (angle / fn))
                [ (r + t) * cos(a), r + (r + t) * sin(a) ]
    ]);
}
