// Parametric 2D Mechanical Drafting of a Bolt with Paper Cover
// File: Documents/scad/drafting_bolt_2d.scad

// ==========================================
// 1. PAPER SHEET FRAME CONFIGURATION (Real Millimeters)
// ==========================================
paper_size     = "A4";    // Select paper size cover: "A4", "A3", "A2", "A0"
sheet_title    = "M12 HEX HEAD BOLT PROFILE";
sheet_dwg_no   = "CAD-BOLT-001";
sheet_scale    = "1:1";

// Standard ISO paper dimensions (Landscape)
sheet_w = (paper_size == "A4") ? 297 : 
          ((paper_size == "A3") ? 420 : 
           ((paper_size == "A2") ? 594 : 
            ((paper_size == "A0") ? 1189 : 420)));
            
sheet_h = (paper_size == "A4") ? 210 : 
          ((paper_size == "A3") ? 297 : 
           ((paper_size == "A2") ? 420 : 
            ((paper_size == "A0") ? 841 : 297)));

// Margins (20mm Left for binding/filing, 10mm other sides)
m_left  = 20;
m_other = 10;

frame_x1 = m_left;
frame_x2 = sheet_w - m_other;
frame_y1 = m_other;
frame_y2 = sheet_h - m_other;

// Center coordinates of inner working area
center_x = (frame_x1 + frame_x2) / 2;
center_y = (frame_y1 + frame_y2) / 2;

// ==========================================
// 2. BOLT PARAMETERS (Fully Customizable)
// ==========================================
bolt_d         = 12;    // Thread Major Diameter (M12)
bolt_l         = 50;    // Shank Length
head_d         = 19;    // Hex Head Across Flats (19 AF)
head_h         = 8;     // Hex Head Height
thread_l       = 35;    // Threaded Length
chamfer_size   = 1.5;   // Bevel chamfer at tip

// Calculated Thread Minor Diameter (ISO standard ~ 0.85 * d)
minor_d = bolt_d * 0.85;

// Translation offset to perfectly center the bolt drawing in the sheet
// Shank length = 50, Head height = 8. Median X of bolt is at 21. Center Y is 0.
dx = center_x - 21;
dy = center_y;

// ==========================================
// 3. UTILITIES
// ==========================================
module centerline(x_start, x_end, y) {
  2d.line([x_start, y], [x_end, y], color=0x8b949e, layer="CENTER");
}

// ==========================================
// 4. DRAWING SHEET & COVER FRAME
// ==========================================

// A. Outer Paper Edge
2d.polyline(points=[
  [0, 0],
  [sheet_w, 0],
  [sheet_w, sheet_h],
  [0, sheet_h],
  [0, 0]
], closed=true, color=0x3c4043, layer="PAPER_BORDER");

// B. Inner Frame (Border margin)
2d.polyline(points=[
  [frame_x1, frame_y1],
  [frame_x2, frame_y1],
  [frame_x2, frame_y2],
  [frame_x1, frame_y2],
  [frame_x1, frame_y1]
], closed=true, color=0xffffff, layer="BORDER_FRAME");

// C. Title Block (120mm x 30mm)
tb_w = 120;
tb_h = 30;
tb_x1 = frame_x2 - tb_w;
tb_x2 = frame_x2;
tb_y1 = frame_y1;
tb_y2 = frame_y1 + tb_h;

2d.polyline(points=[
  [tb_x1, tb_y1],
  [tb_x2, tb_y1],
  [tb_x2, tb_y2],
  [tb_x1, tb_y2],
  [tb_x1, tb_y1]
], closed=true, color=0xffffff, layer="TITLE_BLOCK");

// Title Block Grid lines
2d.line([tb_x1, tb_y1 + 15], [tb_x2, tb_y1 + 15], color=0xffffff, layer="TITLE_BLOCK");
2d.line([tb_x1 + 80, tb_y1], [tb_x1 + 80, tb_y1 + 15], color=0xffffff, layer="TITLE_BLOCK");

// Title Block Content (Technical Texts)
2d.mtext(sheet_title, center=[tb_x1 + 5, tb_y1 + 20], height=3.2, width=110, color=0x00ffff, layer="TITLE_TEXT");

2d.mtext("DRAWING NO:", center=[tb_x1 + 5, tb_y1 + 10], height=1.8, width=70, color=0x8b949e, layer="TITLE_TEXT");
2d.mtext(sheet_dwg_no, center=[tb_x1 + 5, tb_y1 + 4], height=2.5, width=70, color=0xffffff, layer="TITLE_TEXT");

2d.mtext("SCALE:", center=[tb_x1 + 85, tb_y1 + 10], height=1.8, width=30, color=0x8b949e, layer="TITLE_TEXT");
2d.mtext(sheet_scale, center=[tb_x1 + 85, tb_y1 + 4], height=2.5, width=30, color=0xffffff, layer="TITLE_TEXT");

// ==========================================
// 5. BOLT DRAWING (Centered and Hatch-Filled)
// ==========================================

