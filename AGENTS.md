# AGENTS.md - WebCAD Developer Guide

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on http://localhost:5173 |
| `npm run build` | Production build |
| `npm run lint` / `npm run lint:fix` | ESLint check/fix |
| `npm test` | Run Vitest unit tests |
| `npm run test:ui` | Run Playwright E2E tests (run `npx playwright install chromium` first) |

## Build Configuration

- **Vite config**: Uses `vite-plugin-top-level-await` and `vite-plugin-wasm` for OpenCascade.js WASM support
- **WASM assets**: Files in `**/*.wasm` are treated as assets

## Architecture

```
src/
├── core/
│   ├── commands/   # Command state machines (Line, Circle, Arc, etc.)
│   ├── engine/     # Input routing, math utilities, CoordinateParser, SelectionEngine
│   ├── io/         # OpenCascadeService (CAD kernel)
│   └── model/      # CAD entity definitions, Document store
├── ui/             # DOS-style components (MainMenuScreen, Menu, CommandLine, StatusBar)
├── render/         # Three.js viewport (Viewer.ts)
└── main.ts, app.ts # Entry points
```

## Key Patterns

- Commands use state-machine pattern with `execute()` and `cleanup()` methods
- Coordinate parser supports absolute (`x,y`), relative Cartesian (`@dx,dy`), and relative polar (`@dist<angle`)
- Three.js rendering via `Viewer.ts` - handles scene, camera, lighting, and drafting aids