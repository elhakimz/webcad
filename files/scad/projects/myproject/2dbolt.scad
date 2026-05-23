// Parametric 2D Mechanical Drafting of a Bolt
// File: Documents/scad/drafting_bolt_2d.scad
// Upgraded to use high-fidelity namespaced 2d.* and dim.* primitives.
// Fully customizable parameters render instant mechanical layouts and export to CAD DXF blocks.

// ==========================================
// 1. PARAMETERS (Fully Customizable)
// ==========================================
bolt_d         = 12;    // Thread Major Diameter (M12)
bolt_l         = 50;    // Shank Length
head_d         = 19;    // Hex Head Across Flats (19 AF)
head_h         = 8;     // Hex Head Height
thread_l       = 35;    // Threaded Length
chamfer_size   = 1.5;   // Bevel chamfer at tip
draft_color    = [0.2, 0.6, 1.0, 1.0]; // Blueprint blue

// Calculated Thread Minor Diameter (ISO standard ~ 0.85 * d)
minor_d = bolt_d * 0.85;

// ==========================================
// 2. BACKWARDS-COMPATIBLE UTILITIES (Optional)
// ==========================================
module centerline(x_start, x_end, y=0) {
  // Renders a technical center-line using high-fidelity 2D lines
  2d.line([x_start, y], [x_end, y], color=0x8b949e, layer="CENTER");
}

// ==========================================
// 3. MAIN DRAFTING ASSEMBLY
// ==========================================
color(draft_color) {
  
  // ── A. THE BOLT BODY OUTLINES (Native 2D Polylines) ──
  
  // Upper Shank half outline (with chamfered tip)
  2d.polyline(points=[
    [0, 0],
    [bolt_l - chamfer_size, 0],
    [bolt_l, chamfer_size], // Chamfer start
    [bolt_l, (bolt_d/2) - chamfer_size],
    [bolt_l - chamfer_size, bolt_d/2],
    [0, bolt_d/2],
    [0, 0]
  ], closed=true, color=0x00aaff, layer="OUTLINE");

  // Lower Shank half outline (with chamfered tip)
  2d.polyline(points=[
    [0, 0],
    [bolt_l - chamfer_size, 0],
    [bolt_l, -chamfer_size], // Chamfer start
    [bolt_l, -(bolt_d/2) + chamfer_size],
    [bolt_l - chamfer_size, -bolt_d/2],
    [0, -bolt_d/2],
    [0, 0]
  ], closed=true, color=0x00aaff, layer="OUTLINE");

  // Hex Head Outline
  2d.polyline(points=[
    [-head_h, -head_d/2],
    [0, -head_d/2],
    [0, head_d/2],
    [-head_h, head_d/2],
    [-head_h, -head_d/2]
  ], closed=true, color=0x00aaff, layer="OUTLINE");
  
  // Internal Chamfer lines on Hex Head (shows facets in side view)
  2d.line([-head_h, -head_d/4], [0, -head_d/4], color=0x0088ff, layer="OUTLINE");
  2d.line([-head_h, head_d/4], [0, head_d/4], color=0x0088ff, layer="OUTLINE");

  // Thread Minor Diameter Lines (thin ISO lines indicating M12 thread limits)
  2d.line([bolt_l - thread_l, minor_d/2], [bolt_l - chamfer_size, minor_d/2], color=0x00ffff, layer="THREADS");
  2d.line([bolt_l - thread_l, -minor_d/2], [bolt_l - chamfer_size, -minor_d/2], color=0x00ffff, layer="THREADS");
  
  // Thread boundary line
  2d.line([bolt_l - thread_l, -bolt_d/2], [bolt_l - thread_l, bolt_d/2], color=0x00ffff, layer="THREADS");

  // ── B. HIGH-FIDELITY SECTION HATCHING (Native Hatch Primitives) ──
  
  // Upper half cross-section hatching
  2d.hatch(pattern="ANSI31", scale=1.5, color=0x555555, points=[
    [0, 0],
    [bolt_l - chamfer_size, 0],
    [bolt_l, chamfer_size],
    [bolt_l, (bolt_d/2) - chamfer_size],
    [bolt_l - chamfer_size, bolt_d/2],
    [0, bolt_d/2]
  ], layer="HATCH");
  
  // Lower half cross-section hatching
  2d.hatch(pattern="ANSI31", scale=1.5, color=0x555555, points=[
    [0, 0],
    [bolt_l - chamfer_size, 0],
    [bolt_l, -chamfer_size],
    [bolt_l, -(bolt_d/2) + chamfer_size],
    [bolt_l - chamfer_size, -bolt_d/2],
    [0, -bolt_d/2]
  ], layer="HATCH");

  // ── C. SYSTEM SYMMETRY AXIS (Centerline) ──
  centerline(-head_h - 8, bolt_l + 8, 0);

  // ==========================================
  // 4. TECHNICAL DIMENSIONING ANNOTATIONS (dim.*)
  // ==========================================

  // ── A. SHANK LENGTH DIMENSION (L = 50) ──
  dim.linear([0, -bolt_d/2], [bolt_l, -bolt_d/2], offset=-16, color=0x00ff00, layer="DIMENSIONS");

  // ── B. HEX HEAD HEIGHT DIMENSION (H = 8) ──
  dim.linear([-head_h, head_d/2], [0, head_d/2], offset=12, color=0x00ff00, layer="DIMENSIONS");

  // ── C. THREAD MAJOR DIAMETER DIMENSION (M12) ──
  dim.linear([bolt_l, -bolt_d/2], [bolt_l, bolt_d/2], offset=15, color=0x00ff00, layer="DIMENSIONS");

  // ── D. HEX HEAD ACROSS FLATS (19 AF) ──
  dim.linear([-head_h, -head_d/2], [-head_h, head_d/2], offset=-15, color=0x00ff00, layer="DIMENSIONS");
  
  // ==========================================
  // 5. TECHNICAL TEXT NOTES
  // ==========================================
  2d.mtext("M12 HEX HEAD BOLT - SECTIONAL PROFILE VIEW", center=[bolt_l/2 - 10, head_d/2 + 25], height=3.5, width=200, color=0x00ffff, layer="NOTES");
  2d.mtext("ALL DIMENSIONS IN MILLIMETERS", center=[bolt_l/2 - 10, head_d/2 + 20], height=2.2, width=150, color=0x8b949e, layer="NOTES");
}
