# sliders.scad

Simple V-groove based sliders and rails for linear motion assemblies.

To use these modules, add these lines to the beginning of your OpenSCAD/SCAD file:
```openscad
include <BOSL/constants.scad>
use <BOSL/sliders.scad>
```

---

## Table of Contents
1. [slider()](#slider) — Creates a matching carriage/slider block that rides on a V-groove rail.
2. [rail()](#rail) — Creates a high-precision sliding guide rail with V-grooves.

---

<a name="slider"></a>
## 1. slider()

### Usage
```openscad
slider(l, w, h, [base], [wall], [ang], [slop], [orient], [align])
```

### Description
Creates a sliding carriage block containing internal side recesses matching the standard matching V-groove rail. Ideal for linear guide carriage assemblies.

### Arguments
| Parameter | Default | Description |
| :--- | :--- | :--- |
| **`l`** | *Required* | Length of the slider block along the sliding axis (Y-axis). |
| **`w`** | *Required* | Overall width of the slider block. |
| **`h`** | *Required* | Overall height of the slider block. |
| **`base`** | `h` | Width of the middle flat base section (riding between the V-grooves). |
| **`wall`** | `2` | Thickness of the outer side walls holding the slider. |
| **`ang`** | `45` | Angle of the V-groove sliding guides in degrees. |
| **`slop`** | `0.2` | Clearance tolerance offset in millimeters for high-precision 3D prints (adds gap on all slider faces). |
| **`orient`** | `ORIENT_Y` | Bounding orientation of the part. Standard orientation runs along the Y-axis. |
| **`align`** | `V_UP` | Standard drafting alignment anchor location (e.g. `V_UP`, `V_CENTER`). |

### Example
```openscad
// Standard 30mm long slider block with 10mm wide base and 4mm thick sliding walls
slider(l=30, base=10, wall=4, slop=0.2, orient=ORIENT_Y);
```

---

<a name="rail"></a>
## 2. rail()

### Usage
```openscad
rail(l, w, h, [chamfer], [ang], [orient], [align])
```

### Description
Creates a V-groove guide rail designed to slide smoothly inside a matching slider block. Features a robust base profile and V-recesses on left and right side walls.

### Arguments
| Parameter | Default | Description |
| :--- | :--- | :--- |
| **`l`** | *Required* | Length of the guide rail along the sliding axis (Y-axis). |
| **`w`** | *Required* | Max width of the rail section. |
| **`h`** | *Required* | Overall height of the rail. |
| **`chamfer`** | `0` | Size of outer chamfer edges on the rail to avoid sharp corners. |
| **`ang`** | `45` | Angle of the side V-grooves in degrees (must match slider's angle). |
| **`orient`** | `ORIENT_Y` | Bounding orientation of the rail. Standard alignment runs along the Y-axis. |
| **`align`** | `V_UP` | Standard drafting alignment anchor location (e.g. `V_UP`, `V_CENTER`). |

### Example
```openscad
// Standard 100mm long linear guide rail
rail(l=100, w=10, h=10);
```
