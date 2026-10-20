# BOSL metric_screws.scad Library Documentation

Screws, Bolts, and Nuts.

To include these modules in your SCAD script:
```openscad
include <BOSL/constants.scad>
use <BOSL/metric_screws.scad>
```

---

## 1. Functions

### get_metric_bolt_head_size()
Returns the diameter of a typical metric bolt's head, based on the bolt `size`.
* **Usage**: `get_metric_bolt_head_size(size)`

### get_metric_bolt_head_height()
Returns the height of a typical metric bolt's head, based on the bolt `size`.
* **Usage**: `get_metric_bolt_head_height(size)`

### get_metric_socket_cap_diam()
Returns the diameter of a typical metric socket cap bolt's head, based on the bolt `size`.
* **Usage**: `get_metric_socket_cap_diam(size)`

### get_metric_socket_cap_height()
Returns the height of a typical metric socket cap bolt's head, based on the bolt `size`.
* **Usage**: `get_metric_socket_cap_height(size)`

### get_metric_socket_cap_socket_size()
Returns the diameter of a typical metric socket cap bolt's hex drive socket, based on the bolt `size`.
* **Usage**: `get_metric_socket_cap_socket_size(size)`

### get_metric_socket_cap_socket_depth()
Returns the depth of a typical metric socket cap bolt's hex drive socket, based on the bolt `size`.
* **Usage**: `get_metric_socket_cap_socket_depth(size)`

### get_metric_iso_coarse_thread_pitch()
Returns the ISO metric standard coarse threading pitch for a given bolt `size`.
* **Usage**: `get_metric_iso_coarse_thread_pitch(size)`

### get_metric_iso_fine_thread_pitch()
Returns the ISO metric standard fine threading pitch for a given bolt `size`.
* **Usage**: `get_metric_iso_fine_thread_pitch(size)`

### get_metric_iso_superfine_thread_pitch()
Returns the ISO metric standard superfine threading pitch for a given bolt `size`.
* **Usage**: `get_metric_iso_superfine_thread_pitch(size)`

### get_metric_jis_thread_pitch()
Returns the JIS metric standard threading pitch for a given bolt `size`.
* **Usage**: `get_metric_jis_thread_pitch(size)`

### get_metric_nut_size()
Returns the typical metric nut flat-to-flat diameter for a given bolt `size`.
* **Usage**: `get_metric_nut_size(size)`

### get_metric_nut_thickness()
Returns the typical metric nut thickness for a given bolt `size`.
* **Usage**: `get_metric_nut_thickness(size)`

---

## 2. Modules

### screw()
Makes a very simple screw model, useful for making screw holes.
* **Usage**: `screw(screwsize, screwlen, headsize, headlen, [countersunk], [orient], [align])`
* **Parameters**:
  - `screwsize`: Diameter of the threaded part of the screw. Default: `3`.
  - `screwlen`: Length of the threaded part of the screw. Default: `10`.
  - `headsize`: Diameter of the screw head. Default: `6`.
  - `headlen`: Length of the screw head. Default: `3`.
  - `pitch`: Pitch of threads. No threads if not given.
  - `countersunk`: If true, center from the cap's top instead of its bottom. Default: `false`.
  - `orient`: Orientation of the screw. Use the `ORIENT_` constants from `constants.scad`. Default: `ORIENT_Z`.
  - `align`: Alignment of the screw. Use the `V_` constants from `constants.scad`, `"sunken"`, or `"base"`. Default: `"base"`.

#### Examples:
```openscad
screw(screwsize=3, screwlen=10, headsize=6, headlen=3, countersunk=true);
screw(screwsize=3, screwlen=10, headsize=6, headlen=3, align="base");
```

---

