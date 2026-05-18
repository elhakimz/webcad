// GEOL (Geometric Engine Optimized Library) - Involute Gears Module
// High-performance, library-free parametric gear generation designed for WebCAD/OpenCascade.
// Created: 2026-05-18

// ==========================================
// 1. Standard Gear Dimension Helpers
// ==========================================

function circular_pitch(mm_per_tooth=5) = mm_per_tooth;
function diametral_pitch(mm_per_tooth=5) = PI / mm_per_tooth;
function module_value(mm_per_tooth=5) = mm_per_tooth / PI;

function adendum(mm_per_tooth=5) = module_value(mm_per_tooth);
function dedendum(mm_per_tooth=5, clearance=undef) =
    (clearance == undef) ? (1.25 * module_value(mm_per_tooth)) : (module_value(mm_per_tooth) + clearance);

function pitch_radius(mm_per_tooth=5, number_of_teeth=11) =
    mm_per_tooth * number_of_teeth / PI / 2;

function outer_radius(mm_per_tooth=5, number_of_teeth=11, clearance=undef, interior=false) =
    pitch_radius(mm_per_tooth, number_of_teeth) +
    (interior ? dedendum(mm_per_tooth, clearance) : adendum(mm_per_tooth));

function root_radius(mm_per_tooth=5, number_of_teeth=11, clearance=undef, interior=false) =
    pitch_radius(mm_per_tooth, number_of_teeth) -
    (interior ? adendum(mm_per_tooth) : dedendum(mm_per_tooth, clearance));

function base_radius(mm_per_tooth=5, number_of_teeth=11, pressure_angle=28) =
    pitch_radius(mm_per_tooth, number_of_teeth) * cos(pressure_angle);


// ==========================================
// 2. 2D Involute Math & Profiles
// ==========================================

function _gear_polar(r, theta) = r * [sin(theta), cos(theta)];
function _gear_iang(r1, r2) = sqrt(max(0, (r2/r1)*(r2/r1) - 1)) / PI * 180 - acos(r1/r2);
function _gear_q6(b, s, t, d, offset=0) = _gear_polar(d, s * (_gear_iang(b, d) + t) + offset);
function _gear_q7(f, r, b, r2, t, s, offset=0) = _gear_q6(b, s, t, (1-f)*max(b,r)+f*r2, offset);

// Returns points for a single tooth profile centered at the origin
function gear_tooth_profile(
    mm_per_tooth    = 5,
    number_of_teeth = 17,
    pressure_angle  = 20,
    backlash        = 0.0,
    clearance       = undef,
    interior        = false,
    valleys         = true
) = let(
        p = pitch_radius(mm_per_tooth, number_of_teeth),
        c = outer_radius(mm_per_tooth, number_of_teeth, clearance, interior),
        r = root_radius(mm_per_tooth, number_of_teeth, clearance, interior),
        b = base_radius(mm_per_tooth, number_of_teeth, pressure_angle),
        t = mm_per_tooth/2 - backlash/2,
        k = -_gear_iang(b, p) - t/2/p/PI*180,
        points = [
            if(valleys) _gear_polar(r, -181/number_of_teeth),
            _gear_polar(r, r<b ? k : -180/number_of_teeth),
            _gear_q7(0/5,r,b,c,k, 1), _gear_q7(1/5,r,b,c,k, 1), _gear_q7(2/5,r,b,c,k, 1), _gear_q7(3/5,r,b,c,k, 1), _gear_q7(4/5,r,b,c,k, 1), _gear_q7(5/5,r,b,c,k, 1),
            _gear_q7(5/5,r,b,c,k,-1), _gear_q7(4/5,r,b,c,k,-1), _gear_q7(3/5,r,b,c,k,-1), _gear_q7(2/5,r,b,c,k,-1), _gear_q7(1/5,r,b,c,k,-1), _gear_q7(0/5,r,b,c,k,-1),
            _gear_polar(r, r<b ? -k : 180/number_of_teeth),
            if(valleys) _gear_polar(r, 181/number_of_teeth)
        ]
    ) points;

// Creates a complete rotated 2D gear profile (watertight, simple, duplicate-free for OpenCascade)
function gear2d(
    mm_per_tooth    = 5,
    number_of_teeth = 17,
    pressure_angle  = 20,
    clearance       = undef,
    backlash        = 0.0
) = let(
        p = pitch_radius(mm_per_tooth, number_of_teeth),
        c = outer_radius(mm_per_tooth, number_of_teeth, clearance),
        r = root_radius(mm_per_tooth, number_of_teeth, clearance),
        b = base_radius(mm_per_tooth, number_of_teeth, pressure_angle),
        t = mm_per_tooth/2 - backlash/2,
        k = -_gear_iang(b, p) - t/2/p/PI*180
    ) [
        for (i = [0 : number_of_teeth - 1])
            let (
                offset = i * 360 / number_of_teeth
            )
            each concat(
                // 1. Left root corner
                [_gear_polar(r, -180 / number_of_teeth + offset)],
                
                // 2. Left base transition (only if root is inside base circle)
                (r < b) ? [_gear_polar(r, k + offset)] : [],
                
                // 3. Left involute curve (from 0 to 5)
                [for (f = [0 : 5]) _gear_q7(f/5, r, b, c, k, 1, offset)],
                
                // 4. Right involute curve (from 5 down to 0)
                [for (f = [5 : -1 : 0]) _gear_q7(f/5, r, b, c, k, -1, offset)],
                
                // 5. Right base transition (only if root is inside base circle)
                (r < b) ? [_gear_polar(r, -k + offset)] : []
            )
    ];

