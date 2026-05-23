// GEOL (Geometric Engine Optimized Library) - Joiners Module
// Highly optimized, library-free snap-together sliding joints and connectors.
// Created: 2026-05-18

// ==========================================
// 1. General Constants & Directional Vectors
// ==========================================
PRINTER_SLOP = 0.20;

V_LEFT   = [-1,  0,  0];
V_RIGHT  = [ 1,  0,  0];
V_FWD    = [ 0, -1,  0];
V_BACK   = [ 0,  1,  0];
V_DOWN   = [ 0,  0, -1];
V_UP     = [ 0,  0,  1];
V_CENTER = [ 0,  0,  0];

ORIENT_X = [90,  0,  90];
ORIENT_Y = [90,  0, 180];
ORIENT_Z = [ 0,  0,   0];

// ==========================================
// 2. High-Performance Utility Modules
// ==========================================
function is_def(v) = (v != undef);
function first_defined(arr) = 
    is_def(arr[0]) ? arr[0] : (
    is_def(arr[1]) ? arr[1] : (
    is_def(arr[2]) ? arr[2] : (
    is_def(arr[3]) ? arr[3] : undef
    )));

module up(z)    { translate([0, 0, z]) children(); }
module down(z)  { translate([0, 0, -z]) children(); }
module left(x)  { translate([-x, 0, 0]) children(); }
module right(x) { translate([x, 0, 0]) children(); }
module fwd(y)   { translate([0, -y, 0]) children(); }
module back(y)  { translate([0, y, 0]) children(); }

module xrot(a=0) { rotate([a, 0, 0]) children(); }
module yrot(a=0) { rotate([0, a, 0]) children(); }
module zrot(a=0) { rotate([0, 0, a]) children(); }

module xspread(spacing, n=2) {
    if (n <= 1) {
        children();
    } else {
        start_x = -((n - 1) * spacing) / 2;
        for (i = [0 : n - 1]) {
            translate([start_x + i * spacing, 0, 0]) children();
        }
    }
}

module yspread(spacing, n=2) {
    if (n <= 1) {
        children();
    } else {
        start_y = -((n - 1) * spacing) / 2;
        for (i = [0 : n - 1]) {
            translate([0, start_y + i * spacing, 0]) children();
        }
    }
}

module grid3d(xa=[0], ya=[0], za=[0]) {
    for (x = xa) {
        for (y = ya) {
            for (z = za) {
                translate([x, y, z]) children();
            }
        }
    }
}

module zrot_copies(n=2) {
    for (i = [0 : n - 1]) {
        rotate([0, 0, i * 360 / n]) children();
    }
}

module orient_and_align(size, orient=ORIENT_Z, align=V_CENTER, orig_orient=ORIENT_Z) {
    // Map rotated size based on target orientation for post-rotation translation alignment
    rotsize = 
        (orient == [90, 0, 90])  ? [size[2], size[0], size[1]] : // X
        (orient == [90, 0, 180]) ? [size[0], size[2], size[1]] : // Y
                                   [size[0], size[1], size[2]];  // Z
                                   
    tx = align[0] * rotsize[0] / 2;
    ty = align[1] * rotsize[1] / 2;
    tz = align[2] * rotsize[2] / 2;

    translate([tx, ty, tz]) {
        if (orig_orient == orient) {
            children();
        } else if (orig_orient == [90, 0, 180] && orient == [0, 0, 0]) {
            rotate([-90, 0, -180]) children();
        } else if (orig_orient == [90, 0, 180] && orient == [90, 0, 90]) {
            rotate([0, 0, 90]) children();
        } else {
            rotate(orient) rotate([-orig_orient[0], -orig_orient[1], -orig_orient[2]]) children();
        }
    }
}

// ==========================================
// 3. Core Joiner Modules
// ==========================================

// Module: half_joiner_clear()
module half_joiner_clear(h=20, w=10, a=30, clearance=0, overlap=0.01, orient=ORIENT_Y, align=V_CENTER) {
    dmnd_height = h * 1.0;
    dmnd_width = dmnd_height * tan(a);
    guide_size = w / 3;
    guide_width = 2 * (dmnd_height / 2 - guide_size) * tan(a);

