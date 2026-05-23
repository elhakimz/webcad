// GEOL (Geometric Engine Optimized Library) - Threading Module
// High-performance, library-free parametric threaded rods, nuts, and bolts.
// Created: 2026-05-18

// ==========================================
// 1. Thread Profile Generators (Compat-safe Functions)
// ==========================================

function get_v_points(r, ri, steps, pitch) =
    concat(
        [[0, 0]],
        [for (p = [0 : steps * 3 - 1])
            let (i = floor(p / 3))
            let (phase = p % 3)
            (phase == 0) ? [ri, -i * pitch] :
            (phase == 1) ? [r, -i * pitch - 0.5 * pitch] :
            [ri, -(i + 1) * pitch]
        ],
        [[0, -steps * pitch]]
    );

function get_acme_points(r, ri, steps, pitch) =
    concat(
        [[0, 0]],
        [for (p = [0 : steps * 4 - 1])
            let (i = floor(p / 4))
            let (phase = p % 4)
            (phase == 0) ? [ri, -i * pitch] :
            (phase == 1) ? [ri, -i * pitch - 0.25 * pitch] :
            (phase == 2) ? [r, -i * pitch - 0.5 * pitch] :
            [r, -i * pitch - 0.75 * pitch]
        ],
        [[0, -steps * pitch]]
    );

function get_square_points(r, ri, steps, pitch) =
    concat(
        [[0, 0]],
        [for (p = [0 : steps * 4 - 1])
            let (i = floor(p / 4))
            let (phase = p % 4)
            (phase == 0) ? [ri, -i * pitch] :
            (phase == 1) ? [ri, -i * pitch - 0.5 * pitch] :
            (phase == 2) ? [r, -i * pitch - 0.5 * pitch] :
            [r, -i * pitch - pitch]
        ],
        [[0, -steps * pitch]]
    );

function get_buttress_points(r, ri, steps, pitch) =
    concat(
        [[0, 0]],
        [for (p = [0 : steps * 4 - 1])
            let (i = floor(p / 4))
            let (phase = p % 4)
            (phase == 0) ? [ri, -i * pitch] :
            (phase == 1) ? [r, -i * pitch] :
            (phase == 2) ? [r, -i * pitch - 0.3 * pitch] :
            [ri, -(i + 1) * pitch]
        ],
        [[0, -steps * pitch]]
    );


// ==========================================
// 2. Main Threaded rod Primitive
// ==========================================

module threaded_rod(d=10, id=8, length=30, pitch=1.5, type="V") {
    steps = floor(length / pitch);
    r = d / 2;
    ri = id / 2;
    
    rotate_extrude(angle=360, $fn=32) {
        if (type == "ACME" || type == "Trapezoidal") {
            polygon(points=get_acme_points(r, ri, steps, pitch));
        } else if (type == "Square") {
            polygon(points=get_square_points(r, ri, steps, pitch));
        } else if (type == "Buttress") {
            polygon(points=get_buttress_points(r, ri, steps, pitch));
        } else { // default: "V"
            polygon(points=get_v_points(r, ri, steps, pitch));
        }
    }
}


// ==========================================
// 3. Parametric Nut and Bolt Components
// ==========================================

// Parametric Hex Nut with internal thread
module threaded_nut(hex_d=15, height=8, thread_d=10, thread_id=8, pitch=1.5, type="V") {
    difference() {
        // Double-chamfered hex body (Teal)
        color("teal") {
            intersection() {
                cylinder(d=hex_d, h=height, center=true, $fn=6);
                // Conical cut for double beveling
                cylinder(r1=hex_d * 0.45, r2=hex_d * 0.7, h=height + 0.1, center=true, $fn=32);
            }
        }
        
        // Golden inner thread lining
        color("gold") {
            // Offset the inner thread rod slightly vertically to ensure clean subtraction
            translate([0, 0, height/2 + 0.1]) {
                threaded_rod(d=thread_d, id=thread_id, length=height + 0.2, pitch=pitch, type=type);
            }
        }
    }
}

// Parametric Bolt (Beveled hex head + revolved thread rod)
module threaded_bolt(thread_d=10, thread_id=8, thread_len=30, pitch=1.5, type="V", hex_d=15, head_h=6) {
    // 1. Threaded shaft (Crimson)
    color("crimson") {
        translate([0, 0, -thread_len + 0.05]) {
            threaded_rod(d=thread_d, id=thread_id, length=thread_len + 0.05, pitch=pitch, type=type);
        }
    }
    
    // 2. Beveled hex head (Teal)
    color("teal") {
        translate([0, 0, 0]) {
            intersection() {
                // Hex prism head
                cylinder(d=hex_d, h=head_h, center=false, $fn=6);
                // Cone cutter for proportional top-bevel (offset to prevent coplanar collision)
                translate([0, 0, -0.05]) {
                    cylinder(r1=hex_d * 0.75, r2=hex_d * 0.55, h=head_h + 0.1, center=false, $fn=32);
                }
            }
        }
    }
}

