// GEOL (Geometric Engine Optimized Library) - Joiners Showcase
// Demonstrates high-performance modular snap joiners, sliding rails, and mating locks.
// Created: 2026-05-18

use <GEOL/transforms.scad>
use <GEOL/joiners.scad>

$fn = 32;

// ==========================================
// Test 1: Half Joiner Male & Female
// ==========================================
echo("--- STARTING TEST 1: Half Joiner Male & Female ---");
translate([-30, 30, 0]) {
    // Male slide rail (Green)
    translate([-8, 0, 0]) {
        color("limegreen") {
            half_joiner(h=20, w=10, l=8, a=30, screwsize=3);
        }
    }
    
    // Female slot rail (Crimson, slightly translated to show mating)
    translate([8, 0, 0]) {
        color("crimson") {
            half_joiner2(h=20, w=10, l=8, a=30, screwsize=3);
        }
    }
}


// ==========================================
// Test 2: Double Locking Joiner Pair
// ==========================================
echo("--- STARTING TEST 2: Double Locking Joiner Pair ---");
translate([30, 30, 0]) {
    // Sliding connector block (Dodgerblue)
    color("dodgerblue") {
        joiner_pair(spacing=25, h=24, w=8, l=6, a=30, n=2, alternate=true);
    }
}


// ==========================================
// Test 3: Double-Sided Quad Joint Bracket
// ==========================================
echo("--- STARTING TEST 3: Double-Sided Quad Joint Bracket ---");
translate([-30, -30, 0]) {
    // Symmetrical quad bracket (Gold)
    color("gold") {
        joiner_quad(spacing1=24, spacing2=24, h=20, w=8, l=6, a=30, n=2);
    }
}


// ==========================================
// Test 4: Modular Interlocking Panel Assembly
// ==========================================
echo("--- STARTING TEST 4: Modular Interlocking Panel Assembly ---");
translate([30, -30, 0]) {
    // Panel A: Plate with joiner teeth carved out using difference (Orange)
    color("orange") {
        difference() {
            translate([-15, 0, 0]) cube([25, 4, 30], center=true);
            
            // Subtract slot clearance using joiner_clear
            translate([-2.5, 0, 0]) {
                joiner_clear(h=26, w=8, a=30, clearance=0.2);
            }
        }
    }

    // Panel B: Plate with mating joiner keys (DarkOrchid)
    translate([10, 0, 0]) {
        color("darkorchid") {
            union() {
                translate([12.5, 0, 0]) cube([25, 4, 30], center=true);
                
                // Add the joiner key
                translate([0, 0, 0]) {
                    joiner(h=26, w=8, l=4, a=30);
                }
            }
        }
    }
}
