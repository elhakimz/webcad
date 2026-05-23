// GEOL (Geometric Engine Optimized Library) - Beziers Module
// High-performance, library-free Bezier curve evaluation, polyline flattening, and 3D sweeps.
// Created: 2026-05-18

use <paths.scad>

// ==========================================
// 1. Math Functions (De Casteljau's Algorithm)
// ==========================================

// Helper: Vector normalizer
function normalize(v) = let (n = norm(v)) n == 0 ? v : v / n;

// Helper: List slicer to isolate curve segments
function select_points(arr, start, end) = [for (i = [start : end]) arr[i]];

// Recursive De Casteljau evaluator for Bezier curves of any degree N
function bez_point(curve, u) =
    (len(curve) <= 1) ?
        curve[0] :
        bez_point(
            [for (i = [0 : len(curve) - 2]) curve[i] * (1 - u) + curve[i + 1] * u],
            u
        );

// Recursive tangent vector evaluator for Bezier curves
function bez_tangent(curve, u) =
    (len(curve) <= 2) ?
        normalize(curve[1] - curve[0]) :
        bez_tangent(
            [for (i = [0 : len(curve) - 2]) curve[i] * (1 - u) + curve[i + 1] * u],
            u
        );

// Converts a concatenated Bezier path (segments of N points sharing endpoints) into a flat polyline
function bezier_polyline(bezier, splinesteps=16, N=3) =
    let (segs = (len(bezier) - 1) / N)
    concat(
        [for (seg = [0 : segs - 1], i = [0 : splinesteps - 1])
            bez_point(select_points(bezier, seg * N, (seg + 1) * N), i / splinesteps)
        ],
        [bezier[len(bezier) - 1]]
    );


// ==========================================
// 2. 2D and 3D Shapes & Primitives
// ==========================================

// Creates a closed 2D polygon from a 2D Bezier path
module bezier_polygon(bezier, splinesteps=16, N=3) {
    polypoints = bezier_polyline(bezier, splinesteps, N);
    polygon(points=polypoints);
}

// Linearly extrudes a closed 2D Bezier path
module linear_extrude_bezier(bezier, height=50, splinesteps=16, N=3, twist=0, scale=1.0, slices=40, center=true) {
    linear_extrude(height=height, twist=twist, scale=scale, slices=slices, center=center) {
        bezier_polygon(bezier, splinesteps, N);
    }
}

// Revolve-extrudes a closed 2D Bezier path around the Z-axis
module rotate_extrude_bezier(bezier, splinesteps=16, N=3, angle=360) {
    rotate_extrude(angle=angle, $fn=36) {
        bezier_polygon(bezier, splinesteps, N);
    }
}


// ==========================================
// 3. Bezier Path Sweeps & Visualizers
// ==========================================

// Sweeps 2D children perpendicularly along a 3D Bezier curve
module extrude_2d_shapes_along_bezier(bezier, splinesteps=16, N=3) {
    path = bezier_polyline(bezier, splinesteps, N);
    extrude_2d_shapes_along_3dpath(path) {
        children();
    }
}

// Visualizes a Bezier control path with tubes and control nodes (gold endpoints, coral controls)
module trace_bezier(bez, N=3, size=1) {
    trace_polyline(bez, showpts=true, size=size/2, line_color="green");
    trace_polyline(bezier_polyline(bez, N=N), showpts=false, size=size, line_color="cyan");
}
