// GEOL (Geometric Engine Optimized Library) - Transforms Module
// Highly optimized, library-free transformation shortcuts and distribution patterns.
// Created: 2026-05-18

// 1. Translation shortcut
module move(x=0, y=0, z=0) {
    translate([x, y, z]) children();
}

// 2. Rotation shortcuts
module xrot(a=0) {
    rotate([a, 0, 0]) children();
}

module yrot(a=0) {
    rotate([0, a, 0]) children();
}

module zrot(a=0) {
    rotate([0, 0, a]) children();
}

// 3. Mirroring helpers (retains original and adds mirrored child)
module mirror_x() {
    children();
    mirror([1, 0, 0]) children();
}

module mirror_y() {
    children();
    mirror([0, 1, 0]) children();
}

module mirror_z() {
    children();
    mirror([0, 0, 1]) children();
}

// 4. Grid Distribution Grid Spread
module grid_spread(spacing_x=20, spacing_y=20, count_x=2, count_y=2) {
    start_x = -((count_x - 1) * spacing_x) / 2;
    start_y = -((count_y - 1) * spacing_y) / 2;
    
    for (i = [0 : count_x - 1]) {
        for (j = [0 : count_y - 1]) {
            translate([start_x + i * spacing_x, start_y + j * spacing_y, 0]) {
                children();
            }
        }
    }
}

// 5. Radial Distribution
module radial_spread(r=10, count=6) {
    for (i = [0 : count - 1]) {
        angle = i * (360 / count);
        rotate([0, 0, angle]) {
            translate([r, 0, 0]) {
                children();
            }
        }
    }
}