// 2D profile wrapper module
module gear2d_profile(mm_per_tooth=5, number_of_teeth=17, pressure_angle=20, clearance=undef, backlash=0.0) {
    polygon(points=gear2d(mm_per_tooth, number_of_teeth, pressure_angle, clearance, backlash));
}


// ==========================================
// 3. 3D Native Gear Modules
// ==========================================

// Spur Gear with optional central hole, keyway, and set-screw mounting hub
module gear(
    mm_per_tooth    = 5,
    number_of_teeth = 17,
    thickness       = 8,
    hole_diameter   = 5,
    keyway_w        = 0,      // Optional keyway width (0 to disable)
    keyway_h        = 0,      // Optional keyway height from shaft center (0 to disable)
    hub_d           = 0,      // Optional raised hub diameter
    hub_h           = 0,      // Optional raised hub height
    pressure_angle  = 20,
    clearance       = undef,
    backlash        = 0.0
) {
    difference() {
        union() {
            // Main gear body (native extrusion)
            linear_extrude(height=thickness, center=true) {
                gear2d_profile(mm_per_tooth, number_of_teeth, pressure_angle, clearance, backlash);
            }
            // Raised hub (coplanar safe addition)
            if (hub_d > 0 && hub_h > 0) {
                translate([0, 0, thickness/2 - 0.01]) {
                    cylinder(h=hub_h + 0.02, d=hub_d, center=false, $fn=32);
                }
            }
        }
        
        // Shaft hole & keyway cut (coplanar safe subtraction)
        if (hole_diameter > 0) {
            translate([0, 0, -thickness/2 - hub_h - 1]) {
                union() {
                    // Shaft cylinder
                    cylinder(h=thickness + hub_h + 2, d=hole_diameter, center=false, $fn=32);
                    // Keyway slot
                    if (keyway_w > 0 && keyway_h > 0) {
                        translate([-keyway_w/2, 0, 0]) {
                            cube([keyway_w, keyway_h, thickness + hub_h + 2]);
                        }
                    }
                }
            }
        }
    }
}

// Helical / Twisted Spur Gear
module helical_gear(
    mm_per_tooth    = 5,
    number_of_teeth = 17,
    thickness       = 10,
    twist           = 45,     // Teeth helix twist angle in degrees
    hole_diameter   = 5,
    pressure_angle  = 20,
    slices          = 40
) {
    difference() {
        // Native helical sweep using linear_extrude with twist
        linear_extrude(height=thickness, center=true, twist=twist, slices=slices) {
            gear2d_profile(mm_per_tooth, number_of_teeth, pressure_angle);
        }
        
        if (hole_diameter > 0) {
            cylinder(h=thickness + 2, d=hole_diameter, center=true, $fn=32);
        }
    }
}

// Beveled / Conical Gear using native scale
module bevel_gear(
    mm_per_tooth    = 5,
    number_of_teeth = 17,
    thickness       = 8,
    bevel_angle     = 45,     // Cone face angle (45 degrees makes a miter gear)
    hole_diameter   = 5,
    pressure_angle  = 20
) {
    p = pitch_radius(mm_per_tooth, number_of_teeth);
    p_top = p - (thickness * tan(bevel_angle));
    scale_factor = p_top / p;
    
    difference() {
        // Tapered gear body via scale
        linear_extrude(height=thickness, center=true, scale=scale_factor, slices=20) {
            gear2d_profile(mm_per_tooth, number_of_teeth, pressure_angle);
        }
        
        if (hole_diameter > 0) {
            cylinder(h=thickness + 2, d=hole_diameter, center=true, $fn=32);
        }
    }
}

// Linear Gear Rack
module gear_rack(
    mm_per_tooth    = 5,
    number_of_teeth = 10,
    thickness       = 8,
    height          = 10,
    pressure_angle  = 20,
    backlash        = 0.0,
    clearance       = undef
) {
    a = adendum(mm_per_tooth);
    d = dedendum(mm_per_tooth, clearance);
    xa = a * sin(pressure_angle);
    xd = d * sin(pressure_angle);
    
    translate([-(number_of_teeth - 1) * mm_per_tooth / 2, 0, 0]) {
        linear_extrude(height=thickness, center=true) {
            for (i = [0 : number_of_teeth - 1]) {
                translate([i * mm_per_tooth, 0, 0]) {
                    polygon(points=[
                        [-1/2 * mm_per_tooth - 0.01, a - height],
                        [-1/2 * mm_per_tooth,        -d],
                        [-1/4 * mm_per_tooth + backlash - xd, -d],
                        [-1/4 * mm_per_tooth + backlash + xa,  a],
                        [ 1/4 * mm_per_tooth - backlash - xa,  a],
                        [ 1/4 * mm_per_tooth - backlash + xd, -d],
                        [ 1/2 * mm_per_tooth,        -d],
                        [ 1/2 * mm_per_tooth + 0.01, a - height]
                    ]);
                }
            }
        }
    }
}
