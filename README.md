# WebCAD - AutoCAD 2.18 Web Clone

A faithful replica of the classic AutoCAD 2.18 (DOS era) drafting experience, reimagined for the modern web using **TypeScript**, **Three.js**, and **Vite**.

![WebCAD Interface Screenshot](uidesign/Autocad%202.18%20-%20Columbia_example.png)

## 🚀 Features

### 📐 Precision Drafting
-   **Geometric Kernel:** Integrated **OpenCascade.js** (OCCT) for professional-grade 2D/3D operations and file processing.
-   **Command Engine:** Robust state-machine based command system.
-   **Coordinate Parser:** Supports absolute (`x,y`), relative Cartesian (`@dx,dy`), and relative Polar (`@dist<angle`) inputs.
-   **Visual Feedback:**
    -   Crosshair cursor and real-time "rubber-banding" previews.
    -   Temporary **Visual Axes** (drafting aids) for precise alignment.
    -   Formatted input echoing (e.g., `P1[X:10.00, Y:20.00, Z:0.00]`, `[R:50.00]`).

### ⌨️ Classic Commands
-   **LINE:** Continuous drawing with `Undo` (U), `Close` (C), and `Exit` (E/Enter) shortcuts.
-   **PLINE:** Connected sequences of line and arc segments with interactive mode switching.
-   **ARC:** 3-Point arc implementation (Start, Second Point, End).
-   **CIRCLE:** Center/Radius and Center/Diameter methods (toggle via `D`/`R` keys).
-   **POLYGON:** Regular polygons via Center/Radius or Edge methods.
-   **SOLID:** Solid-filled 2D planar triangles and quadrilaterals with chaining.
-   **POINT:** Single point entities.
-   **TEXT:** Single-line annotations with configurable height and rotation.
-   **ERASE:** Interactive object selection and removal.
-   **MOVE / COPY:** Precise translation or duplication via base point and displacement.
-   **ROTATE / SCALE:** Geometric transformations around a base point.
-   **MIRROR:** Reflect objects across a mirror line (with option to delete originals).
-   **ZOOM:** `Zoom Window` and `Zoom All/Extents` (automatic fit).

### 🖥️ Authentic DOS UI
-   **Main Menu:** Classic text-based startup screen (Begin NEW drawing, Exit, etc.).
-   **Hierarchical Side Menu:** Fully interactive menu navigation (e.g., `DRAW` -> `LINE:`).
-   **Command Area:** Multi-line status log with persistent command prompt.
-   **Status Bar:** Real-time world coordinate tracking and active layer display.

### 🖱️ Selection & Interaction
-   **Selection Engine:** Advanced AABB-based hit-testing and precise geometry selection.
-   **Single Selection:** Click to select/deselect entities (highlighted in yellow).
-   **Box Selection:** Drag to select multiple entities (Window/Crossing modes, dashed yellow box).
-   **Dynamic Previews:** Real-time geometric previews for all draw and edit commands.
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
# Start the dev server
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.

### Testing
```bash
# Run unit tests (Vitest)
npm test

# Run E2E UI tests (Playwright)
npx playwright install chromium
npm run test:ui
```

## 🏗️ Architecture

-   **`src/core/commands/`**: Command state machines (Line, Circle, Arc, etc.).
-   **`src/core/engine/`**: Input routing, math utilities, and coordinate parsing.
-   **`src/core/io/`**: **OpenCascade Service** for CAD kernel operations.
-   **`src/core/model/`**: CAD entity definitions and the central `Document` store.
-   **`src/ui/`**: DOS-style screens and components (`MainMenuScreen`, `Menu`, `CommandLine`).
-   **`src/render/`**: Three.js viewport managing scene, camera, lighting, and drafting aids.

## 📍 Roadmap Priorities
-   [ ] **Modeling:** Implement **TRACE** (wide lines) and **HATCH** (pattern filling).
-   [ ] **Precision:** Snap engine (Endpoint, Midpoint, Center).
-   [ ] **Blocks:** Block definition and insertion system.
-   [ ] **I/O:** DXF import and export layers using OCCT.

## 📄 License
MIT
