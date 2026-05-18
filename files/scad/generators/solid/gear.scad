// WebCAD Parametric Spur Gear Generator
// Uses high-performance native GEOL involute_gears library.

use <../GEOL/involute_gears.scad>

// --- Parameters ---
// Number of teeth
teeth = 18; // [10:1:50]
// mm per tooth (circular pitch)
mm_per_tooth = 6; // [2:1:30]
// Width (thickness) of the gear
thickness = 8; // [2:1:30]
// Bore (center hole) diameter
bore_diameter = 8; // [3:1:25]
// Backlash (tooth spacing clearance)
backlash = 0.1; // [0:0.05:1]
// Hub diameter (0 to disable)
hub_diameter = 14; // [0:1:50]
// Hub height (0 to disable)
hub_height = 5; // [0:1:20]

echo("--- GENERATING PARAMETRIC GEOL GEAR ---");
echo("Teeth count:", teeth);
echo("mm per tooth:", mm_per_tooth);
echo("Gear thickness:", thickness);
echo("Bore diameter:", bore_diameter);
echo("Hub diameter:", hub_diameter);
echo("Hub height:", hub_height);

// Generate the spur gear using high-performance GEOL library
gear(
    mm_per_tooth=mm_per_tooth,
    number_of_teeth=teeth,
    thickness=thickness,
    hole_diameter=bore_diameter,
    hub_d=hub_diameter,
    hub_h=hub_height,
    backlash=backlash,
    pressure_angle=20
);

echo("--- GEAR GENERATION COMPLETE ---");
