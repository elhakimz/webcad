// WebCAD Pure SCAD Parametric Nut Generator
// Created using pure OpenSCAD primitives and operations.
// Refactored to output a single, unionized solid object.

// --- Parameters ---
d = 12;            // Outer thread diameter
id = 10;           // Inner thread diameter (root)
pitch = 1.75;      // Pitch of the threads
$fn = 32;          // Segment resolution

// Calculated nut values
nut_od = 1.8 * d;          // Hexagon nut diameter (flat-to-flat)
nut_h = 0.8 * d;           // Height of the nut

R = d / 2;
r = id / 2;
num_threads = floor(nut_h / pitch);

echo("--- GENERATING PARAMETRIC NUT ---");
echo("Thread Outer Diameter:", d);
echo("Thread Inner Diameter:", id);
echo("Nut Flat-to-Flat Width:", nut_od);
echo("Nut Height:", nut_h);

union() {
    // 1. Outer Hexagonal Nut Body (Teal) with cylindrical hole
    echo("--- STEP 1: Generating Hex Nut Body ---");
    color("teal") {
        difference() {
            // Hexagon prism with top and bottom proportional bevels
            intersection() {
                cylinder(d=nut_od, h=nut_h, center=true, $fn=6);
                
                // Double-chamfer cutter for top and bottom bevels
                union() {
                    cylinder(d=nut_od * 1.15, h=nut_h * 0.7, center=true, $fn=32);
                    cylinder(d1=nut_od * 1.15, d2=nut_od * 0.8, h=nut_h, center=true, $fn=32);
                }
            }
            
            // Center cylinder hole to receive the thread
            cylinder(d=d, h=nut_h + 1, center=true, $fn=32);
        }
    }

    // 2. Inner "Painted" Thread (Gold)
    echo("--- STEP 2: Generating Inner Gold Thread Ribs ---");
    color("gold") {
        // Generate 2D profile for inward-protruding threads
        zigzag_pts = [
            for (i = [0 : num_threads]) each [
                [r, nut_h/2 - i * pitch],
                [R, nut_h/2 - i * pitch - pitch/2]
            ]
        ];

        // Close the profile along the outer thread cylinder wall (x = R)
        profile_pts = concat(
            zigzag_pts,
            [
                [R, -nut_h/2],
                [R, nut_h/2]
            ]
        );

        // Revolve to create the golden internal thread lining
        rotate_extrude(angle=360) {
            polygon(points=profile_pts);
        }
    }
}

echo("--- NUT GENERATION COMPLETE ---");
