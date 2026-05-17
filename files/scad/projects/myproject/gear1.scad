// ========================================================
// Parametric 3D Spur Gear
// ========================================================

// Primary Gear Parameters
num_teeth = 18;
pitch_radius = 28;
thickness = 6;
shaft_radius = 5;

// Calculated structural parameters
tooth_width = 3.5;
tooth_depth = 4.2;
hub_radius = 16;
hub_thickness = 10;

// Radially placed gear teeth
module gear_teeth() {
    // 360 / 18 teeth = 20-degree increments
    for (angle = [0:20:340]) {
        rotate([0, 0, angle]) {
            // Position the tooth at the gear's perimeter
            translate([pitch_radius, 0, 0]) {
                // Renders a perfectly centered gear tooth
                cube([tooth_depth, tooth_width, thickness], center=true);
            }
        }
    }
}

// Assemble the final gear structure
difference() {
    union() {
        // Main gear blank disc (using minor/dedendum radius)
        cylinder(h=thickness, r=pitch_radius - tooth_depth * 0.5, center=true);
        
        // Raised center hub to support axle loading
        cylinder(h=hub_thickness, r=hub_radius, center=true);
        
        // Radial array of gear teeth
        gear_teeth();
    }
    
    // Subtracted core shaft cutout through the center of the gear
    cylinder(h=hub_thickness + 2, r=shaft_radius, center=true);
}
