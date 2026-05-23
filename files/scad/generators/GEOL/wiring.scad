// GEOL (Geometric Engine Optimized Library) - Wiring Module
// High-performance, library-free parametric wire bundle visualizer.
// Draws wire bundles as lightweight CAD polylines or premium 3D swept OCC tubes.
// Created: 2026-05-19

// ==========================================
// Directional Vectors & Orientation Constants
// ==========================================
V_LEFT   = [-1,  0,  0];
V_RIGHT  = [ 1,  0,  0];
V_FWD    = [ 0, -1,  0];
V_BACK   = [ 0,  1,  0];
V_DOWN   = [ 0,  0, -1];
V_UP     = [ 0,  0,  1];
V_CENTER = [ 0,  0,  0];

// ==========================================
// Math Utilities
// ==========================================
function norm3(v) = sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
function unit3(v) = let(n = norm3(v)) (n == 0) ? [0, 0, 0] : [v[0]/n, v[1]/n, v[2]/n];
function cross3(a, b) = [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
];

// ==========================================
// 1. Functions (Hexagonal Wire Packing & Offsets)
// ==========================================

function hex_offset_ring(d, lev=0) =
    (lev == 0) ? [[0, 0]] : [
        for (
            sideang = [0 : 60 : 359.999],
            sidenum = [1 : lev]
        ) [
            lev * d * cos(sideang) + sidenum * d * cos(sideang + 120),
            lev * d * sin(sideang) + sidenum * d * sin(sideang + 120)
        ]
    ];

function hex_offsets(n, d, lev=0, arr=[]) =
    (len(arr) >= n) ? arr :
        hex_offsets(
            n=n,
            d=d,
            lev=lev + 1,
            arr=concat(arr, hex_offset_ring(d, lev=lev))
        );

// ==========================================
// 2. High-Performance Corner Filleting Math
// ==========================================

function fillet_corner_points(p_prev, p_curr, p_next, fillet, steps=8) =
    let(
        v1 = unit3(p_prev - p_curr),
        v2 = unit3(p_next - p_curr),
        dot = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2],
        angle = acos(max(-1, min(1, dot))),
        half_angle = angle / 2,
        
        d_ideal = (half_angle == 90 || half_angle == 0) ? 0 : fillet / tan(half_angle),
        d_max = min(norm3(p_curr - p_prev) * 0.45, norm3(p_next - p_curr) * 0.45),
        d = min(d_ideal, d_max),
        
        t1 = p_curr + d * v1,
        t2 = p_curr + d * v2
    )
    [ for (s = [0 : steps]) 
        let(t = s / steps)
        (1-t)*(1-t)*t1 + 2*(1-t)*t*p_curr + t*t*t2
    ];

function fillet_path_helper(p, fillet, steps, idx) =
    (idx == len(p) - 2) ? fillet_corner_points(p[idx-1], p[idx], p[idx+1], fillet, steps) :
    (idx == 1) ? concat([p[0]], fillet_corner_points(p[0], p[1], p[2], fillet, steps), fillet_path_helper(p, fillet, steps, 2)) :
    concat(fillet_corner_points(p[idx-1], p[idx], p[idx+1], fillet, steps), fillet_path_helper(p, fillet, steps, idx+1));

function geol_fillet_path(p, fillet, steps=8) =
    (len(p) < 3) ? p :
    concat(fillet_path_helper(p, fillet, steps, 1), [p[len(p)-1]]);

// ==========================================
// 3. Coordinate System & Offsets Along 3D Path
// ==========================================

// Tangent along path segment
function path_seg_t(p, k) = unit3(p[k+1] - p[k]);

// Normal vector along segment
function path_seg_n(p, k) =
    let(t = path_seg_t(p, k))
    (abs(t[0]) < 0.001 && abs(t[1]) < 0.001) ? [1, 0, 0] : unit3(cross3(t, [0, 0, 1]));

// Binormal vector along segment
function path_seg_b(p, k) =
    let(t = path_seg_t(p, k), n = path_seg_n(p, k))
    cross3(t, n);

// Offset displacement vector for a segment
function path_seg_offset(p, k, ox, oy) = ox * path_seg_n(p, k) + oy * path_seg_b(p, k);

// Averaged offset displacement vector at a vertex (node)
function path_vertex_offset(p, k, L, ox, oy) =
    (k == 0) ? path_seg_offset(p, 0, ox, oy) :
    (k == L) ? path_seg_offset(p, L-1, ox, oy) :
    0.5 * (path_seg_offset(p, k-1, ox, oy) + path_seg_offset(p, k, ox, oy));

// Offset 3D path coordinates for a specific wire
function wire_path_points(p, ox, oy) =
    let(L = len(p) - 1)
    [ for (k = [0 : L]) p[k] + path_vertex_offset(p, k, L, ox, oy) ];

// ==========================================
// 4. Core Module Using Native OCC Sweep
// ==========================================

// Module: wiring()
// Description: Returns a bundle of wires represented as CAD polylines or premium 3D swept tubes.
// profile parameter:
//   0 = circle (OCC sweep)
//   1 = polyline / dot (lightweight 2D path)
//   2 = band (flat ribbon)
//   3 = triangle
//   4 = rectangle
//   5 = pentagon
//   ... etc (number of sides up to 12)
module wiring(
    path, 
    wires, 
    wirediam=2, 
    fillet=10, 
    wirenum=0, 
    bezsteps=12,
    sweep=false,
    profile=0
) {
    colors = [
        "dimgray", "crimson", "limegreen", "gold",
        "dodgerblue", "white", "orange", "darkgray",
        "cyan", "magenta", "teal", "pink",
        "violet", "olive", "darkorange", "greenyellow",
        "cornflowerblue"
    ];
    
    offsets = hex_offsets(wires, wirediam);
    smooth_path = geol_fillet_path(path, fillet, bezsteps);
    
    // Determine profile properties
    do_sweep = sweep && (profile != 1);
    
    for (i = [0 : wires - 1]) {
        pts = wire_path_points(smooth_path, offsets[i][0], offsets[i][1]);
        color(colors[(i + wirenum) % len(colors)]) {
            if (do_sweep) {
                if (profile == 2) {
                    // Custom flat rectangular band profile
                    band_profile = [
                        [-wirediam/2, -wirediam/10, 0],
                        [wirediam/2, -wirediam/10, 0],
                        [wirediam/2, wirediam/10, 0],
                        [-wirediam/2, wirediam/10, 0]
                    ];
                    sweep(path=pts, profile=band_profile);
                } else {
                    // Regular polygon or circular sweep
                    sides = (profile == 0) ? 32 : profile;
                    sweep(path=pts, profile=sides, r=wirediam / 2);
                }
            } else {
                polyline2d(points=pts, closed=false);
            }
        }
    }
}
