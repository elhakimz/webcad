// Parametric Spiral Polyline Generator
// Produces a pure snappable 3D CAD polyline (pline) curling along a specified axis.

d_origin = 10;   // [1:1:200] Origin Diameter
d_middle = 15;   // [1:1:200] Middle Diameter
d_end = 20;      // [1:1:200] End Diameter
h = 50;          // [1:1:500] Length along axis
axis = "z";      // [x, y, z] Curl Axis
turns = 5;       // [1:1:50] Number of turns
steps = 100;     // [10:1:500] Number of steps
center = true;   // [true, false] Center along length

echo("--- GENERATING PARAMETRIC SPIRAL POLYLINE ---");
echo("Origin Diameter:", d_origin);
echo("Middle Diameter:", d_middle);
echo("End Diameter:", d_end);
echo("Length:", h);
echo("Turns:", turns);
echo("Axis:", axis);
echo("Steps:", steps);

// Quadratic diameter interpolation D(t) = a*t^2 + b*t + c
a = 2 * d_origin - 4 * d_middle + 2 * d_end;
b = -3 * d_origin + 4 * d_middle - d_end;
c = d_origin;

points = [
    for (i = [0 : steps])
        let (
            t = i / steps,
            r = (a * t * t + b * t + c) / 2,
            theta = t * turns * 360,
            pos_along = center ? (t - 0.5) * h : t * h
        )
        (axis == "x" || axis == "X") ? [pos_along, r * cos(theta), r * sin(theta)] :
        (axis == "y" || axis == "Y") ? [r * sin(theta), pos_along, r * cos(theta)] :
                                       [r * cos(theta), r * sin(theta), pos_along]
];

// Generate only a single snappable polyline
2d.polyline(points=points, closed=false);

echo("--- SPIRAL POLYLINE GENERATION COMPLETE ---");
