# Library File wiring.scad

Rendering for wiring bundles. To use, include the following line at the top of your file:

```openscad
use <BOSL/wiring.scad>
```

## Table of Contents

1. [Functions](#1-functions)
   - [hex_offset_ring()](#hex_offset_ring)
   - [hex_offsets()](#hex_offsets)
2. [Modules](#2-modules)
   - [wiring()](#wiring)

---

## 1. Functions

### hex_offset_ring()
**Description:** Returns a hexagonal ring of points, with a spacing of `d`. If `lev=0`, returns a single point at `[0,0]`. All greater levels return 6 times `lev` points.
**Arguments:**
- `d` - Base unit diameter to build rings upon.
- `lev` - How many rings to produce.

### hex_offsets()
**Description:** Returns the centerpoints for the optimal hexagonal packing of at least `n` circular items, of diameter `d`. Will return enough points to fill out the last ring, even if that is more than `n` points.
**Arguments:**
- `n` - Number of items to bundle.
- `d` - How far to space each point away from others.

---

## 2. Modules

### wiring()
**Description:** Returns a 3D object representing a bundle of wires that follow a given path, with the corners filleted to a given radius.
**Arguments:**
- `path` - The 3D polyline path that the wire bundle should follow.
- `wires` - The number of wires in the wiring bundle.
- `wirediam` - The diameter of each wire in the bundle.
- `fillet` - The radius that the path corners will be filleted to.
- `wirenum` - The first wire's offset into the color table.
- `bezsteps` - The corner fillets in the path will be converted into this number of segments.

**Example:**
```openscad
wiring([[50,0,-50], [50,50,-50], [0,50,-50], [0,0,-50], [0,0,0]], fillet=10, wires=13);
```
