# AutoCAD 2.18 (DOS) DRAW Commands

AutoCAD 2.18, released by Autodesk in mid-1985, was a landmark release in the history of Computer-Aided Design. Operating in an MS-DOS environment, it is most famous for being the first version to introduce full AutoLISP programming capabilities. 

Despite its age, the core geometric commands defined in this era are still the foundation of modern CAD software. Below is a comprehensive list of the primary **DRAW** commands available in AutoCAD 2.18:

## Core Geometric Entities
* **ARC**: Draws an arc using various methods (e.g., 3-point, start-center-end).
* **CIRCLE**: Draws a circle based on specific parameters (center and radius, center and diameter, 2-point, or 3-point).
* **LINE**: The most fundamental command. Draws straight 2D line segments from point to point.
* **PLINE** (Polyline): Introduced in the AutoCAD 2.1x series, this powerful command draws connected sequences of line and arc segments that AutoCAD treats as a single, continuous object. It also allowed for assigning width to the line segments.
* **POINT**: Places a single point entity in the coordinate space (often used as a reference node).
* **POLYGON**: Automatically draws regular, closed polygons (equilateral and equiangular) as a polyline object.
* **SOLID**: Draws solid-filled, 2D planar polygons (specifically triangles and quadrilaterals) by specifying vertices.
* **TRACE**: Draws solid, filled lines of a specified physical width. (This command was largely superseded by the introduction of `PLINE` but remained for legacy compatibility).

## Annotation and Detailing
* **HATCH**: Fills an enclosed boundary or defined area with a specified crosshatching pattern.
* **TEXT**: Draws basic, single-line text annotations. (Note: Multi-line text or `MTEXT` was not introduced until much later).

## Blocks and External Definitions
* **BLOCK**: Groups a selection of objects into a single named definition stored within the drawing's database.
* **INSERT**: Places a previously defined `BLOCK` or an entirely separate drawing file into the current workspace.
* **SHAPE**: Inserts a predefined geometric shape from a compiled shape file (`.SHX`). Shapes were a highly memory-efficient way to place repeated symbols before Blocks became more versatile.

## Specialty Draw Commands
* **SKETCH**: A specialized mode that allows the user to perform freehand sketching. It generates a series of short, connected line segments mimicking the movement of the mouse or digitizer puck.

***

*Note: Because AutoCAD 2.18 operated on hardware with strict memory limits (often on 10MB hard drives or floppy disks), the command list was lean and highly optimized. Advanced 3D modeling commands, splines, ellipses, and dynamic blocks were introduced in later versions over the subsequent decades.*
