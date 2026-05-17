// ========================================================
// Parametric 3D Spur Gear (Sharp Teeth)
// ========================================================

// Main Parameters
num_teeth = 18;
pitch_radius = 28;
thickness = 6;
shaft_radius = 5;

// Structural details
tooth_width = 3.5;
tooth_depth = 4.2;
hub_radius = 16;
hub_thickness = 10;

// Radial teeth array
module gear_teeth() {
    for (angle = [0:20:340]) {
        rotate([0, 0, angle]) {
            // Position teeth precisely at pitch radius boundary
            translate([pitch_radius, 0, 0]) {
                cube([tooth_depth, tooth_width, thickness], center=true);
            }
        }
    }
}

// Gear Assembly
difference() {
    union() {
        // Base disk using dedendum/minor radius
        cylinder(h=thickness, r=pitch_radius - tooth_depth * 0.5, center=true);
        
        // Solid center hub
        cylinder(h=hub_thickness, r=hub_radius, center=true);
        
        // Outer teeth profile
        gear_teeth();
    }
    
    // Axle bore
    cylinder(h=hub_thickness + 2, r=shaft_radius, center=true);
}
