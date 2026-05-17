# WebCAD 

A faithful CAD drafting experience, reimagined for the modern web using **TypeScript**, **Three.js**, and **Vite**.

![WebCAD Interface Screenshot](screenshots/modelling.png)

![WebCAD Interface Screenshot](screenshots/scripting.png)


## 🚀 Features

### 🎯 Precision Drafting
- **Geometric Kernel:** Powered by **OpenCascade.js** (OCCT) and optimized for high-performance 2D drafting and 3D modeling operations.
- **Snap Engine:** Real-time, sub-pixel snapping modes (Endpoint, Midpoint, Center, Bulge Center) and adjustable **GRID Snap**.
- **Drafting Aids:**
  - **ORTHO:** Restricts vector paths strictly to horizontal/vertical axes.
  - **GRID:** Scalable visual reference dot grid that pans and updates fluidly with the viewport camera.
  - **SNAP:** Configurable discrete coordinate input spacing intervals.
  - **Coordinate Parser:** Fully supports absolute (`x,y`), relative Cartesian (`@dx,dy`), and relative Polar (`@dist<angle`) formatting.
- **Interactive Previews:** Asynchronous, state-machine based command loops rendering real-time rubber-banding lines, arcs, circles, and curves during editing.

### 💾 File I/O & Interoperability
- **Custom DXF Parser & Writer:** High-fidelity R12/R14 DXF engine for saving and loading complex CAD drawings with layers, hatches, and blocks.
- **Parametric Block Library:** A modular block registration system supporting 2D sketches and 3D solids.
  - **Dynamic Sidebar Folder Browsing:** Browses local block files (`blocks/2D` and `blocks/3D`) with immediate popup thumbnails showing interactive previews of solids and sketches.
  - **Robust File Import:** Imports `.step` files for 3D solids and `.dxf` drawings for 2D blocks seamlessly.
  - **Instant Origin Placement:** Features a dedicated "Place" button to automatically instantiate a block definition directly at origin coordinates `(0, 0, 0)`.
- **Database Persistence:** Secure background storage using IndexedDB with structural integrity checks to prevent data corruption.

### ⌨️ Classic Commands
- **Drafting Suite:** `LINE`, `PLINE` (Polyline with bulge arcs), `ARC` (3-Point), `CIRCLE` (Center/Radius, Center/Diameter), `POLYGON` (Inscribed/Circumscribed), `SPLINE` (Cubic B-Spline), `SOLID`, `TEXT`, `HATCH` (leak-proof Midpoint Clipping with `.pat` pattern support).
- **Modification Tools:** `TRIM`, `EXTEND`, `FILLET` (tangent arc blending), `OFFSET`, `ARRAY` (Rectangular/Polar), `ERASE`, `MOVE`, `COPY`, `ROTATE`, `SCALE`, `MIRROR`, and `STRETCH` (Crossing Window vertex shifting).
- **Workspace Utilities:** `REGEN` (forces full redraw), `UNITS` (Decimal, Architectural, Metric with selectable precision), `NEW` (resets document with confirmation).
- **Dimensioning & Plotting:**
  - `DIMLINEAR`, `DIMALIGNED`, `DIMRADIUS`, `DIMANGULAR` with crisp engineering annotations and text gaps.
  - `PLOT` with high-fidelity vector SVG and PDF exporting (utilizing path-outlining via `opentype.js`).

### 🎮 3D Interaction & Persistence
- **3D Solid Modeling:** Integrated command suite to create primitive solids: `BOX`, `CYLINDER`, `SPHERE`, `CONE`, and `TORUS`.
- **Boolean CSG Operations:** High-level 3D Boolean Union, Subtraction, and Intersection operations powered by OpenCascade.
- **Interactive 3D Gizmo:** High-fidelity widget for precise 3D object translations and rotations.
- **Proportional Scaling:** Gizmo handles dynamically scale based on selected entity bounding box sizes.
- **Physical Save/Load (STEP):** 3D boolean shapes are serialized directly to professional STEP format in the persistent drawing DB.

### 🖱️ Selection & Interaction
- **Advanced Selection Engine:** Precise AABB spatial tree hit-testing supporting individual entity selection, Window/Crossing selection boxes, and intersection matching.
- **Layer-Locked Selection:** Selection mechanisms respect layer visibility, frozen, and locked states.
- **Dynamic Mode Switcher:** Smooth tabbed environment that isolates 3D SCAD scripting viewports from 2D manual drafting, altering interface backdrops (e.g. high-contrast workspace vs deep-space editor).

## 🛠️ Installation & Usage

### Setup
```bash
# Clone the repository
git clone https://github.com/elhakimz/webcad.git
cd webcad

# Install dependencies
npm install
```

### Development
```bash
# Start the dev server (includes local File API)
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.

### Testing
```bash
# Run unit tests (Vitest)
npm test

# Run linting
npm run lint
```

## 🏗️ Architecture

-   **`src/core/engine/handlers/`**: Strategy-based action handlers (Layer, Transform, View, IO, System).
-   **`src/core/engine/`**: Command management, drafting state, math utilities, and snapping logic.
-   **`src/core/io/`**: **DXF Exporter/Importer** and OpenCascade Service for geometric kernels.
-   **`src/core/model/`**: CAD entity definitions and the central `Document` store with centralized ID generation.
-   **`src/ui/`**: DOS-style screens and components (`MainMenuScreen`, `CommandLine`, `StatusBar`).

## 📍 Roadmap Priorities
-   [x] **Plotting:** Added `PLOT` command with support for SVG and high-quality vector PDF export (using text outlining via `opentype.js`).
-   [x] **Engineering Annotation:** Professional `DIMANGULAR` with one-click selection and standardized DXF R12 persistence for all dimension types.
-   [x] **Precision & Data Integrity:**
    -   **Strict Layer Isolation:** Selection engine now respects the current active layer for both commands and direct editing.
    -   **Robust Hatching:** Upgraded clipping algorithm using midpoint validation for leak-proof patterns in complex boundaries.
    -   **Data Consistency:** Fixed DXF persistence for `HATCH` (repeated codes) and `DONUT` (filled state preservation).
- [x] **Advanced Curves:** **SPLINE** command with cubic B-spline drafting, snap support, and DXF R14 persistence.
- [x] **Modification:** **STRETCH** command with crossing-window selection and dynamic vertex displacement.
- [ ] **Snaps:** Intersection and Perpendicular snapping modes.
- [x] **3D Modeling:** Initial primitives (BOX, CYLINDER, SPHERE) and CSG operations via OCCT with robust STEP persistence.

## 📄 License
MIT

---

**Note:** AutoCAD is an Autodesk product. This project is a modern web-based recreation of the classic AutoCAD 2.18 interface for educational and demonstration purposes.

**Disclaimer:** 

This application uses:
- ThreeJS for 3D rendering.
- OpenCascadeJS for 3D modeling.
- open-source icons from LibreCAD.


<p align="center">
Dedicated for SMT Penerbangan / SMK 12 Bandung Students and Allumni .
<br><br>
<img src="screenshots/logosmt.png" width="128" alt="SMT Penerbangan Bandung"> | <img src="screenshots/logosmk.png" width="128" alt="SMKN 12 Bandung">
</p>

