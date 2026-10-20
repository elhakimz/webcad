# Parametric 2D Blueprint Drafting: Bolt Showcase
**File Path:** [drafting_bolt_2d.scad](file:///c:/Dev/webcad/Documents/scad/drafting_bolt_2d.scad)

This showcase script presents a complete, highly customizable, and completely standard-compliant **2D technical drafting blueprint of a hexagon bolt**. It demonstrates how to push past standard 3D primitives to construct professional engineering sheets using WebCAD's 2D engine.

---

## 🛠️ The 4 Pillars of Parametric 2D Drafting

### 1. Vector Typography Library (Font-Independent)
Since standard `text()` is restricted under extreme browser sandboxing (due to SHX/TTF extraction constraints), this blueprint includes a custom **Technical Vector Lettering Library**. By using a helper `stroke(p1, p2, thickness)` module that constructs linear segments out of rotated rectangles, it draws perfect blueprint annotations like **"M12"**, **"L = 50"**, and **"19 AF"** with zero runtime dependencies.

```openscad
// Vector Stroke utility
module stroke(p1, p2, t=0.4) {
  dx = p2[0] - p1[0];
  dy = p2[1] - p1[1];
  len = sqrt(dx*dx + dy*dy);
  angle = atan2(dy, dx);
  translate(p1)
    rotate(angle)
      square([len, t]);
}
```

### 2. ISO Section Hatching
In standard technical drawings, sectioned parts are filled with parallel diagonal lines at a $45^\circ$ angle. This script uses a procedural `for()` loop to dynamically generate hatch strokes across the shank's upper and lower halves, adjusting automatically when parameters like `bolt_l` (length) and `hatch_spacing` are updated.

```openscad
// Upper shank diagonal hatch lines
for (x = [2 : hatch_spacing : bolt_l - 2]) {
  stroke([x, 0], [x + (bolt_d/2), bolt_d/2], hatch_width);
}
```

### 3. technical Dimension Annotations
Standard dimensions consist of extension lines, a dimension line, and sharp arrowheads. This script includes an `arrowhead(point, angle)` module that places arrowheads precisely at the ends of extension bars pointing towards or away from the part boundaries:

```openscad
module arrowhead(p, angle) {
  translate(p)
    rotate(angle)
      polygon(points=[[0,0], [-3, 0.7], [-3, -0.7]]);
}
```

### 4. Symmetry Axis Centerline (Dash-Dot-Dash)
According to ISO 128 standards, axes of rotational symmetry must be marked with a **dash-dot-dash centerline**. The script includes a custom centerline module that loops across the part's full horizontal layout to construct this alternating pattern mathematically.

---

## 📐 Parametric Inputs

You can load this script in the **SCAD Editor** panel and modify any of the following variables to regenerate the entire blueprint instantly:

| Variable | Description | Default Value |
| :--- | :--- | :--- |
| `bolt_d` | Thread Major Diameter (M12) | `12` |
| `bolt_l` | Total Shank Length | `50` |
| `head_d` | Width Across Flats (Hex Head) | `19` |
| `head_h` | Hex Head Height | `8` |
| `thread_l` | Threaded Section Length | `35` |
| `chamfer_size` | Bevel size at the shank tip | `1.5` |
| `hatch_spacing` | Spacing between diagonal hatch lines | `3.5` |

---

## 🎨 Visual Preview Map

When compiled, the viewport renders the blueprint in **Blueprint Blue** (`[0.2, 0.6, 1.0, 1.0]`):

```
       19 AF (Hex head width)
       <--------->
           |
       +===+===============================+ 
       |   |/////// UPPER SHANK ///////////|___ 
       |   |///////////////////////////////|   \
  -----|---|-------------------------------|---|----> Axis of Symmetry (Centerline)
       |   |\\\\\\\ LOWER SHANK \\\\\\\\\\\|___/
       |   |\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\|
       +===+===============================+
           |
           |<------------- L = 50 ------------>|
```

## 💾 Verification Status

*   [x] **Syntactic correctness:** Tested and compiles cleanly in WebCAD.
*   [x] **Extrusion compatibility:** The entire 2D outline is designed in watertight halves, allowing you to wrap it in a `linear_extrude` or `rotate_extrude` block if desired.
*   [x] **Independent execution:** Needs zero external library imports or font systems.
