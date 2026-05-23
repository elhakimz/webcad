// WebCAD Parametric Wiring Bundle Generator
// Uses high-performance native GEOL wiring library.

use <../GEOL/wiring.scad>

// --- Parameters ---
// Number of wires in the bundle
wires = 4; // [1:1:12]
// Diameter of each individual wire
wirediam = 2.0; // [0.5:0.5:10.0]
// Corner fillet radius
fillet = 10.0; // [0.0:1.0:50.0]
// Profile: 0=Circle, 1=Line/Dot, 2=Band, 3=Triangle, 4=Square, 5=Pentagon, 6=Hexagon, etc.
profile = 0; // [0:1:12]
// Enable 3D swept wiring geometries
sweep = true;

// Default polyline path (overridden interactively when clicking a viewport entity!)
path = [[50, 0, -50], [50, 50, -50], [0, 50, -50], [0, 0, -50], [0, 0, 0]];

echo("--- GENERATING PARAMETRIC GEOL WIRING ---");
echo("Wires:", wires);
echo("Wire diameter:", wirediam);
echo("Corner fillet:", fillet);
echo("Profile index:", profile);
echo("Sweep enabled:", sweep);

wiring(
    path=path,
    wires=wires,
    wirediam=wirediam,
    fillet=fillet,
    profile=profile,
    sweep=sweep
);

echo("--- WIRING GENERATION COMPLETE ---");
