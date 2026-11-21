# WC-EC-04 Headless Snapshot Renderer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic headless snapshot renderer that renders CAD parts to PNG from fixed views (iso/top/front/right) with fixed camera, lighting, and resolution, producing byte-identical output across runs for golden file diffing.

**Architecture:**
- A minimal HTML "snapshot host" page loads Three.js + Viewer in a headless Chromium (via Playwright, already a dependency)
- The host exposes a global API (`window.__webcadSnapshot`) to load mesh data, set camera views, and capture PNGs
- A `HeadlessRenderer` class (TypeScript) drives Playwright: launches browser, loads host, feeds mesh, captures 4 views, saves PNGs
- A CLI entry point (`scripts/snapshot.ts`) accepts a JSON command script or B-rep file, generates mesh via the existing kernel path, and renders snapshots
- Determinism: fixed viewport size, device scale factor = 1, antialias off, fixed lights, fixed camera positions, no rAF/animation frame jitter

**Tech Stack:** TypeScript, Three.js r185.1, Playwright, Vite, Vitest

---

## Chunk 1: Snapshot host HTML page

**Files:**
- Create: `tests/snapshot/snapshot-host.html`

- [x] **Step 1: Create snapshot-host.html**

A minimal HTML page that:
- Includes a `<canvas id="snapshot-canvas">`
- Loads Three.js from CDN or via Vite (same version as app)
- Imports Viewer class from src
- Creates Viewer with WebGL renderer (antialias off for determinism)
- Adds basic lighting (hemisphere + directional, matching App constructor)
- Exposes `window.__webcadSnapshot` with: `loadMesh(positions, indices, color)`, `setView(viewName)`, `capturePNG()` returning base64, `setSize(w, h)`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>WebCAD Snapshot Host</title>
</head>
<body>
  <canvas id="snapshot-canvas" width="1024" height="1024"></canvas>
  <script type="module">
    import * as THREE from 'three';
    import { Viewer } from '../../src/render/Viewer.ts';
    import { createWebGLRenderer } from '../../src/render/RendererBackend.ts';

    const canvas = document.getElementById('snapshot-canvas');
    const renderer = createWebGLRenderer(canvas);
    renderer.setSize(1024, 1024);
    renderer.setPixelRatio(1);

    const viewer = new Viewer(canvas, { kind: 'webgl', renderer, requested: 'webgl', fellBack: false, reason: 'headless' });

    // Basic lighting (matching App constructor pattern)
    const ambient = new THREE.HemisphereLight(0xffffff, 0x888888, 1.1);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(200, 400, 500);
    dirLight.castShadow = true;
    viewer.scene.add(ambient, dirLight);

    // Global API for Playwright to control
    window.__webcadSnapshot = {
      loadMesh: (positions, indices, colorIndex = 7) => {
        // Build a minimal Solid3D-like object and add to viewer
        const solid = {
          id: 'snapshot',
          positions: new Float32Array(positions),
          indices: indices,
          faceMapping: undefined,
          edgeLines: undefined,
          properties: {},
        };
        viewer.addSolid3D(solid, undefined, colorIndex);
        viewer.renderNow();
      },
      setView: (viewName) => {
        viewer.setCameraView(viewName);
        viewer.renderNow();
      },
      capturePNG: () => {
        viewer.renderNow();
        return canvas.toDataURL('image/png');
      },
      setSize: (w, h) => {
        renderer.setSize(w, h);
        viewer.camera.aspect = w / h;
        viewer.camera.updateProjectionMatrix();
      },
    };
  </script>
