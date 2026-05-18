// GEOL (Geometric Engine Optimized Library) - Involute Gears Showcase
// Demonstrates high-performance native spur, helical, beveled gears and racks.
// Created: 2026-05-18

use <GEOL/transforms.scad>
use <GEOL/involute_gears.scad>

$fn = 32;

// ==========================================
// Test 1: Spur Gear with Keyway & Hub
// ==========================================
echo("--- STARTING TEST 1: Spur Gear with Keyway & Hub ---");
translate([-25, 25, 0]) {
    color("crimson") {
        gear(
            mm_per_tooth    = 6,
            number_of_teeth = 15,
            thickness       = 8,
            hole_diameter   = 6,
            keyway_w        = 2,
            keyway_h        = 4,
            hub_d           = 12,
            hub_h           = 5,
            pressure_angle  = 20
        );
    }
}


// ==========================================
// Test 2: Helical Gear
// ==========================================
echo("--- STARTING TEST 2: Helical Gear ---");
translate([25, 25, 0]) {
    color("dodgerblue") {
        helical_gear(
            mm_per_tooth    = 6,
            number_of_teeth = 15,
            thickness       = 12,
            twist           = 45,
            hole_diameter   = 6,
            pressure_angle  = 20
        );
    }
}


// ==========================================
// Test 3: Bevel Gear
// ==========================================
echo("--- STARTING TEST 3: Bevel Gear ---");
translate([-25, -25, 0]) {
    color("gold") {
        bevel_gear(
            mm_per_tooth    = 6,
            number_of_teeth = 15,
            thickness       = 8,
            bevel_angle     = 30,
            hole_diameter   = 6,
            pressure_angle  = 20
        );
    }
}


// ==========================================
// Test 4: Gear Rack
// ==========================================
echo("--- STARTING TEST 4: Gear Rack ---");
translate([25, -25, 0]) {
    color("green") {
        gear_rack(
            mm_per_tooth    = 6,
            number_of_teeth = 8,
            thickness       = 8,
            height          = 10,
            pressure_angle  = 20
        );
    }
}
