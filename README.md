# WebCAD - AutoCAD 2.18 Web Clone

A faithful replica of the classic AutoCAD 2.18 (DOS era) drafting experience, reimagined for the modern web using **TypeScript**, **Three.js**, and **Vite**.

![WebCAD Interface Screenshot](uidesign/Autocad%202.18%20-%20Columbia_example.png)

## 🚀 Features

### 🎯 Precision Drafting
-   **Geometric Kernel:** Integrated **OpenCascade.js** (OCCT) for professional-grade 2D/3D operations and file processing.
-   **Snap Engine:** Real-time geometric snapping (Endpoint, Midpoint, Center) and **GRID Snap**.
-   **Drafting Aids:**
    -   **ORTHO:** Lock movement to strictly horizontal/vertical axes.
    -   **GRID:** Visual reference dot grid that pans and scales with the viewport.
    -   **SNAP:** Discrete coordinate input intervals (configured via `SNAP` command).
    -   **Active Point Marker:** Dynamic cyan 'X' marker at cursor and reference points during point specification.
-   **Command Engine:** Fully asynchronous state-machine based command system.
-   **Coordinate Parser:** Supports absolute (`x,y`), relative Cartesian (`@dx,dy`), and relative Polar (`@dist<angle`) inputs.
-   **Visual Feedback:** Real-time "rubber-banding" previews, formatting echoing, and helper markers.

### 💾 File I/O & Interoperability
-   **DXF I/O Layer:** **Custom R12/R14 ASCII Writer & Parser** for industry-standard interoperability.
-   **SAVE:** Save drawings directly to the local project `./files` directory (via integrated Vite File API).
-   **LOAD:** Load existing DXF files from the `./files` directory with full layer and entity reconstruction.
-   **Main Menu Integration:** Integrated "Edit an EXISTING drawing" workflow with dynamic file listing and selection.

### ⌨️ Classic Commands
-   **LINE:** Continuous drawing with `Undo` (U), `Close` (C), and `Exit` (E/Enter) shortcuts.
-   **PLINE:** Connected sequences of line and arc segments with interactive mode switching and bulges.
-   **ARC:** 3-Point arc implementation (Start, Second Point, End).
-   **CIRCLE:** Center/Radius and Center/Diameter methods (toggle via `D`/`R` keys).
-   **POLYGON:** Regular polygons via Center/Radius or Edge methods with real-time radius/angle feedback.
-   **SOLID:** Solid-filled 2D planar triangles and quadrilaterals with chaining.
-   **TRACE:** Solid filled lines of specified width.
-   **POINT:** Single point entities.
-   **TEXT:** Single-line annotations with configurable height and rotation (using `osifont` ISO 3098).
-   **HATCH:** Pattern fill with full .PAT file support (ANSI31, ANSI32, etc.) and DXF persistence.
-   **LAYER:** Professional layer management (New, Set, On/Off, Freeze/Thaw, Lock/Unlock, Color, Linetype).
-   **LINETYPE (LTYPE):** Global and per-layer linetype definitions.
-   **REGEN:** Global viewport regeneration to synchronize display properties.
-   **ERASE / MOVE / COPY / ROTATE / SCALE / MIRROR:** Full suite of precise modification tools.
-   **ZOOM:** `Zoom Window`, `Zoom All`, and factor-based zooming.

### 🖥️ Authentic DOS UI
-   **Main Menu:** Classic text-based startup screen with project management options.
-   **Hierarchical Side Menu:** Fully interactive menu navigation (e.g., `DRAW` -> `LINE:`).
-   **Command Area:** Multi-line status log with persistent command prompt and cleaned interaction echoes.
-   **Status Bar:** Real-time world coordinate tracking, layer info, and clickable mode tags (**[SNAP]**, **[GRID]**, **[ORTHO]**).

### 🖱️ Selection & Interaction
-   **Selection Engine:** Advanced AABB-based hit-testing and precise geometry selection.
-   **Box Selection:** Window/Crossing modes with dashed visual indicators.
-   **Pan & Zoom:** Intuitive middle-click pan and cursor-centered scroll zoom.

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
-   [ ] **Trimming:** TRIM and EXTEND commands using OpenCascade intersection.
-   [ ] **Modification:** OFFSET and ARRAY commands.
-   [ ] **Blocks:** Block definition and insertion system.
-   [ ] **3D Modeling:** EXTRUDE and REVOLVE using OCCT.

## 📄 License
MIT

---

**Note:** AutoCAD is an Autodesk product. This project is a modern web-based recreation of the classic AutoCAD 2.18 interface for educational and demonstration purposes.