</body>
</html>
```

**Test:** `tests/snapshot/snapshot-host.test.ts` - Verify the HTML loads and the global API exists (lightweight, can use jsdom or skip)

---

## Chunk 2: HeadlessRenderer class

**Files:**
- Create: `src/render/HeadlessRenderer.ts`

- [x] **Step 2: Write HeadlessRenderer class**

A TypeScript class that:
- Launches headless Chromium via Playwright (`chromium.launch({ headless: true })`)
- Navigates to `tests/snapshot/snapshot-host.html` served by a local static server or file://
- Calls `page.evaluate` to invoke `window.__webcadSnapshot.loadMesh()`, `setView()`, `capturePNG()`
- Saves PNG buffers to disk
- Supports 4 views: ISOMETRIC, TOP, FRONT, RIGHT
- Fixed 1024x1024 resolution, deviceScaleFactor 1

```typescript
import { chromium, type Browser, type Page } from '@playwright/test';

export interface SnapshotOptions {
  width?: number;
  height?: number;
  views?: ('iso' | 'top' | 'front' | 'right')[];
  outputDir?: string;
}

export interface SnapshotResult {
  view: string;
  pngBase64: string;
  path: string;
}

export class HeadlessRenderer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(private options: SnapshotOptions = {}) {}

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      viewport: { width: this.options.width ?? 1024, height: this.options.height ?? 1024 },
      deviceScaleFactor: 1,
    });
    this.page = await context.newPage();
    await this.page.goto('file://' + require('path').resolve('tests/snapshot/snapshot-host.html'));
    await this.page.waitForFunction(() => !!(window as any).__webcadSnapshot);
  }

  async renderMesh(
    positions: number[],
    indices: number[],
    colorIndex: number,
  ): Promise<SnapshotResult[]> {
    if (!this.page) throw new Error('HeadlessRenderer not initialized');

    await this.page.evaluate(({ positions, indices, colorIndex }) => {
      (window as any).__webcadSnapshot.loadMesh(positions, indices, colorIndex);
    }, { positions, indices, colorIndex });

    const views = this.options.views ?? ['iso', 'top', 'front', 'right'];
    const viewMap: Record<string, string> = {
      iso: 'ISOMETRIC',
      top: 'TOP',
      front: 'FRONT',
      right: 'RIGHT',
    };

    const results: SnapshotResult[] = [];
    for (const view of views) {
      await this.page.evaluate((viewName) => {
        (window as any).__webcadSnapshot.setView(viewName);
      }, viewMap[view]);

      const base64 = await this.page.evaluate(() => {
        const url = (window as any).__webcadSnapshot.capturePNG();
        return url.split(',')[1]; // strip data:image/png;base64, prefix
      });

      results.push({ view, pngBase64: base64, path: '' }); // path set by CLI
    }
    return results;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
```

**Test:** `tests/snapshot/headless-renderer.test.ts` - Unit test that initializes renderer, renders a simple box mesh, verifies 4 PNGs are produced and are non-empty

---

## Chunk 3: Snapshot CLI entry point

**Files:**
- Create: `scripts/snapshot.ts`

- [x] **Step 3: Write snapshot CLI**

A command-line script that:
- Accepts `--script <file.json>` (command script JSON) or `--brep <file>` (B-rep binary)
- For scripts: parses steps, generates mesh via a simple built-in primitive generator (box, cylinder, etc.) — start with box only
- For B-rep: placeholder — reads file, reports "B-rep input not yet implemented" (defer to WC-EC-24)
- Renders 4 views using HeadlessRenderer
- Saves PNGs to `--output-dir` (default: `tests/snapshot/golden/`)
- Exits 0 on success, non-zero on failure

```typescript
#!/usr/bin/env node
import { HeadlessRenderer } from '../src/render/HeadlessRenderer';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

async function main() {
  const args = process.argv.slice(2);
  let scriptPath: string | undefined;
  let brepPath: string | undefined;
  let outputDir = join(process.cwd(), 'tests/snapshot/golden');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--script') scriptPath = args[++i];
    else if (args[i] === '--brep') brepPath = args[++i];
    else if (args[i] === '--output-dir') outputDir = args[++i];
  }

  if (!scriptPath && !brepPath) {
    console.error('Usage: snapshot --script <file.json> [--output-dir <dir>]');
    process.exit(1);
  }

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const renderer = new HeadlessRenderer({ outputDir });
  await renderer.init();

  try {
    let positions: number[] = [];
    let indices: number[] = [];

    if (scriptPath) {
      const script = JSON.parse(readFileSync(scriptPath, 'utf-8'));
      // Simple box primitive: BOx step with min/max corners
      const boxStep = script.steps.find((s: any) => s.name === 'BOX');
      if (boxStep) {
        const p = boxSet.parameters;
        // Generate box mesh from min/max corners
        // ... (box mesh generation)
      }
    }

    const results = await renderer.renderMesh(positions, indices, 7);
    for (const r of results) {
      const buf = Buffer.from(r.pngBase64, 'base64');
      const path = join(outputDir, `${r.view}.png`);
      writeFileSync(path, buf);
      console.log(`Wrote ${path} (${buf.length} bytes)`);
    }
  } finally {
    await renderer.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Test:** Run `npx tsx scripts/snapshot.ts --script tests/snapshot/fixtures/box-script.json` and verify PNGs are created

---

## Chunk 4: Determinism verification + golden file test

**Files:**
- Create: `tests/snapshot/fixtures/box-script.json` - Test script fixture (box primitive)
- Create: `tests/snapshot/determinism.test.ts` - Test that same input produces byte-identical PNGs

- [x] **Step 4: Write determinism test**

```typescript
import { test, expect } from 'vitest';
import { HeadlessRenderer } from '../../src/render/HeadlessRenderer';
import { readFileSync } from 'fs';

test('same mesh produces byte-identical PNGs across runs', async () => {
  const renderer = new HeadlessRenderer();
  await renderer.init();

  try {
    // Simple box mesh: 8 vertices, 12 triangles (36 indices)
    const positions = [
      -50, -50, -50,  50, -50, -50,  50,  50, -50, -50,  50, -50,
      -50, -50,  50,  50, -50,  50,  50,  50,  50, -50,  50,  50,
    ];
    const indices = [
      0,1,2, 0,2,3,   // bottom
      4,5,6, 4,6,7,   // top
      0,1,5, 0,5,4,   // front
      1,2,6, 1,6,5,   // right
      2,3,7, 2,7,6,   // back
      3,0,4, 3,4,7,   // left
    ];

    const run1 = await renderer.renderMesh(positions, indices, 7);
    const run2 = await renderer.renderMesh(positions, indices, 7);

    for (let i = 0; i < run1.length; i++) {
      expect(run1[i].pngBase64).toBe(run2[i].pngBase64);
    }
  } finally {
    await renderer.cleanup();
  }
});
```

---

## Chunk 5: Wire into package.json + PR template

**Files:**
- Modify: `package.json` - Add `snapshot` script
- Modify: `.github/pull_request_template.md` - Add snapshot image attachment section (if exists)

- [x] **Step 5: Add snapshot script to package.json**

```json
"snapshot": "tsx scripts/snapshot.ts"
```

- [x] **Step 6: Update PR template** - Add section for attaching snapshot images for failed cases

---

## Verification

Run `npm run verify` which includes:
- `npm run typecheck` - TypeScript type checking
- `npm run lint` - ESLint
- `npm test` - Vitest unit tests
- `npm run buf:lint` - Protobuf linting
- `npm run buf:breaking` - Protobuf breaking changes

Plus manually:
- `npx tsx scripts/snapshot.ts --script tests/snapshot/fixtures/box-script.json --output-dir /tmp/test-snapshots` - Verify CLI works
- Verify PNGs are byte-identical across two runs

---

## Acceptance Criteria Mapping

| Criterion | Check |
|-----------|-------|
| Same input produces byte-identical PNGs across runs | `tests/snapshot/determinism.test.ts` |
| Agent can render and inspect a part from CLI | `scripts/snapshot.ts` + manual run |
| Deterministic output for golden file diffing | Fixed viewport, DPR=1, antialias off, fixed lights/camera |
| Wire into PR template | `.github/pull_request_template.md` update |
