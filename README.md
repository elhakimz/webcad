# WebCAD - AutoCAD 2.18 Web Clone

A faithful replica of the classic AutoCAD 2.18 (DOS era) drafting experience, reimagined for the modern web using **TypeScript**, **Three.js**, and **Vite**.

![WebCAD Interface Screenshot](uidesign/Autocad%202.18%20-%20Columbia_example.png)

## 🚀 Features

### 📐 Precision Drafting
-   **Command Engine:** Robust state-machine based command system.
-   **Coordinate Parser:** Supports absolute (`x,y`), relative Cartesian (`@dx,dy`), and relative Polar (`@dist<angle`) inputs.
-   **Visual Cues:** Crosshair cursor and real-time "rubber-banding" previews during object creation.

### ⌨️ Classic Commands
-   **LINE:** Continuous segment drawing with support for `Undo` (U) and `Close` (C) directly via keyboard shortcuts or command line.
-   **CIRCLE:** Define by center and radius (via click or typed distance).
-   **ERASE:** Interactive object selection and removal using Three.js raycasting.
-   **MOVE:** Translate entities via base point and displacement.
-   **ZOOM:** Integrated viewport controls including `Zoom Window` and `Zoom All/Extents`.

### 🖥️ Authentic DOS UI
-   **Hierarchical Side Menu:** Fully interactive menu navigation (e.g., `DRAW` -> `LINE:`).
-   **Command Area:** Multi-line status log and persistent command prompt.
-   **Status Bar:** Real-time world coordinate tracking and active layer display.
-   **Retro Aesthetics:** Monospace typography and classic color palettes.

### 🖱️ Viewport Controls
-   **Pan:** Middle-click and drag.
-   **Zoom:** Mouse wheel (centered on cursor).
-   **Dynamic Mapping:** Automatic screen-to-world coordinate conversion for pixel-perfect accuracy at any zoom level.

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

-   **`src/core/commands/`**: Command state machines (Line, Circle, Move, etc.).
-   **`src/core/engine/`**: Input routing, coordinate parsing, and command management.
-   **`src/core/model/`**: CAD entity definitions and the central `Document` store.
-   **`src/ui/`**: DOS-style UI components (`Menu`, `CommandLine`, `StatusBar`).
-   **`src/render/`**: Three.js viewport wrapper (`Viewer.ts`) managing scene, camera, and interaction.

## 📍 Roadmap Priorities
-   [ ] **Manipulation:** Implement `COPY`, `ROTATE`, and `SCALE`.
-   [ ] **Selection:** Window and Crossing selection systems.
-   [ ] **Precision:** Snap engine (Endpoint, Midpoint, Grid).
-   [ ] **I/O:** DXF import and export layers.

## 📄 License
MIT