    orient_and_align([w, guide_width, h], orient, align, orig_orient=ORIENT_Y) {
        yspread(overlap, n=(overlap > 0 ? 2 : 1)) {
            difference() {
                // Diamonds
                scale([w + clearance, dmnd_width / 2, dmnd_height / 2]) {
                    xrot(45) cube(size=[1, sqrt(2), sqrt(2)], center=true);
                }
                // Blunt point of tab
                yspread(guide_width + 4) {
                    cube(size=[(w + clearance) * 1.05, 4, h * 0.99], center=true);
                }
            }
        }
        if (overlap > 0) {
            cube([w + clearance, overlap + 0.001, h], center=true);
        }
    }
}

// Module: half_joiner()
module half_joiner(h=20, w=10, l=10, a=30, screwsize=undef, guides=true, slop=PRINTER_SLOP, orient=ORIENT_Y, align=V_CENTER) {
    dmnd_height = h * 1.0;
    dmnd_width = dmnd_height * tan(a);
    guide_size = w / 3;
    guide_width = 2 * (dmnd_height / 2 - guide_size) * tan(a);

    if ($children > 0) {
        difference() {
            children();
            half_joiner_clear(h=h, w=w, a=a, clearance=0.1, overlap=0.01, orient=orient, align=align);
        }
    }
    
    orient_and_align([w, 2*l, h], orient, align, orig_orient=ORIENT_Y) {
        difference() {
            union() {
                // Base
                difference() {
                    fwd(l / 2) cube(size=[w, l, h], center=true);
                    
                    grid3d(xa=[-(w * 2 / 3), (w * 2 / 3)]) {
                        half_joiner_clear(h=h + 0.01, w=w, clearance=slop * 2, a=a);
                    }
                }

                // Tab
                difference() {
                    scale([w / 3 - slop * 2, dmnd_width / 2, dmnd_height / 2]) {
                        xrot(45) cube(size=[1, sqrt(2), sqrt(2)], center=true);
                    }
                    back(guide_width / 2 + 2) {
                        cube(size=[w * 0.99, 4, guide_size * 2], center=true);
                    }
                }

                // Guides
                if (guides == true) {
                    xspread(w / 3 - slop * 2) {
                        fwd(0.05 / 2) {
                            scale([0.75, 1, 2]) yrot(45) {
                                cube(size=[guide_size / sqrt(2), guide_width + 0.05, guide_size / sqrt(2)], center=true);
                            }
                        }
                        scale([0.25, 0.5, 1]) zrot(45) {
                            cube(size=[guide_size / sqrt(2), guide_size / sqrt(2), dmnd_width], center=true);
                        }
                    }
                }
            }

            // Optional screw holes
            if (screwsize != undef) {
                yrot(90) cylinder(r=screwsize * 1.1 / 2, h=w + 1, center=true, $fn=12);
            }
        }
    }
}

// Module: half_joiner2()
module half_joiner2(h=20, w=10, l=10, a=30, screwsize=undef, guides=true, orient=ORIENT_Y, align=V_CENTER) {
    dmnd_height = h * 1.0;
    dmnd_width = dmnd_height * tan(a);
    guide_size = w / 3;
    guide_width = 2 * (dmnd_height / 2 - guide_size) * tan(a);

    if ($children > 0) {
        difference() {
            children();
            half_joiner_clear(h=h, w=w, a=a, clearance=0.1, overlap=0.01, orient=orient, align=align);
        }
    }

    orient_and_align([w, 2 * l, h], orient, align, orig_orient=ORIENT_Y) {
        difference() {
            union() {
                fwd(l / 2) cube(size=[w, l, h], center=true);
                cube([w, guide_width, h], center=true);
            }

            // Subtract mated half_joiner
            zrot(180) {
                half_joiner(h=h + 0.01, w=w + 0.01, l=guide_width + 0.01, a=a, screwsize=undef, guides=guides, slop=0.0);
            }

            // Optional screw holes
            if (screwsize != undef) {
                yrot(90) cylinder(r=screwsize * 1.1 / 2, h=w + 1, center=true, $fn=12);
            }
        }
    }
}

// Module: joiner_clear()
module joiner_clear(h=40, w=10, a=30, clearance=0, overlap=0.01, orient=ORIENT_Y, align=V_CENTER) {
    dmnd_height = h * 0.5;
    dmnd_width = dmnd_height * tan(a);
    guide_size = w / 3;
    guide_width = 2 * (dmnd_height / 2 - guide_size) * tan(a);

