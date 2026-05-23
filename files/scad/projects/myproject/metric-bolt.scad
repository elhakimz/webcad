// GEOL (Geometric Engine Optimized Library) - Metric Screws Showcase
// Demonstrates high-performance parametric metric bolts, nuts, and screws.
// Evaluates in milliseconds using OpenCascade B-Rep!

use <GEOL/metric_screws.scad>

echo("--- STARTING SHOWCASE: GEOL METRIC SCREWS ---");
union(){
    metric_bolt(headtype="hex", size=12, l=25, shank=5, pitch=1.0, details=true, align="base");
}

// // Row 1: Screws and Hex Bolts
// // 1. Simple Screw Primitive
// translate([-60, 0, 0]) {
//     color("silver") {
//         screw(screwsize=4, screwlen=20, headsize=8, headlen=4, pitch=0.7, align="base");
//     }
// }

// // 2. Metric Hex Bolt with Coarse Thread
// translate([-30, 0, 0]) {
//     color("gold") {
//         metric_bolt(headtype="hex", size=6, l=25, shank=5, pitch=1.0, details=true, align="base");
//     }
// }

// // 3. Metric Hex Nut
// translate([-30, 0, 15]) {
//     color("teal") {
//         metric_nut(size=6, hole=true, pitch=1.0, details=true, center=true);
//     }
// }

// // Row 2: Cap and Pan Head Bolts
// // 4. Socket Cap Bolt with Detail Socket Indent
// translate([0, 0, 0]) {
//     color("crimson") {
//         metric_bolt(headtype="socket", size=8, l=30, shank=10, details=true, align="base");
//     }
// }

// // 5. Matching Hex Nut with Flange
// translate([0, 0, 20]) {
//     color("teal") {
//         metric_nut(size=8, hole=true, details=true, flange=3, center=true);
//     }
// }

// // 6. Pan Head Bolt
// translate([30, 0, 0]) {
//     color("dodgerblue") {
//         metric_bolt(headtype="pan", size=5, l=15, details=true, align="base");
//     }
// }

// // Row 3: Countersunk and Specialty Bolts
// // 7. Countersunk Flat Head Bolt
// translate([60, 0, 0]) {
//     color("silver") {
//         metric_bolt(headtype="countersunk", size=6, l=20, details=true, align="base");
//     }
// }

// // 8. Oval Head Bolt with Cone base and Round dome
// translate([90, 0, 0]) {
//     color("plum") {
//         metric_bolt(headtype="oval", size=6, l=20, details=true, align="base");
//     }
// }

// echo("--- SHOWCASE PREPARED FOR VIEWING ---");
