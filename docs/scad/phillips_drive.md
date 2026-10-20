# Library File phillips_drive.scad

Phillips driver bits. To use, add these lines to the top of your file:

```openscad
include <BOSL/constants.scad>
use <BOSL/phillips_drive.scad>
```

## Table of Contents

1. [Modules](#1-modules)
   - [phillips_drive()](#phillips_drive)

---

## 1. Modules

### phillips_drive()

**Syntax:**

```openscad
phillips_drive(size, shaft, l)
```

**Description:**

Creates a model of a phillips driver bit of a given named size.

**Arguments:**

| Argument | Description |
|---|---|
| `size` | The named phillips drive size. Typically `#1`, `#2`, or `#3`. |
| `shaft` | The diameter of the shaft. |
| `l` | The length of the driver bit. |

**Example:**

```openscad
xdistribute(10) {
    phillips_drive(size="#1", shaft=4, l=20);
    phillips_drive(size="#2", shaft=6, l=20);
    phillips_drive(size="#3", shaft=6, l=20);
}
```