// Upper Shank half outline (with chamfered tip)
// 2d.polyline(points=[
//   [dx + 0, dy + 0],
//   [dx + bolt_l - chamfer_size, dy + 0],
//   [dx + bolt_l, dy + chamfer_size],
//   [dx + bolt_l, dy + (bolt_d/2) - chamfer_size],
//   [dx + bolt_l - chamfer_size, dy + bolt_d/2],
//   [dx + 0, dy + bolt_d/2],
//   [dx + 0, dy + 0]
// ], closed=true, color=0x00aaff, layer="OUTLINE");

// // Lower Shank half outline (with chamfered tip)
// 2d.polyline(points=[
//   [dx + 0, dy + 0],
//   [dx + bolt_l - chamfer_size, dy + 0],
//   [dx + bolt_l, dy - chamfer_size],
//   [dx + bolt_l, dy - (bolt_d/2) + chamfer_size],
//   [dx + bolt_l - chamfer_size, dy - bolt_d/2],
//   [dx + 0, dy - bolt_d/2],
//   [dx + 0, dy + 0]
// ], closed=true, color=0x00aaff, layer="OUTLINE");

// // Hex Head Outline
// 2d.polyline(points=[
//   [dx - head_h, dy - head_d/2],
//   [dx + 0, dy - head_d/2],
//   [dx + 0, dy + head_d/2],
//   [dx - head_h, dy + head_d/2],
//   [dx - head_h, dy - head_d/2]
// ], closed=true, color=0x00aaff, layer="OUTLINE");

// // Internal Chamfer lines on Hex Head (shows facets in side view)
// 2d.line([dx - head_h, dy - head_d/4], [dx + 0, dy - head_d/4], color=0x0088ff, layer="OUTLINE");
// 2d.line([dx - head_h, dy + head_d/4], [dx + 0, dy + head_d/4], color=0x0088ff, layer="OUTLINE");

// // Thread Minor Diameter Lines (thin ISO lines indicating M12 thread limits)
// 2d.line([dx + bolt_l - thread_l, dy + minor_d/2], [dx + bolt_l - chamfer_size, dy + minor_d/2], color=0x00ffff, layer="THREADS");
// 2d.line([dx + bolt_l - thread_l, dy - minor_d/2], [dx + bolt_l - chamfer_size, dy - minor_d/2], color=0x00ffff, layer="THREADS");

// // Thread boundary line
// 2d.line([dx + bolt_l - thread_l, dy - bolt_d/2], [dx + bolt_l - thread_l, dy + bolt_d/2], color=0x00ffff, layer="THREADS");

// // Section Hatching (ANSI31 Pattern)
// 2d.hatch(pattern="ANSI31", scale=1.5, color=0x8b949e, points=[
//   [dx + 0, dy + 0],
//   [dx + bolt_l - chamfer_size, dy + 0],
//   [dx + bolt_l, dy + chamfer_size],
//   [dx + bolt_l, dy + (bolt_d/2) - chamfer_size],
//   [dx + bolt_l - chamfer_size, dy + bolt_d/2],
//   [dx + 0, dy + bolt_d/2]
// ], layer="HATCH");

// 2d.hatch(pattern="ANSI31", scale=1.5, color=0x8b949e, points=[
//   [dx + 0, dy + 0],
//   [dx + bolt_l - chamfer_size, dy + 0],
//   [dx + bolt_l, dy - chamfer_size],
//   [dx + bolt_l, dy - (bolt_d/2) + chamfer_size],
//   [dx + bolt_l - chamfer_size, dy - bolt_d/2],
//   [dx + 0, dy - bolt_d/2]
// ], layer="HATCH");

// // Symmetry Axis Centerline
// centerline(dx - head_h - 8, dx + bolt_l + 8, dy);

// ==========================================
// 6. TECHNICAL DIMENSIONING ANNOTATIONS (dim.*)
// ==========================================

// // Shank Length Dimension (L = 50)
// dim.linear([dx + 0, dy - bolt_d/2], [dx + bolt_l, dy - bolt_d/2], offset=-16, color=0x00ff00, layer="DIMENSIONS");

// // Hex Head Height Dimension (H = 8)
// dim.linear([dx - head_h, dy + head_d/2], [dx + 0, dy + head_d/2], offset=12, color=0x00ff00, layer="DIMENSIONS");

// // Thread Major Diameter Dimension (M12)
// dim.linear([dx + bolt_l, dy - bolt_d/2], [dx + bolt_l, dy + bolt_d/2], offset=15, color=0x00ff00, layer="DIMENSIONS");

// // Hex Head Across Flats (19 AF)
// dim.linear([dx - head_h, dy - head_d/2], [dx - head_h, dy + head_d/2], offset=-15, color=0x00ff00, layer="DIMENSIONS");

// ==========================================
// 7. SHEET VIEW NOTES
// ==========================================
2d.mtext("M12 HEX HEAD BOLT - SECTIONAL PROFILE VIEW", center=[dx + bolt_l/2 - 25, dy + head_d/2 + 25], height=3.5, width=200, color=0x00ffff, layer="NOTES");
2d.mtext("ALL DIMENSIONS IN MILLIMETERS", center=[dx + bolt_l/2 - 25, dy + head_d/2 + 20], height=2.2, width=150, color=0x8b949e, layer="NOTES");