    orient_and_align([w, guide_width, h], orient, align, orig_orient=ORIENT_Y) {
        up(h / 4) {
            half_joiner_clear(h=h / 2.0 - 0.01, w=w, a=a, overlap=overlap, clearance=clearance);
        }
        down(h / 4) {
            half_joiner_clear(h=h / 2.0 - 0.01, w=w, a=a, overlap=overlap, clearance=-0.01);
        }
    }
}

// Module: joiner()
module joiner(h=40, w=10, l=10, a=30, screwsize=undef, guides=true, slop=PRINTER_SLOP, orient=ORIENT_Y, align=V_CENTER) {
    if ($children > 0) {
        difference() {
            children();
            joiner_clear(h=h, w=w, a=a, clearance=0.1, orient=orient, align=align);
        }
    }
    orient_and_align([w, 2 * l, h], orient, align, orig_orient=ORIENT_Y) {
        up(h / 4) {
            half_joiner(h=h / 2, w=w, l=l, a=a, screwsize=screwsize, guides=guides, slop=slop);
        }
        down(h / 4) {
            half_joiner2(h=h / 2, w=w, l=l, a=a, screwsize=screwsize, guides=guides);
        }
    }
}

// Module: joiner_pair_clear()
module joiner_pair_clear(spacing=100, h=40, w=10, a=30, n=2, clearance=0, overlap=0.01, orient=ORIENT_Y, align=V_CENTER) {
    dmnd_height = h * 0.5;
    dmnd_width = dmnd_height * tan(a);
    guide_size = w / 3;
    guide_width = 2 * (dmnd_height / 2 - guide_size) * tan(a);

    orient_and_align([spacing + w, guide_width, h], orient, align, orig_orient=ORIENT_Y) {
        xspread(spacing, n=n) {
            joiner_clear(h=h, w=w, a=a, clearance=clearance, overlap=overlap);
        }
    }
}

// Module: joiner_pair()
module joiner_pair(spacing=100, h=40, w=10, l=10, a=30, n=2, alternate=true, screwsize=undef, guides=true, slop=PRINTER_SLOP, orient=ORIENT_Y, align=V_CENTER) {
    if ($children > 0) {
        difference() {
            children();
            joiner_pair_clear(spacing=spacing, h=h, w=w, a=a, clearance=0.1, orient=orient, align=align);
        }
    }
    orient_and_align([spacing + w, 2 * l, h], orient, align, orig_orient=ORIENT_Y) {
        left((n - 1) * spacing / 2) {
            for (i = [0 : n - 1]) {
                right(i * spacing) {
                    yrot(180 + (alternate ? (i * 180 + (alternate == "alt" ? 180 : 0)) % 360 : 0)) {
                        joiner(h=h, w=w, l=l, a=a, screwsize=screwsize, guides=guides, slop=slop);
                    }
                }
            }
        }
    }
}

// Module: joiner_quad_clear()
module joiner_quad_clear(xspacing=undef, yspacing=undef, spacing1=undef, spacing2=undef, n=2, h=40, w=10, a=30, clearance=0, overlap=0.01, orient=ORIENT_Y, align=V_CENTER) {
    s1 = first_defined([spacing1, xspacing, 100]);
    s2 = first_defined([spacing2, yspacing, 50]);
    orient_and_align([w + s1, s2, h], orient, align, orig_orient=ORIENT_Y) {
        zrot_copies(n=2) {
            back(s2 / 2) {
                joiner_pair_clear(spacing=s1, n=n, h=h, w=w, a=a, clearance=clearance, overlap=overlap);
            }
        }
    }
}

// Module: joiner_quad()
module joiner_quad(spacing1=undef, spacing2=undef, xspacing=undef, yspacing=undef, h=40, w=10, l=10, a=30, n=2, alternate=true, screwsize=undef, guides=true, slop=PRINTER_SLOP, orient=ORIENT_Y, align=V_CENTER) {
    s1 = first_defined([spacing1, xspacing, 100]);
    s2 = first_defined([spacing2, yspacing, 50]);
    if ($children > 0) {
        difference() {
            children();
            joiner_quad_clear(spacing1=s1, spacing2=s2, h=h, w=w, a=a, clearance=0.1, orient=orient, align=align);
        }
    }
    orient_and_align([w + s1, s2, h], orient, align, orig_orient=ORIENT_Y) {
        zrot_copies(n=2) {
            back(s2 / 2) {
                joiner_pair(spacing=s1, n=n, h=h, w=w, l=l, a=a, screwsize=screwsize, guides=guides, slop=slop);
            }
        }
    }
}
