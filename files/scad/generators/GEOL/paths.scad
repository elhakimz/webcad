// GEOL (Geometric Engine Optimized Library) - Paths Module
// High-performance arbitrary 3D path sweeps, spiral extrusions, and path wireframe/polygon debug tools.
// Created: 2026-05-18

// ==========================================
// 1. Primitive Sweeps & Extrusions
// ==========================================

// Extrudes a 2D shape between two arbitrary 3D coordinates pt1 and pt2
module extrude_from_to(pt1, pt2, twist=undef, scale=undef, slices=undef) {
    v = pt2 - pt1;
    d = norm(v);
    pitch = acos(v[2] / d);
    yaw = atan2(v[1], v[0]);
    
    translate(pt1) {
        rotate([0, pitch, yaw]) {
            linear_extrude(height=d, twist=twist, scale=scale, slices=slices) {
                children();
            }
        }
    }
}

// Extrudes a 2D shape into a hollow shell of custom wall thickness
module extrude_2d_hollow(wall=2, height=50, twist=90, slices=60) {
    linear_extrude(height=height, twist=twist, slices=slices) {
        difference() {
            children();
            offset(r=-wall) {
                children();
            }
        }
    }
}

// Extrudes 2D children along a 3D spiral of given radius, height, and twist
module extrude_2dpath_along_spiral(h=50, r=10, twist=360, steps=30) {
    for (p = [0 : steps - 1]) {
        a1 = twist * (p / steps);
        pt1 = [r * cos(a1), r * sin(a1), h * (p / steps)];
        
        a2 = twist * ((p + 1) / steps);
        pt2 = [r * cos(a2), r * sin(a2), h * ((p + 1) / steps)];
        
        extrude_from_to(pt1, pt2) {
            children();
        }
    }
}


// ==========================================
// 2. 3D Curve Sweeping & Polyline Helpers
// ==========================================

// Sweeps 2D children along an arbitrary 3D polyline path
module extrude_2d_shapes_along_3dpath(path) {
    steps = len(path) - 1;
    for (i = [0 : steps - 1]) {
        pt1 = path[i];
        pt2 = path[i+1];
        extrude_from_to(pt1, pt2) {
            children();
        }
    }
}

// Renders cylindrical tubes between vertices and optional spheres at each coordinate
module trace_polyline(pline, showpts=true, size=0.5, line_color="lightgreen") {
    steps = len(pline) - 1;
    
    // 1. Connecting segments
    color(line_color) {
        for (i = [0 : steps - 1]) {
            pt1 = pline[i];
            pt2 = pline[i+1];
            extrude_from_to(pt1, pt2) {
                circle(r=size/2, $fn=8);
            }
        }
    }
    
    // 2. Vertex markers
    if (showpts) {
        for (i = [0 : len(pline) - 1]) {
            translate(pline[i]) {
                c = (i == 0 || i == len(pline)-1) ? "gold" : "coral";
                color(c) {
                    sphere(r=size, $fn=16);
                }
            }
        }
    }
}

// Renders a polygon with visual point-markers indicating first coordinate (gold) and path direction
module debug_polygon(points, paths=undef) {
    // 1. Main filled shape
    linear_extrude(height=1.0) {
        polygon(points=points, paths=paths);
    }
    // 2. Vertex order tracking spheres
    for (i = [0 : len(points) - 1]) {
        translate([points[i][0], points[i][1], 1.2]) {
            c = (i == 0) ? "gold" : ((i % 2 == 0) ? "dodgerblue" : "crimson");
            color(c) {
                sphere(r=0.6, $fn=16);
            }
        }
    }
}
