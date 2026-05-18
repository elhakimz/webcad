// WebCAD Pure Advanced Paths & 3D Sweeps Showcase
// Implements extrude_2dpath_along_3dpath, extrude_2d_shapes_along_3dpath, trace_polyline, and debug_polygon in pure SCAD.
// NO EXTERNAL LIBRARIES OR BOSL USED.

$fn = 32;

// ==========================================
// 1. Pure SCAD Module Definitions
// ==========================================

// Helper: extrude_from_to
module extrude_from_to(pt1, pt2) {
    v = pt2 - pt1;
    d = norm(v);
    pitch = acos(v[2] / d);
    yaw = atan2(v[1], v[0]);
    
    translate(pt1) {
        rotate([0, pitch, yaw]) {
            linear_extrude(height=d) {
                children();
            }
        }
    }
}

// Module 1: extrude_2dpath_along_3dpath
module extrude_2dpath_along_3dpath(polyline, path, ang=0) {
    steps = len(path) - 1;
    for (i = [0 : steps - 1]) {
        pt1 = path[i];
        pt2 = path[i+1];
        extrude_from_to(pt1, pt2) {
            rotate([0, 0, ang]) {
                polygon(points=polyline);
            }
        }
    }
}

// Module 2: extrude_2d_shapes_along_3dpath
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

// Module 3: trace_polyline
module trace_polyline(pline, showpts=true, size=0.5, line_color="lightgreen") {
    steps = len(pline) - 1;
    // Draw connecting tubes
    color(line_color) {
        for (i = [0 : steps - 1]) {
            pt1 = pline[i];
            pt2 = pline[i+1];
            extrude_from_to(pt1, pt2) {
                circle(r=size/2, $fn=8);
            }
        }
    }
    // Draw vertices and control points
    if (showpts) {
        for (i = [0 : len(pline) - 1]) {
            translate(pline[i]) {
                // Alternating vertex colors: gold for start/mid/end, orange for others
                c = (i == 0 || i == len(pline)-1) ? "gold" : "coral";
                color(c) {
                    sphere(r=size, $fn=16);
                }
            }
        }
    }
}

// Module 4: debug_polygon
module debug_polygon(points, paths=undef) {
    // 1. Render the main filled polygon extruded to 3D
    linear_extrude(height=1.0) {
        polygon(points=points, paths=paths);
    }
    // 2. Render small spheres at each vertex, color-coded to show path order!
    for (i = [0 : len(points) - 1]) {
        translate([points[i][0], points[i][1], 1.2]) {
            // First vertex is bright gold, others alternate between crimson and dodgerblue
            c = (i == 0) ? "gold" : ((i % 2 == 0) ? "dodgerblue" : "crimson");
            color(c) {
                sphere(r=0.6, $fn=16);
            }
        }
    }
}


// ==========================================
// 2. Showcase Grid Layout
// ==========================================

// Test 1: extrude_2dpath_along_3dpath
echo("--- STARTING TEST 1: extrude_2dpath_along_3dpath ---");
translate([-30, 30, -5]) {
    color("crimson") {
        shape = [[0,-4], [2,-1], [2,1], [0,4], [10,0]];
        path = concat(
            [for (a=[30:30:180]) [20*cos(a)+20, 20*sin(a), 8*sin(a)]],
            [for (a=[330:-30:180]) [20*cos(a)-20, 20*sin(a), 8*sin(a)]]
        );
        extrude_2dpath_along_3dpath(shape, path, ang=140);
    }
}

// Test 2: extrude_2d_shapes_along_3dpath
echo("--- STARTING TEST 2: extrude_2d_shapes_along_3dpath ---");
translate([15, 30, -10]) {
    color("gold") {
        path = [ [0, 0, 0], [10, 10, 10], [20, 10, 12], [30, 0, 0], [45, 0, 0] ];
        extrude_2d_shapes_along_3dpath(path) {
            circle(r=4, $fn=6);
        }
    }
}

// Test 3: trace_polyline
echo("--- STARTING TEST 3: trace_polyline ---");
translate([-30, -30, -10]) {
    polyline = [for (a=[0:15:360]) [10*cos(a), 10*sin(a), 20*(a/360)]];
    trace_polyline(polyline, showpts=true, size=0.8, line_color="limegreen");
}

// Test 4: debug_polygon
echo("--- STARTING TEST 4: debug_polygon ---");
translate([30, -30, -5]) {
    color("orchid") {
        outer_ngon = [for (a=[0:45:315]) [10 * cos(a), 10 * sin(a)]];
        inner_ngon = [for (a=[315:-45:0]) [7 * cos(a), 7 * sin(a)]];
        
        points = concat(outer_ngon, inner_ngon);
        paths = [
            [for (i=[0:7]) i],
            [for (i=[15:-1:8]) i]
        ];
        
        debug_polygon(points=points, paths=paths);
    }
}
