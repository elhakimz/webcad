// WebCAD Pure SCAD Parametric Threading Profiles Showcase
// Demonstrates how to generate 4 distinct industrial thread profiles mathematically from scratch.
// NO EXTERNAL LIBRARIES OR BOSL USED.

$fn = 32;

// Universal thread dimensions
d = 10;
id = 8;
pitch = 1.5;
length = 24;

R = d / 2;
r = id / 2;
num_threads = floor(length / pitch);

// ==========================================
// 1. Symmetric V-Thread (UTS/ISO Style)
// ==========================================
echo("--- STARTING PROFILE 1: Symmetric V-Thread ---");
translate([-20, 15, 0]) {
    color("crimson") {
        // Build symmetric V-profile
        v_pts = [
            for (i = [0 : num_threads - 1]) each [
                [r, -i * pitch],
                [R, -i * pitch - pitch / 2]
            ],
            [r, -length]
        ];
        
        // Close polygon along the Z-axis (x = 0)
        profile = concat(v_pts, [[0, -length], [0, 0]]);
        
        rotate_extrude(angle=360) {
            polygon(points=profile);
        }
    }
}


// ==========================================
// 2. Trapezoidal / ACME Thread Profile
// ==========================================
echo("--- STARTING PROFILE 2: Trapezoidal / ACME Thread ---");
translate([20, 15, 0]) {
    color("gold") {
        // Build trapezoidal profile with flat crests and roots
        acme_pts = [
            for (i = [0 : num_threads - 1]) each [
                [r, -i * pitch],                           // Start of root flat
                [r, -i * pitch - 0.25 * pitch],            // End of root flat
                [R, -i * pitch - 0.5 * pitch],             // Start of crest flat
                [R, -i * pitch - 0.75 * pitch]             // End of crest flat
            ],
            [r, -length]
        ];
        
        // Close polygon along Z-axis
        profile = concat(acme_pts, [[0, -length], [0, 0]]);
        
        rotate_extrude(angle=360) {
            polygon(points=profile);
        }
    }
}


// ==========================================
// 3. Square Thread Profile (Vertical Flanks)
// ==========================================
echo("--- STARTING PROFILE 3: Square Thread ---");
translate([-20, -15, 0]) {
    color("limegreen") {
        // Build square profile with vertical flanks
        square_pts = [
            for (i = [0 : num_threads - 1]) each [
                [r, -i * pitch],                           // Start of valley
                [r, -i * pitch - 0.5 * pitch],             // End of valley
                [R, -i * pitch - 0.5 * pitch],             // Step up to crest
                [R, -i * pitch - pitch]                    // Step down crest end
            ],
            [r, -length]
        ];
        
        // Close polygon along Z-axis
        profile = concat(square_pts, [[0, -length], [0, 0]]);
        
        rotate_extrude(angle=360) {
            polygon(points=profile);
        }
    }
}


// ==========================================
// 4. Buttress Thread Profile (Unsymmetric Flanks)
// ==========================================
echo("--- STARTING PROFILE 4: Buttress Thread ---");
translate([20, -15, 0]) {
    color("dodgerblue") {
        // Build buttress profile: steep load flank + gentle sloped flank
        buttress_pts = [
            for (i = [0 : num_threads - 1]) each [
                [r, -i * pitch],                           // Start of steep flank
                [R, -i * pitch],                           // End of steep flank (perpendicular)
                [R, -i * pitch - 0.3 * pitch]              // End of flat crest, start of slope
            ],
            [r, -length]
        ];
        
        // Close polygon along Z-axis
        profile = concat(buttress_pts, [[0, -length], [0, 0]]);
        
        rotate_extrude(angle=360) {
            polygon(points=profile);
        }
    }
}
