// --------------------------------------------------------
// Parametric "Extrusion / Swept Wall" (Sheet Metal)
// --------------------------------------------------------

module swept_wall(path_points, length, thickness) {
    // The radius of our sweeping circle equals half the material thickness
    r = thickness / 2;
    
    // 1. Sweep the profile into 3D
    linear_extrude(height = length, convexity = 4) {
        
        // 2. Iterate through the coordinate points to build the profile
        for (i = [0 : len(path_points) - 2]) {
            
            // 3. The "Hull Trick": Connect consecutive points with a thick envelope
            hull() {
                translate(path_points[i])   circle(r = r, $fn = 32);
                translate(path_points[i+1]) circle(r = r, $fn = 32);
            }
        }
    }
}

// ==========================================
// Example Usage & Visualization
// ==========================================

// Define a few standard sheet metal open profiles (X, Y coordinates)
profile_L_bracket = [[0, 30], [0, 0], [25, 0]];
profile_U_channel = [[0, 20], [0, 0], [40, 0], [40, 20]];
profile_Z_bend    = [[-10, 15], [10, 15], [10, 0], [30, 0]];

// 1. Generate an L-Bracket Extrusion
color("SteelBlue")
swept_wall(
    path_points = profile_L_bracket, 
    length = 50, 
    thickness = 2
);

// 2. Generate a U-Channel (Shifted over for visibility)
color("DarkOrange")
translate([40, -10, 0])
    swept_wall(
        path_points = profile_U_channel, 
        length = 80, 
        thickness = 3
    );

// 3. Generate a Z-Bend (Shifted over)
color("MediumSeaGreen")
translate([100, 10, 0])
    swept_wall(
        path_points = profile_Z_bend, 
        length = 30, 
        thickness = 1.5
    );