// WebCAD Parametric Hex Bolt Generator
// Outputs a single unionized solid object.

// --- Parameters ---
// Outer thread diameter
d = 12; // [6:1:30]
// Inner thread diameter (root)
id = 10; // [4:1:28]
// Thread pitch
pitch = 1.75; // [0.5:0.25:3]
// Shank thread length
length = 35; // [10:5:150]
// Segment resolution ($fn)
$fn = 32;

// Calculated head values
head_d = 1.5 * d;            // Hexagon head diameter (flat-to-flat)
head_h = head_d / 4;         // Height of hexagon head

R = d / 2;
r = id / 2;
num_threads = floor(length / pitch);

echo("--- GENERATING PARAMETRIC BOLT ---");
echo("Thread Outer Diameter:", d);
echo("Thread Inner Diameter:", id);
echo("Thread Length:", length);
echo("Hex Head Diameter:", head_d);
echo("Hex Head Height:", head_h);

union() {
    // 1. Threaded Shank (Zigzag Profile Revolved around Z-Axis)
        // Generate the 2D zigzag points along the positive X half-plane
        zigzag_pts = [
            for (i = [0 : num_threads - 1]) each [
                [r, -i * pitch],
                [R, -i * pitch - pitch / 2]
            ],
            [r, -length]
        ];

        // Close the profile along the Z-axis (x = 0)
        profile_pts = concat(
            zigzag_pts,
            [
                [0, -length],
                [0, 0]
            ]
        );

        // Revolve the 2D polygon profile to build the 3D thread
        rotate_extrude(angle=360) {
            polygon(points=profile_pts);
        }
    

    // 2. Beveled Hexagonal Head
        // Intersect the hexagon prism with a chamfering cone to create a professional top bevel
        intersection() {
            // (a) Hexagonal Prism
            cylinder(d=head_d, h=head_h, center=false, $fn=6);

            // (b) Chamfer Cutter (cylinder with a conical top taper)
            union() {
                // Lower portion (retains straight hexagon walls for 80% of the height)
                cylinder(d=head_d * 1.15, h=head_h * 0.8, center=false, $fn=32);
                
                // Upper portion (conical taper for the top 20% of the height)
                translate([0, 0, head_h * 0.8]) {
                    cylinder(d1=head_d * 1.15, d2=head_d * 0.85, h=head_h * 0.2, center=false, $fn=32);
                }
            }
        }
    
}

echo("--- BOLT GENERATION COMPLETE ---");
