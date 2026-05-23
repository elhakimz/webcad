// Showcase 3: Rounded Barbell Bracket
hull() {
  // Left pivot anchor
  translate([-20, 0, 0])
    sphere(r=8);

  // Right pivot anchor
  translate([20, 0, 0])
    sphere(r=8);

  // Top structural riser
  translate([0, 0, 12])
    cube([10, 10, 4], center=true);
}