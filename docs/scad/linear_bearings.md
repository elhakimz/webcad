# Library File: linear_bearings.scad

Linear Bearing clips and holders. To use, add these lines to the top of your file:

```openscad
include <BOSL/constants.scad>
use <BOSL/linear_bearings.scad>
```

---

## Table of Contents

1. **Functions**
   - [get_lmXuu_bearing_diam()](#get_lmxuu_bearing_diam)
   - [get_lmXuu_bearing_length()](#get_lmxuu_bearing_length)

2. **Modules**
   - [linear_bearing_housing()](#linear_bearing_housing)
   - [lmXuu_housing()](#lmxuu_housing)

---

## 1. Functions

### `get_lmXuu_bearing_diam()`

**Description**:
Get outside diameter, in mm, of a standard lmXuu bearing.

**Usage**:
```openscad
diameter = get_lmXuu_bearing_diam(size);
```

**Parameters**:
- `size`: The nominal internal shaft size (e.g., `8` for LM8UU).

---

### `get_lmXuu_bearing_length()`

**Description**:
Get length, in mm, of a standard lmXuu bearing.

**Usage**:
```openscad
len = get_lmXuu_bearing_length(size);
```

**Parameters**:
- `size`: The nominal internal shaft size (e.g., `8` for LM8UU).

---

## 2. Modules

### `linear_bearing_housing()`

**Description**:
Creates a model of a clamp to hold a generic linear bearing cartridge.

**Usage**:
```openscad
linear_bearing_housing(d, l, tab, tabwall, wall, gap, screwsize, orient, align);
```

**Parameters**:
- `d`: Outer diameter of the bearing cartridge in mm.
- `l`: Length of the bearing cartridge in mm.
- `tab`: Width of the mounting/clamping tab. Default: `8`.
- `tabwall`: Thickness of the mounting/clamping tab. Default: `5`.
- `wall`: Main housing wall thickness. Default: `3`.
- `gap`: Clamp gap width. Default: `2`.
- `screwsize`: Clamp screw diameter. Default: `3`.
- `orient`: Orientation vector. Default: `ORIENT_Z` (or `[0,0,0]`).
- `align`: Anchor alignment vector. Default: `V_UP` (or `[0,0,1]`).

**Example**:
```openscad
linear_bearing_housing(d=19, l=29, wall=2, tab=6, screwsize=2.5);
```

---

### `lmXuu_housing()`

**Description**:
Creates a model of a clamp to hold a standard sized lmXuu linear bearing cartridge.

**Usage**:
```openscad
lmXuu_housing(size, tab, tabwall, wall, gap, screwsize, orient, align);
```

**Parameters**:
- `size`: Nominal internal shaft size of the LMxUU bearing in mm (e.g., `8` for LM8UU, `10` for LM10UU).
- `tab`: Width of the mounting/clamping tab. Default: `8`.
- `tabwall`: Thickness of the mounting/clamping tab. Default: `5`.
- `wall`: Main housing wall thickness. Default: `3`.
- `gap`: Clamp gap width. Default: `2`.
- `screwsize`: Clamp screw diameter. Default: `3`.
- `orient`: Orientation vector. Default: `ORIENT_Z` (or `[0,0,0]`).
- `align`: Anchor alignment vector. Default: `V_UP` (or `[0,0,1]`).

**Example**:
```openscad
lmXuu_housing(size=10, wall=2, tab=6, screwsize=2.5);
```
