# BOSL shapes.scad Library Documentation

Useful geometric shapes and 3D printing structures from the Belfry OpenScad Library (BOSL).

To include these modules in your SCAD script:
```openscad
include <BOSL/constants.scad>
use <BOSL/shapes.scad>
```

---

## 1. 3D Printing Geometries

### teardrop()
Creates a 3D teardrop shape, useful for horizontal holes in 3D prints to avoid printing overhangs.
* **Usage**: `teardrop(r|d, l, [ang], [cap_h], [orient], [align|center])`
* **Parameters**:
  - `r` / `d`: Radius or diameter of the circular part.
  - `l`: Length of the cylinder.
  - `ang`: Angle of the peak. Defaults to `45`.
  - `cap_h`: Cap height.
  - `orient`: Orientation of the shape.
  - `align`: Vector alignment.

---

### onion()
Creates an "onion dome" shape, often used for horizontal pins or caps to eliminate support structures.
* **Usage**: `onion(r|d, [ang], [orient], [align|center])`
* **Parameters**:
  - `r` / `d`: Base radius or diameter.
  - `ang`: Taper peak angle. Default: `45`.

---

### narrowing_strut()
Creates a strut that narrows towards one end, designed to support cantilevered spans cleanly.
* **Usage**: `narrowing_strut(w, l, h, [thick], [orient], [align|center])`

---

### thinning_wall()
Creates a vertical wall that tapers or thins as it rises, reducing material and print time for structural enclosures.
* **Usage**: `thinning_wall(h, l, thick, [thin], [orient], [align|center])`
* **Parameters**:
  - `h`: Height of the wall.
  - `l`: Length of the wall.
  - `thick`: Bottom/base thickness.
  - `thin`: Top thickness. Default: `1.5`.

---

### braced_thinning_wall()
Creates a thinning wall with integrated triangular braces on the sides.
* **Usage**: `braced_thinning_wall(h, l, thick, [thin], [brace], [gaps], [orient], [align|center])`
* **Parameters**:
  - `h`: Height of the wall.
  - `l`: Length of the wall.
  - `thick`: Bottom base thickness.
  - `brace`: Width/projection of braces. Defaults to `thick * 2`.
  - `gaps`: Center-to-center spacing of the structural braces.

---

### thinning_triangle()
Creates a flat triangle shape designed to act as a gusset, bracket, or rib with customized edge bevels.
* **Usage**: `thinning_triangle(h, l, thick, [thin], [orient], [align|center])`
* **Parameters**:
  - `h`: Height of the triangle.
  - `l`: Base length of the triangle.
  - `thick`: Bottom/base thickness.

---

### sparse_strut()
Creates a structural 2D truss/strut with internal triangular webbing, ideal for lightweight skeletal frames.
* **Usage**: `sparse_strut(w, l, thick, [max_stiff], [orient], [align|center])`

---

### sparse_strut3d()
Creates a 3D structural truss with multi-axis internal cross-webbing to support high torsion and bending.
* **Usage**: `sparse_strut3d(w, l, h, [thick], [max_stiff], [orient], [align|center])`

---

### corrugated_wall()
Creates a corrugated (wavy) wall to increase structural stiffness while keeping wall thickness minimal.
* **Usage**: `corrugated_wall(h, l, thick, [amplitude], [pitch], [orient], [align|center])`

---

## 2. Basic Geometric Primitives

### cuboid()
Creates a standard cube or cuboid with optional edge/corner rounding (filleting) or chamfering.
* **Usage**: `cuboid(size, [chamfer], [fillet], [edges], [trimcorners], [align|center])`
* **Example**:
  ```openscad
  cuboid([30, 40, 50], fillet=10);
  ```

### prismoid()
Creates a prismoid shape (a prism or a truncated pyramid) by specifying distinct top and bottom sizes.
* **Usage**: `prismoid(size1, size2, h, [shift], [orient], [align|center])`
* **Example**:
  ```openscad
  prismoid(size1=[45, 45], size2=[15, 15], h=30);
  ```

### rounded_prismoid()
Creates a prismoid shape with rounded vertical edges.
* **Usage**: `rounded_prismoid(size1, size2, h, r|r1|r2, [shift], [orient], [align|center])`

### cyl()
Creates a generalized cylinder, supporting distinct top and bottom radii, chamfers, or fillets.
* **Usage**: `cyl(l, r|d, [r1|d1], [r2|d2], [chamfer], [fillet], [orient], [align])`
