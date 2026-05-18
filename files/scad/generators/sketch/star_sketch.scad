// Parametric Star Sketch Profile Generator
// Produces pure 2D CAD sketch entities (Polyline, Circle, and Text).

points = 5; // [3:1:20] Number of star points
outer_r = 20; // [5:1:100] Outer radius
inner_r = 10; // [2:1:50] Inner radius
show_hub = true; // [true, false] Show hub reference circle
show_label = true; // [true, false] Show size text label

// 1. Generate the main star perimeter using a native 2D polyline
star_pts = [
  for (i = [0 : points*2-1])
    let (
      angle = i * 180 / points,
      r = (i % 2 == 0) ? outer_r : inner_r
    )
    [r * cos(angle), r * sin(angle)]
];

2d.polyline(star_pts, true);

// 2. Reference Hub circle
if (show_hub) {
  2d.circle(inner_r, [0, 0]);
}

// 3. Size text label
if (show_label) {
  2d.text(str("STAR R", outer_r), [0, -outer_r - 6], 3);
}
