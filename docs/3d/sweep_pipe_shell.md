# Pipe Shell Sweep in OpenCascade

This documentation is based on the Draw Test Harness commands for `BRepOffsetAPI_MakePipeShell`. It explains how to handle discontinuities and control the profile orientation (trihedron) during a sweep.

## Draw Commands

- `mksweep spine_wire` : Initializes the sweep with a spine.
- `addsweep profile_wire` : Adds a profile to the sweep.
- `deletesweep` : Deletes the sweep.
- `setsweep options` : Configures the sweep options (trihedron, etc.).
- `buildsweep result [options]` : Builds the result shape.

## Trihedron Options (`setsweep`)

- `-FR` : Tangent and Normal are given by Frenet trihedron.
- `-CF` : Tangent is given by Frenet, the Normal is computed to minimize torsion.
- `-DT` : Discrete trihedron.
- `-DX Surf` : Tangent and Normal are given by Darboux trihedron (Surf must be a shell or face).
- `-CN dx dy dz` : BiNormal is given by the specified vector.
- `-FX Tx Ty Tz [Nx Ny Nz]` : Tangent and Normal are fixed.
- `-G guide 0|1 0|1|2` : Uses a guide curve.

### Examples

#### Fixed Normal (`-FX`)
```tcl
mksweep p
addsweep w
setsweep -FX 1 0 0
buildsweep r -C
```
The normal direction of the profile is always in the X axis direction.

#### Frenet (`-FR`)
```tcl
mksweep p
addsweep w
setsweep -FR
buildsweep r -C
```
The normal of the profile is always parallel to the path (consistent with the tangent).

## Discontinuity Options (`buildsweep`)

Specifies how to handle sharp corners in the spine:

- `-M` : Discontinuities are treated by Modification of the sweeping mode (Default).
- `-C` : Discontinuities are treated like Right Corner (Treatment is Extent & Intersect). This creates sharp mitered corners.
- `-R` : Discontinuities are treated like Round Corner (Treatment is Intersect and Fill). This creates rounded corners.
- `-S` : To build a Solid.

### Example for Sharp Corners (`-C`)
```tcl
mksweep p
addsweep w
buildsweep r -C
```
This handles the discontinuous places in the path by extending and intersecting, creating a clean mitered joint without "leak holes".

### Example for Round Corners (`-R`)
```tcl
mksweep p
addsweep w
buildsweep r -R
```
This handles the discontinuous places in the path by intersecting and padding, creating rounded corners.

## Conclusion

OpenCASCADE provides specialized algorithms for sweeping:
- `BRepPrimAPI_MakePrism` : For linear extrusion (Prism).
- `BRepPrimAPI_MakeRevol` : For revolution (Revol).
- `BRepOffsetAPI_MakePipeShell` : For general sweeping along a spine.

When using `BRepOffsetAPI_MakePipeShell`, it is critical to pay attention to:
1. The labeling (trihedron) of the profile on the path.
2. The discontinuity of the path curve (using `-C` or `-R` to handle corners).
