// --------------------------------------------------------
// Simulating a CATIA "Pocket" (Cutout) in OpenSCAD
// --------------------------------------------------------

/* Toggle this to 'true' to see the actual volumes 
   being used as cutting tools before they are subtracted.
*/
show_cutting_tools = false;

// Base Part Parameters
plate_length = 100;
plate_width = 80;
plate_thickness = 15;

if (show_cutting_tools) {
    // Show both the base and the tools (overlapping)
    base_plate();
    blind_pocket_tool();
    through_hole_tool();
} else {
    // Perform the CSG Subtraction
    difference() {
        base_plate();
        blind_pocket_tool();
        through_hole_tool();
    }
}

// --------------------------------------------------------
// Geometry Modules
// --------------------------------------------------------

module base_plate() {
    color("LightSlateGray")
    // Creating the base centered at [0,0,0]
    translate([-plate_length/2, -plate_width/2, 0])
        cube([plate_length, plate_width, plate_thickness]);
}

module blind_pocket_tool() {
    // Simulating a CATIA "Dimension" (Blind) Pocket
    pocket_depth = 5;
    pocket_radius = 15;
    
    color("Red")
    // Position the pocket on the right side of the plate
    translate([20, 0, plate_thickness - pocket_depth])
        // Notice the + 1 to the height to avoid Z-fighting at the top surface
        cylinder(h = pocket_depth + 1, r = pocket_radius, $fn=64);
}

module through_hole_tool() {
    // Simulating a CATIA "Up to Last" Pocket (Through-hole)
    color("DarkOrange")
    // Position on the left side
    translate([-25, -15, -1]) // Moved down by 1mm to break the bottom surface
        // Notice the + 2 to the height so it completely breaches top and bottom
        cube([20, 30, plate_thickness + 2]);
}