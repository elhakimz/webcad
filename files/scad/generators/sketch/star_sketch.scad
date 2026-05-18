// Parametric Star Sketch Generator
// Renders a high-performance 2D star profile.

points = 5; // [3:1:20] Number of star points
outer_r = 20; // [5:1:100] Outer radius
inner_r = 10; // [2:1:50] Inner radius

module star_2d(p=5, r1=20, r2=10) {
  polygon([
    for (i = [0 : p*2-1])
      let (
        angle = i * 180 / p,
        r = (i % 2 == 0) ? r1 : r2
      )
      [r * cos(angle), r * sin(angle)]
  ]);
}

star_2d(points, outer_r, inner_r);
