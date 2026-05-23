// GEOL (Geometric Engine Optimized Library) - Wiring Showcase
// High-performance parametric wire bundles displaying 2D and 3D sweeps with custom profiles!

use <GEOL/wiring.scad>

echo("--- STARTING SHOWCASE: GEOL WIRING ---");

// 1. Double wire bundle: 2 wires, filleted to 10mm, 3D swept, circle profile (profile=0)
wiring(
    path=[[50, 0, -50], [50, 50, -50], [0, 50, -50], [0, 0, -50], [0, 0, 0]],
    fillet=10,
    wires=2,
    wirediam=2.0,
    sweep=true,
    profile=0
);

// 2. Double wire bundle: 2 wires, 3D swept, triangle profile (profile=3)
// Shifted by [0, 0, 10]
translate([0, 0, 10]) {
    wiring(
        path=[[50, 0, -50], [50, 50, -50], [0, 50, -50], [0, 0, -50], [0, 0, 0]],
        fillet=10,
        wires=2,
        wirediam=2.0,
        sweep=true,
        profile=3
    );
}

// 3. Double wire bundle: 2 wires, 3D swept, rectangle profile (profile=4)
// Shifted by [0, 0, 20]
translate([0, 0, 20]) {
    wiring(
        path=[[50, 0, -50], [50, 50, -50], [0, 50, -50], [0, 0, -50], [0, 0, 0]],
        fillet=10,
        wires=2,
        wirediam=2.0,
        sweep=true,
        profile=4
    );
}

// 4. Double wire bundle: 2 wires, 3D swept, band profile (profile=2)
// Shifted by [0, 0, 30]
translate([0, 0, 30]) {
    wiring(
        path=[[50, 0, -50], [50, 50, -50], [0, 50, -50], [0, 0, -50], [0, 0, 0]],
        fillet=10,
        wires=2,
        wirediam=2.0,
        sweep=true,
        profile=2
    );
}

// 5. Double wire bundle: 2 wires, polyline profile/dot (profile=1)
// Shifted by [0, 0, 40]
translate([0, 0, 40]) {
    wiring(
        path=[[50, 0, -50], [50, 50, -50], [0, 50, -50], [0, 0, -50], [0, 0, 0]],
        fillet=10,
        wires=2,
        wirediam=2.0,
        sweep=true,
        profile=1
    );
}

echo("--- SHOWCASE PREPARED FOR VIEWING ---");
