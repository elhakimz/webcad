# Library File torx_drive.scad

Torx driver bits. To use, add these lines to the top of your file:

```openscad
include <BOSL/constants.scad>
use <BOSL/torx_drive.scad>
```

## Table of Contents

1. [Functions](#1-functions)
   - [torx_outer_diam()](#torx_outer_diam)
   - [torx_inner_diam()](#torx_inner_diam)
   - [torx_depth()](#torx_depth)
   - [torx_tip_radius()](#torx_tip_radius)
   - [torx_rounding_radius()](#torx_rounding_radius)
2. [Modules](#2-modules)
   - [torx_drive2d()](#torx_drive2d)
   - [torx_drive()](#torx_drive)

---

## 1. Functions

### torx_outer_diam()
**Description:** Get the typical outer diameter of Torx profile.
**Arguments:** `size` - Torx size (e.g. 10, 15, 20, 25, 30, etc.)

### torx_inner_diam()
**Description:** Get typical inner diameter of Torx profile.
**Arguments:** `size`

### torx_depth()
**Description:** Gets typical drive hole depth.
**Arguments:** `size`

### torx_tip_radius()
**Description:** Gets minor rounding radius of Torx profile.
**Arguments:** `size`

### torx_rounding_radius()
**Description:** Gets major rounding radius of Torx profile.
**Arguments:** `size`

---

## 2. Modules

### torx_drive2d()
**Description:** Creates a torx bit 2D profile.
**Arguments:** `size`
**Example:**
```openscad
torx_drive2d(size=30, $fa=1, $fs=1);
```

### torx_drive()
**Description:** Creates a torx bit tip.
**Arguments:** `size`, `l`, `center`
**Example:**
```openscad
torx_drive(size=30, l=10, $fa=1, $fs=1);
```
