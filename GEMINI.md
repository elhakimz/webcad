# WebCAD Scaffold - Instructional Context


Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes. **

** currently you are working in windows 11 powershell **



This project is a minimal AutoCAD 2.18-style web CAD prototype built with **TypeScript**, **Three.js**, and **Vite**. It aims to replicate the core experience of classic CAD software in a modern web environment.

## 🚀 Project Overview

The architecture is divided into four main systems as outlined in the [Engineering Roadmap](tech_docs/base/PRD.md):
1.  **Command Engine:** Handles lexing, parsing, and command state management.
2.  **CAD Core Model (Entity System):** Manages drawing data (Entities like Lines, Circles, etc.).
3.  **Rendering Engine:** A Three.js-based viewport for displaying geometry.
4.  **DXF I/O Layer (Planned):** For compatibility with industry-standard file formats.

## 🛠 Building and Running

Commands are managed via `npm` scripts defined in `package.json`:

-   **Development:** `npm run dev` (Starts the Vite development server)
-   **Build:** `npm run build` (Builds the project for production)
-   **Linting:** `npm run lint` (Runs ESLint)
-   **Lint Fix:** `npm run lint:fix` (Runs ESLint with automatic fixes)

## 📂 Directory Structure

-   `src/`: Main source directory.
    -   `core/`: Internal logic.
        -   `commands/`: Command implementations (e.g., `LineCommand.ts`). Each command follows a state machine pattern.
        -   `engine/`: Core logic like `CommandManager.ts` which routes inputs and executes commands.
        -   `model/`: Entity definitions (`Entity.ts`, `Line.ts`).
    -   `ui/`: UI components for the DOS-style interface.
        -   `CommandLine.ts`: Manages the bottom interaction area and command history.
        -   `StatusBar.ts`: Displays layer info and real-time coordinates.
        -   `Menu.ts`: Implements the hierarchical side menu.
    -   `render/`: Rendering logic (`Viewer.ts` as a Three.js wrapper).
    -   `app.ts`: Application orchestrator connecting UI, commands, and rendering.
    -   `main.ts`: Entry point for DOM events and initialization.
-   `tech_docs/`: Documentation, including the `PRD.md` roadmap.

## ⌨️ Development Conventions

### Command Implementation
Every command should be implemented as a state machine. Refer to `src/core/commands/LineCommand.ts` as a template:
-   `start()`: Initialize the command.
-   `onPoint(x, y)`: Handle coordinate input.
-   `onInput(text)`: Handle textual input (if applicable).
-   `cancel()` / `finish()`: Cleanup or finalize the command.

### Entity System
All drawing objects must extend the `Entity` base class found in `src/core/model/Entity.ts`.

### Rendering
Geometry updates should be handled through the `Viewer` class in `src/render/Viewer.ts`. Ensure `viewer.render()` is called after making changes to the scene.

### Coding Style
-   Use **TypeScript** strictly.
-   Follow **ESLint** rules (see `eslint.config.js`).
-   Keep UI logic (DOM interactions) in `main.ts` or a dedicated `ui/` folder, separating it from the core CAD logic in `src/core/`.

## 📍 Roadmap Priorities
- [ ] **3D Modeling:** Initial primitives and CSG operations.
- [ ] **Professional Polish:** Layouts, viewports, and plot configuration.
- [x] **Precision:** GRID snap and ORTHO mode toggles.
- [x] **Manipulation:** `COPY`, `ROTATE`, `SCALE`, `MIRROR`, `TRIM`, `EXTEND`, `OFFSET`, `ARRAY`.
- [x] **Selection:** Window and Crossing selection systems.
- [x] **Precision:** Snap engine (Endpoint, Midpoint, Center).
- [x] **I/O:** DXF import and export layers.
- [x] **Blocks:** `BLOCK` and `INSERT` commands.
