// ========================================================
// Parametric Standard Hex Bolt
// ========================================================

// Core Dimensions
shaft_radius = 4.5;    // M9 Thread equivalent
shaft_length = 35;     // Shaft length
head_flats = 16;       // Width across flats of hex head
head_thickness = 7;    // Bolt head height

// Module to construct a perfect regular hexagon via box intersection
module hex_head(width, height) {
    // Length across corners is width * 1.1547 (2 / sqrt(3))
    len = width * 1.1547;
    
    intersection() {
        cube([len, width, height], center=true);
        
        rotate([0, 0, 60])
            cube([len, width, height], center=true);
            
        rotate([0, 0, 120])
            cube([len, width, height], center=true);
    }
}

// Assemble the complete bolt
union() {
    // Hex Head placed on top
    translate([0, 0, head_thickness / 2]) {
        hex_head(head_flats, head_thickness);
    }
    
    // Cylinder Shaft extending downwards
    translate([0, 0, -shaft_length / 2]) {
        cylinder(h=shaft_length, r=shaft_radius, center=true);
    }
}