### metric_bolt()
Makes a standard metric screw model.
* **Usage**: `metric_bolt(headtype, size, l, [shank], [pitch], [details], [coarse], [flange], [phillips], [torx], [orient], [align])`
* **Parameters**:
  - `headtype`: One of `"hex"`, `"pan"`, `"button"`, `"round"`, `"countersunk"`, `"oval"`, `"socket"`. Default: `"socket"`.
  - `size`: Diameter of the threaded part of the screw. Default: `3`.
  - `l`: Length of the screw, except for the head. Default: `12`.
  - `shank`: Length of the unthreaded portion of the shaft. Default: `0`.
  - `pitch`: If given, renders threads of the given pitch. If `0`, then no threads. Overrides the `coarse` argument.
  - `details`: If true, the model is rendered with extra details (e.g., thread details). Default: `false`.
  - `coarse`: If true, makes coarse threads instead of fine threads. Default: `true`.
  - `flange`: Radius of flange beyond the head. Default: `0` (no flange).
  - `phillips`: If given, the size of the phillips drive hole to add (e.g., `"#1"`, `"#2"`, `"#3"`).
  - `torx`: If given, the size of the torx drive hole to add (e.g., `10`, `20`, `30`, etc.).
  - `orient`: Orientation of the bolt. Use the `ORIENT_` constants from `constants.scad`. Default: `ORIENT_Z`.
  - `align`: Alignment of the bolt. Use the `V_` constants from `constants.scad`, `"sunken"`, `"base"`, or `"shank"`. Default: `"base"`.

#### Examples:
```openscad
// Bolt Head Types
ydistribute(40) {
    xdistribute(30) {
        // Front Row, Left to Right
        metric_bolt(headtype="pan", size=10, l=15, details=true, phillips="#2");
        metric_bolt(headtype="button", size=10, l=15, details=true, phillips="#2");
        metric_bolt(headtype="round", size=10, l=15, details=true, phillips="#2");
    }
    xdistribute(30) {
        // Back Row, Left to Right
        metric_bolt(headtype="socket", size=10, l=15, details=true);
        metric_bolt(headtype="hex", size=10, l=15, details=true, phillips="#2");
        metric_bolt(headtype="countersunk", size=10, l=15, details=true, phillips="#2");
        metric_bolt(headtype="oval", size=10, l=15, details=true, phillips="#2");
    }
}

// Details
metric_bolt(size=10, l=15, details=true, $fn=32);

// No Details Except Threads
metric_bolt(size=10, l=15);

// No Details, No Threads
metric_bolt(size=10, l=15, pitch=0);

// Fine Threads
metric_bolt(size=10, l=15, coarse=false);

// Flange
metric_bolt(size=10, l=15, flange=5);

// Shank
metric_bolt(size=10, l=25, shank=10);

// Hex Head with Phillips
metric_bolt(headtype="hex", size=10, l=15, phillips="#2");

// Hex Head with Torx
metric_bolt(headtype="hex", size=10, l=15, torx=50);
```

---

### metric_nut()
Makes a model of a standard nut for a standard metric screw.
* **Usage**: `metric_nut(size, [hole], [pitch], [details], [flange], [center], [orient], [align])`
* **Parameters**:
  - `size`: Standard metric screw size in mm. Default: `3`.
  - `hole`: Include the hole in the nut. Default: `true`.
  - `pitch`: Pitch of threads in the hole. No threads if not given.
  - `flange`: Radius of flange beyond the head. Default: `0` (no flange).
  - `details`: If true, the model is rendered with extra details (e.g., chamfered edges). Default: `false`.
  - `orient`: Orientation of the nut. Use the `ORIENT_` constants from `constants.scad`. Default: `ORIENT_Z`.
  - `align`: Alignment of the nut. Use the `V_` constants from `constants.scad`. Default: `V_UP`.
  - `center`: If true, centers the nut at the origin. If false, sits on top of the XY plane. Overrides `align` if given.

#### Examples:
```openscad
// No details, No Hole. Useful for a mask.
metric_nut(size=10, hole=false);

// Hole, with No Threads
metric_nut(size=10, hole=true);

// Threads
metric_nut(size=10, hole=true, pitch=1.5);

// Details
metric_nut(size=10, hole=true, pitch=1.5, details=true);

// Centered
metric_nut(size=10, hole=true, pitch=1.5, details=true, center=true);

// Flange
metric_nut(size=10, hole=true, pitch=1.5, flange=3, details=true);
```
