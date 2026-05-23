// Showcase 1: Chess Pawn Core
union() {
  // Base ring (cylinder)
  cylinder(h=2, r=12, center=false);

  // Main body tapered support (cone)
  translate([0, 0, 2])
    cone(r=10, h=12, center=false);

  // Top neck transition (frustum via cylinder)
  translate([0, 0, 10])
    cylinder(r1=6, r2=4, h=6, center=false);

  // Spherical head
  translate([0, 0, 19])
    sphere(r=4);
}