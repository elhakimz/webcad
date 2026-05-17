// ========================================================
// 2D Parametric Snowflake / Polyline Art
// ========================================================

// Thickness of the line segments
thickness = 1.2;

// Renders a single line segment using thin cubes
module draw_segment(x1, y1, x2, y2) {
    // Length of the segment
    dx = x2 - x1;
    dy = y2 - y1;
    len = sqrt(dx*dx + dy*dy);
    
    // Calculate angle in degrees
    angle = atan2(dy, dx);
    
    translate([x1, y1, 0])
        rotate([0, 0, angle])
            translate([0, -thickness/2, 0])
                cube([len, thickness, 2]);
}

// Recursing arm generator for fractal snowflake art
module fractal_arm(len, depth) {
    if (depth > 0) {
        // Draw main segment
        draw_segment(0, 0, len, 0);
        
        // Left branch
        translate([len * 0.5, 0, 0])
            rotate([0, 0, 45])
                fractal_arm(len * 0.45, depth - 1);
                
        // Right branch
        translate([len * 0.5, 0, 0])
            rotate([0, 0, -45])
                fractal_arm(len * 0.45, depth - 1);
                
        // Tip left branch
        translate([len, 0, 0])
            rotate([0, 0, 30])
                fractal_arm(len * 0.3, depth - 1);
                
        // Tip right branch
        translate([len, 0, 0])
            rotate([0, 0, -30])
                fractal_arm(len * 0.3, depth - 1);
    }
}

// Generate the full 6-sided symmetric snowflake
union() {
    for (angle = [0:60:300]) {
        rotate([0, 0, angle]) {
            fractal_arm(40, 3);
        }
    }
    
    // Central hexagonal core structure
    for (angle = [0:60:300]) {
        rotate([0, 0, angle]) {
            // Draw hexagonal ring connections
            draw_segment(12, 0, 6, 10.39);
        }
    }
}
