// GEOL (Geometric Engine Optimized Library) - 2-Stroke Motor Model
// A beautifully designed, mathematically exact, and fully animated 2-stroke internal combustion engine.
// Supports real-time viewport animation using the $t$ variable!
// Created: 2026-05-18

use <GEOL/transforms.scad>
use <GEOL/shapes.scad>
use <GEOL/shape_cyl.scad>
use <GEOL/threading.scad>

// ==========================================
// KINEMATIC & DIMENSIONAL CONSTANTS
// ==========================================
$fn = 32;

// Kinematics parameters
crank_r   = 16;  // Crank radius (half stroke)
conrod_l  = 45;  // Connecting rod length
bore_d    = 32;  // Cylinder bore diameter
piston_h  = 26;  // Piston height
wrist_d   = 6;   // Wrist pin diameter
crank_w_d = 48;  // Crank web diameter

// Animation variables
// $t is defined by the browser animator (goes from 0 to 1). 
// When not animating, we default to a nice static angle.
anim_time = is_def($t) ? $t : 0.25;
theta     = anim_time * 360; // Crank angle in degrees

// Piston vertical position relative to crankshaft center
piston_z = crank_r * cos(theta) + sqrt(pow(conrod_l, 2) - pow(crank_r * sin(theta), 2));

// Conrod swing angle (in degrees)
conrod_angle = asin((crank_r * sin(theta)) / conrod_l);

// Toggle Cutaway view to look inside the engine bore!
cutaway = true;

// ==========================================
// 1. MAIN ASSEMBLY
// ==========================================
union() {
    // A. Engine Block and Stationary Parts
    difference() {
        cylinder_block();
        if (cutaway) {
            // Cut away the front-left quadrant to show the piston inside
            translate([-60, -60, -20]) {
                cube([60, 120, 160]);
            }
        }
    }
    
    // B. Carburetor / Intake Assembly
    color("slategrey") {
        translate([0, 32, 25]) {
            rotate([90, 0, 0]) {
                cyl(l=12, d=16, center=true);
                translate([0, 0, 8]) cyl(l=4, d=22, center=true); // Flange
            }
        }
    }

    // C. Expansion Exhaust System (High-performance 2-Stroke chamber)
    color("dimgrey") {
        translate([0, -28, 45]) {
            rotate([-90, 15, 0]) {
                // Header pipe
                tube(h=15, od=12, id=9, center=true);
                // Expander cone
                translate([0, 0, -15]) {
                    tube(h=15, od1=22, od2=12, ir1=19, ir2=9, center=true);
                }
                // Belly chamber
                translate([0, 0, -32.5]) {
                    tube(h=20, od=22, id=19, center=true);
                }
                // Tail cone
                translate([0, 0, -47.5]) {
                    tube(h=10, od1=10, od2=22, ir1=8, ir2=19, center=true);
                }
                // Stinger tail pipe
                translate([0, 0, -57.5]) {
                    tube(h=10, od=10, id=8, center=true);
                }
            }
        }
    }

    // D. Moving Crankshaft Assembly (Rotates with theta)
    rotate([0, theta, 0]) {
        crankshaft();
    }
    
    // E. Moving Connecting Rod (Slides and swings)
    translate([crank_r * sin(theta), 0, crank_r * cos(theta)]) {
        rotate([0, -conrod_angle, 0]) {
            connecting_rod();
        }
    }
    
    // F. Moving Piston & Wrist Pin (Slides along Z)
    translate([0, 0, piston_z]) {
        piston();
    }
}


// ==========================================
// 2. SUB-ASSEMBLIES & COMPONENT MODULES
// ==========================================

// --- Engine Block / Cylinder Module ---
module cylinder_block() {
    // 1. Lower Crankcase
    color("grey") {
        translate([0, 0, 0]) {
            // Crankcase main housing
            cyl(l=35, d=58, center=true);
            // Front cover shaft sleeve
            translate([18, 0, 0]) rotate([0, 90, 0]) cyl(l=10, d=20, center=true);
            // Rear cover shaft sleeve
            translate([-18, 0, 0]) rotate([0, 90, 0]) cyl(l=10, d=20, center=true);
        }
    }
    
    // 2. Cylinder Barrel (Vertical)
    color("crimson") {
        translate([0, 0, 45]) {
            difference() {
                // Main outer barrel
                cyl(l=65, d=45, center=true);
                // Inner cylinder bore (where piston slides)
                cyl(l=70, d=bore_d, center=true);
                // Intake Port
                translate([0, 20, -20]) rotate([90, 0, 0]) cyl(l=20, d=10, center=true);
                // Exhaust Port
                translate([0, -20, 0]) rotate([90, 0, 0]) cyl(l=20, d=10, center=true);
            }
        }
    }
    
    // 3. Cylinder Cooling Fins (For air cooling)
    color("firebrick") {
        for (z = [25 : 8 : 75]) {
            translate([0, 0, z]) {
                difference() {
                    cyl(l=2.5, d=62, center=true);
                    cyl(l=4, d=bore_d + 0.5, center=true);
                }
            }
        }
    }
    
