/*
 * @file parametric_box_example.scad
 * @brief Example of a parametric box with a lid
 * @copyright Cameron K. Brooks 2025
 * @license CC-BY-SA-4.0
 */

/* [Parameters] */

// Turn to false to disable generation of lid
show_lid = true; // [true, false]

// Turn to false to disable generation of the box
show_box = true; // [true, false]

// Turn to true to place the lid on the box
position = false; // [true, false]

// Turn to true to show the cross section
cross_section = false; // [true, false]

// this is the wall of the lip, the box is twice as thick
thickness = 1.2;

// internal x dimension
internal_width = 70;

// internal y dimension
internal_depth = 25;

// internal overall z dimension
internal_height = 100;

// this is taken of off the internal_z for the bottom height and acts as the lid internal height
internal_lid_height = 20;

// this is the height of the lip
lip_height = 10;

// Reduces lip wall thickness to create a clearance for the lid to fit, increase if the lid is too tight.
lip_allowance = 0.3;

zFite = $preview ? 0.1 : 0; // Value to prevent z-fighting during preview

// Call the module to generate the box
parametric_box(
  wall_thickness=thickness, internal_x=internal_width, internal_y=internal_depth,
  internal_z=internal_height, internal_lid_z=internal_lid_height, lip_z=lip_height,
  lip_allowance=lip_allowance, generate_lid=show_lid, generate_box=show_box,
  position_assembly=position, show_cross_section=cross_section
);

module parametric_box(
  wall_thickness,
  internal_x,
  internal_y,
  internal_z,
  internal_lid_z,
  lip_z,
  lip_allowance,
  generate_lid = false,
  generate_box = true,
  position_assembly = false,
  show_cross_section = false
) {
  // Calculated internal variables

  internal_botz = internal_z - internal_lid_z;

  lip_x = add_wall_thickness(internal_x, wall_thickness);
  lip_y = add_wall_thickness(internal_y, wall_thickness);

  outer_x = add_wall_thickness(lip_x, wall_thickness);
  outer_y = add_wall_thickness(lip_y, wall_thickness);

  outer_z_lid = add_wall_thickness(internal_lid_z - lip_z / 2, wall_thickness);
  outer_z_box = add_wall_thickness(internal_botz - lip_z / 2, wall_thickness);

  // Function to add wall thickness to a dimension
  function add_wall_thickness(dimension, thickness) = dimension + 2 * thickness;

  // Module to generate the box
  module bottom() {

    // Boolean difference of the lipped box and the internal box
    difference() {
      // Boolean union of the box and the lip
      union() {
        // Create the box
        cube([outer_x, outer_y, outer_z_box]);

        // Create the lip
        translate([wall_thickness, wall_thickness, outer_z_box]) cube([lip_x, lip_y, lip_z]);
      }

      // Cut out the internal box
      translate([2 * wall_thickness, 2 * wall_thickness, 2 * wall_thickness]) color("red")
          cube([internal_x, internal_y, internal_z]);
    }
  }

  // Module to generate the lid
  module lid() {
    // Boolean difference of the lid with the lip and the internal box
    difference() {

      // Create the lid
      cube([outer_x, outer_y, outer_z_lid + lip_z]);

      // Cut out the lip pocket
      translate([2 * wall_thickness, 2 * wall_thickness, -zFite / 2]) color("red")
          cube([internal_x, internal_y, internal_lid_z + lip_z / 2 + zFite]);

      // Cut out the internal box
      translate([wall_thickness - lip_allowance / 2, wall_thickness - lip_allowance / 2, -zFite / 2])
        color("red") cube([lip_x + lip_allowance, lip_y + lip_allowance, lip_z + lip_allowance]);
    }
  }

  // Module to create the cross section
  module create_cross_section(active = false) {
    if (active)
      difference() {
        children();
        translate([-zFite, -zFite, -zFite]) cube([outer_x * 2, outer_y / 2, internal_z * 2]);
      }
    else
      children();
  }

  // Conditional variables to position the lid and box
  lid_y_shift = position_assembly ? 0 : outer_y * 2 + 5;
  lid_z_shift = position_assembly ? outer_z_box : outer_z_lid + lip_z;
  lid_rot = position_assembly ? 0 : 180;

  if (generate_lid)
    translate([0, lid_y_shift, lid_z_shift + lip_allowance / 2]) create_cross_section(show_cross_section)
        rotate([lid_rot, 0, 0]) lid();

  if (generate_box)
    create_cross_section(show_cross_section) bottom();
}