    // 4. Cylinder Head (Cylinder top cover)
    color("darkred") {
        translate([0, 0, 80]) {
            difference() {
                // Head base dome
                cyl(l=8, d1=45, d2=38, center=true);
                // Spark plug threaded hole
                cyl(l=12, d=10, center=true);
            }
            // Cooling fins on top of the head
            for (ang = [0 : 45 : 180]) {
                rotate([0, 0, ang]) {
                    translate([0, 0, 5]) cube([45, 2, 4], center=true);
                }
            }
        }
    }
    
    // 5. Spark Plug (UTS standard V-thread M10 plug)
    translate([0, 0, 84]) {
        spark_plug();
    }
}

// --- Detailed Spark Plug Module ---
module spark_plug() {
    // Metal thread and body
    color("lightgrey") {
        threaded_bolt(thread_d=10, thread_id=8.5, thread_len=8, pitch=1.0, type="V", hex_d=14, head_h=6);
    }
    // White ceramic insulator
    color("ghostwhite") {
        translate([0, 0, 10]) {
            cyl(l=16, d1=9, d2=7, center=true);
        }
    }
    // Gold/brass spark plug terminal
    color("gold") {
        translate([0, 0, 19.5]) {
            cyl(l=3, d=4, center=true);
        }
    }
}

// --- Piston & Ring Assembly ---
module piston() {
    // 1. Aluminum Piston Body
    color("silver") {
        difference() {
            // Piston Outer Solid
            cyl(l=piston_h, d=bore_d - 0.2, center=true);
            // Hollow bottom inside of the piston
            translate([0, 0, -4]) cyl(l=piston_h - 4, d=bore_d - 4, center=true);
            // Wrist pin hole
            rotate([0, 90, 0]) cyl(l=bore_d + 2, d=wrist_d, center=true);
        }
    }
    
    // 2. Wrist Pin (Steel pin holding piston to conrod)
    color("dimgrey") {
        rotate([0, 90, 0]) {
            cyl(l=bore_d - 1, d=wrist_d - 0.05, center=true);
        }
    }
    
    // 3. Dark Piston Rings
    color("black") {
        translate([0, 0, 8]) {
            difference() {
                cyl(l=1.2, d=bore_d - 0.05, center=true);
                cyl(l=2, d=bore_d - 2, center=true);
            }
        }
        translate([0, 0, 4]) {
            difference() {
                cyl(l=1.2, d=bore_d - 0.05, center=true);
                cyl(l=2, d=bore_d - 2, center=true);
            }
        }
    }
}

// --- Connecting Rod Module ---
module connecting_rod() {
    // 1. Small End (wrist pin bearing ring)
    color("lightgrey") {
        translate([0, 0, conrod_l]) {
            rotate([0, 90, 0]) {
                difference() {
                    cyl(l=10, d=10, center=true);
                    cyl(l=12, d=wrist_d + 0.1, center=true);
                }
            }
        }
    }
    
    // 2. Big End (crank pin bearing ring)
    color("lightgrey") {
        rotate([0, 90, 0]) {
            difference() {
                cyl(l=12, d=16, center=true);
                cyl(l=14, d=8.1, center=true);
            }
        }
    }
    
    // 3. H-Beam Connecting Rod Body
    color("silver") {
        translate([0, 0, conrod_l / 2]) {
            difference() {
                // Central beam prism
                prismoid(size1=[12, 6], size2=[8, 5], h=conrod_l - 10, center=true);
                // Left and right H-beam structural cuts
                translate([4, 0, 0]) cube([4, 4, conrod_l - 12], center=true);
                translate([-4, 0, 0]) cube([4, 4, conrod_l - 12], center=true);
            }
        }
    }
}

// --- Crankshaft Module ---
module crankshaft() {
    // 1. Left and Right Shaft Journals
    color("lightgrey") {
        // Output power shaft (Left)
        translate([-26, 0, 0]) rotate([0, 90, 0]) cyl(l=20, d=10, center=true);
        // Starter/magneto shaft (Right)
        translate([26, 0, 0]) rotate([0, 90, 0]) cyl(l=20, d=10, center=true);
    }
    
    // 2. Heavy Dual Crank Webs (for rotational balance)
    color("darkturquoise") {
        // Left web
        translate([-12, 0, 0]) rotate([0, 90, 0]) {
            difference() {
                cyl(l=8, d=crank_w_d, center=true);
                // Counterweight balancing cutouts
                translate([0, 15, 0]) cyl(l=10, d=12, center=true);
                translate([12, 10, 0]) cyl(l=10, d=10, center=true);
                translate([-12, 10, 0]) cyl(l=10, d=10, center=true);
            }
        }
        // Right web
        translate([12, 0, 0]) rotate([0, 90, 0]) {
            difference() {
                cyl(l=8, d=crank_w_d, center=true);
                // Counterweight balancing cutouts
                translate([0, 15, 0]) cyl(l=10, d=12, center=true);
                translate([12, 10, 0]) cyl(l=10, d=10, center=true);
                translate([-12, 10, 0]) cyl(l=10, d=10, center=true);
            }
        }
    }
    
    // 3. Crank Pin (linking webs and conrod big end)
    color("dimgrey") {
        translate([0, 0, crank_r]) {
            rotate([0, 90, 0]) {
                cyl(l=20, d=8, center=true);
            }
        }
    }
}
