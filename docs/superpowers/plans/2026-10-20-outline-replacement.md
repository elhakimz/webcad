# Replacing OutlineEffect with Fat Edge Lines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WebGL-only `OutlineEffect` with a backend-neutral fat-line edge layer so every pickable solid edge stays visible with weight, unblocking the WebGPU backend (WEBCAD-169).

**Architecture:** A pure builder turns `Solid3D.edgeLines` polylines into `LineSegmentsGeometry` segment pairs plus per-edge ranges; a factory in `src/render/EdgeLayer.ts` builds one `LineSegments2` per solid with the backend-appropriate material; `Viewer` adds that layer to the solid's group, highlights the selected edge by writing the shared colour buffer, and keeps the existing thin `THREE.Line` objects as the only raycast targets. `OutlineEffect` is then deleted.

**Tech Stack:** TypeScript 5, three r185.1 (`LineSegments2`, `LineSegmentsGeometry`, `LineMaterial`, `Line2NodeMaterial`), Vitest 4, Playwright 1.59.

**Spec:** `docs/superpowers/specs/2026-10-20-outline-replacement-design.md`

## Global Constraints

- Target three `0.185.1`; do not add dependencies.
- The shipped backend stays WebGL. The WebGPU branch is a registered provider, wired in WEBCAD-169; importing `three/webgpu` from `EdgeLayer.ts` is a defect (it would ship the node renderer to every WebGL user).
- Edge width is `2` screen-space pixels; edges are black `#000000`; the selected edge is `#ffa500` (`[1, 165 / 255, 0]`).
- The thin per-edge `THREE.Line` objects stay the only raycast targets. The fat layer is display-only and sets `raycast = () => {}`.
- `LineSegments2 extends Mesh`, so every generic `instanceof THREE.Mesh` traversal must exclude `userData.type === 'EdgeOutline'`.
- WebGPU cannot run in headless CI (no adapter). WebGPU parity is a manual local run with `?renderer=webgpu`; visual tests are opt-in via `WEBCAD_VISUAL=1`.
- Shell is Windows PowerShell: use `;`, not `&&`.
- Do not commit `files/TEST.dxf`, `test-results/`, `.wolf/`, `.claude/`, `CLAUDE.md`, or `plane-secret-key.csv`. Never print the Plane key.
- Every task ends with `npm run typecheck` and `npm test` green.

## Review Focus

Five failure modes this design implies but its happy-path tests would not catch:

1. **Shading mode round-trip** — `setShadingMode()` swaps `getMeshMaterial()` into every untagged `Mesh`. Expected: edges look identical after `SHADED → PHONG → SHADED`, never white surfaces. Pinned in Task 3.
2. **Delete then re-create** — a disposed `LineSegmentsGeometry` reused on the next solid renders nothing or warns. Expected: a new box after deleting the first has 12 segments and a live material. Pinned in Task 4.
3. **Resize** — `LineMaterial` keeps the boot resolution forever if nothing updates it. Expected: after a viewport change, edge width is unchanged and `resolution` tracks the canvas. Pinned in Task 3.
4. **Curved edge selection** — a BRep edge is a polyline, not a chord. Expected: selecting it paints the whole polyline orange, not its first segment. Pinned in Task 1 (colour range) and Task 4 (selection reaches the layer).
5. **Degenerate edges** — imported B-reps can carry a 1-point edge. Expected: it contributes no segments, no crash, and the following edge keeps its original index. Pinned in Task 1.

---

### Task 1: Edge segment and colour builders

**Files:**
- Create: `src/render/EdgeGeometry.ts`
- Test: `src/render/EdgeGeometry.test.ts`

**Interfaces:**
- Consumes: nothing. This module must not import three.js.
- Produces: `EdgeSegments`, `EdgeRange`, `buildEdgeSegments(edgeLines, center?)`, `buildEdgeColors(segments, selectedEdgeIndex, out?)`, `SELECTED_EDGE_COLOR`.

- [ ] **Step 1: Write the failing tests**

Create `src/render/EdgeGeometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildEdgeColors, buildEdgeSegments, SELECTED_EDGE_COLOR } from './EdgeGeometry';

const square = [
  [0, 0, 0, 10, 0, 0],      // edge 0: one segment
  [10, 0, 0, 10, 10, 0],    // edge 1: one segment
];

describe('buildEdgeSegments', () => {
  it('expands a polyline into contiguous segments and records its range', () => {
    const result = buildEdgeSegments([[0, 0, 0, 5, 0, 0, 10, 0, 0]]);

    expect(result.segmentCount).toBe(2);
    expect(result.positions).toEqual([0, 0, 0, 5, 0, 0, 5, 0, 0, 10, 0, 0]);
    expect(result.edgeRanges).toEqual([{ edgeIndex: 0, start: 0, count: 2 }]);
  });

  it('skips a degenerate edge and keeps the original index for the next one', () => {
    const result = buildEdgeSegments([
      [0, 0, 0],                       // edge 0: one point, skipped
      [1, 0, 0, 2, 0, 0],              // edge 1
    ]);

    expect(result.segmentCount).toBe(1);
    expect(result.edgeRanges).toEqual([{ edgeIndex: 1, start: 0, count: 1 }]);
  });

  it('subtracts the solid centre so the layer can live in a centred group', () => {
    const result = buildEdgeSegments([[0, 0, 0, 20, 0, 0]], { x: 10, y: 0, z: 0 });

    expect(result.positions).toEqual([-10, 0, 0, 10, 0, 0]);
  });

  it('returns an empty result for undefined or empty edge lists', () => {
    expect(buildEdgeSegments([])).toEqual({ positions: [], edgeRanges: [], segmentCount: 0 });
  });
});

describe('buildEdgeColors', () => {
  it('paints every segment black when nothing is selected', () => {
    const segments = buildEdgeSegments(square);
    const colors = buildEdgeColors(segments, null);

    expect(colors).toHaveLength(segments.segmentCount * 6);
    expect(Array.from(colors).every((v) => v === 0)).toBe(true);
  });

  it('paints exactly the selected edge orange, endpoints included', () => {
    const segments = buildEdgeSegments(square);
    const colors = buildEdgeColors(segments, 1);

    // Segment 0 (edge 0) black.
    expect(Array.from(colors.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
    // Segment 1 (edge 1) orange at both ends.
    const [r, g, b] = SELECTED_EDGE_COLOR;
    expect(colors[6]).toBeCloseTo(r, 6);
    expect(colors[7]).toBeCloseTo(g, 6);
    expect(colors[8]).toBeCloseTo(b, 6);
    expect(colors[9]).toBeCloseTo(r, 6);
    expect(colors[10]).toBeCloseTo(g, 6);
    expect(colors[11]).toBeCloseTo(b, 6);
  });

  it('paints every segment of a curved edge, not just the first', () => {
    const segments = buildEdgeSegments([
      [0, 0, 0, 5, 0, 0, 5, 5, 0],   // edge 0: two segments
      [9, 9, 0, 10, 10, 0],          // edge 1: one segment
    ]);
    const colors = buildEdgeColors(segments, 0);

    for (const segment of [0, 1]) {
      expect(colors[segment * 6]).toBeCloseTo(1, 6);
      expect(colors[segment * 6 + 1]).toBeCloseTo(165 / 255, 6);
      expect(colors[segment * 6 + 2]).toBeCloseTo(0, 6);
    }
    // Edge 1 stays black.
    expect(Array.from(colors.slice(12, 18))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('ignores an edge index that does not exist', () => {
    const segments = buildEdgeSegments(square);
    const colors = buildEdgeColors(segments, 99);

    expect(Array.from(colors).every((v) => v === 0)).toBe(true);
  });

  it('reuses the caller buffer instead of allocating on every hover', () => {
    const segments = buildEdgeSegments(square);
    const out = new Float32Array(segments.segmentCount * 6);

    const colors = buildEdgeColors(segments, 0, out);

    expect(colors).toBe(out);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/render/EdgeGeometry.test.ts`

Expected: FAIL — `Failed to resolve import "./EdgeGeometry"`.

- [ ] **Step 3: Implement the module**

Create `src/render/EdgeGeometry.ts`:

```ts
/**
 * Segment buffers for the fat edge layer (WEBCAD-174).
 *
 * Pure on purpose: the mapping from `Solid3D.edgeLines` (flat xyz triples, one
 * array per topological edge) to `LineSegmentsGeometry` pairs is the only real
 * logic in the outline replacement, so it is testable without a GPU context.
 */

export interface EdgeRange {
  /** Index into `Solid3D.edgeLines`, including edges skipped as degenerate. */
  edgeIndex: number;
  /** First segment in the interleaved position buffer. */
  start: number;
  /** Number of segments this edge contributed. */
  count: number;
}

export interface EdgeSegments {
  /** Six floats per segment: start xyz, end xyz. */
  positions: number[];
  edgeRanges: EdgeRange[];
  segmentCount: number;
}

export interface Vec3Like { x: number; y: number; z: number }

/** `#ffa500`, the same cue `Viewer.highlightEdge()` uses today. */
export const SELECTED_EDGE_COLOR: [number, number, number] = [1, 165 / 255, 0];

const BLACK: [number, number, number] = [0, 0, 0];

export function buildEdgeSegments(
  edgeLines: number[][],
  center: Vec3Like = { x: 0, y: 0, z: 0 },
): EdgeSegments {
  const positions: number[] = [];
  const edgeRanges: EdgeRange[] = [];
  let segmentCount = 0;

  edgeLines.forEach((pts, edgeIndex) => {
    if (!pts || pts.length < 6) return;

    const start = segmentCount;
    for (let i = 0; i + 5 < pts.length; i += 3) {
      positions.push(
        pts[i] - center.x,
        pts[i + 1] - center.y,
        pts[i + 2] - center.z,
        pts[i + 3] - center.x,
        pts[i + 4] - center.y,
        pts[i + 5] - center.z,
      );
      segmentCount += 1;
    }
    if (segmentCount > start) {
      edgeRanges.push({ edgeIndex, start, count: segmentCount - start });
    }
  });

  return { positions, edgeRanges, segmentCount };
}

export function buildEdgeColors(
  segments: Pick<EdgeSegments, 'edgeRanges' | 'segmentCount'>,
  selectedEdgeIndex: number | null,
  out?: Float32Array,
): Float32Array {
  const length = segments.segmentCount * 6;
  const colors = out && out.length === length ? out : new Float32Array(length);

  for (let s = 0; s < segments.segmentCount; s += 1) {
    colors[s * 6] = BLACK[0];
    colors[s * 6 + 1] = BLACK[1];
    colors[s * 6 + 2] = BLACK[2];
    colors[s * 6 + 3] = BLACK[0];
    colors[s * 6 + 4] = BLACK[1];
    colors[s * 6 + 5] = BLACK[2];
  }

  if (selectedEdgeIndex !== null) {
    const range = segments.edgeRanges.find((r) => r.edgeIndex === selectedEdgeIndex);
    if (range) {
      const [r, g, b] = SELECTED_EDGE_COLOR;
      for (let s = range.start; s < range.start + range.count; s += 1) {
        colors[s * 6] = r;
        colors[s * 6 + 1] = g;
        colors[s * 6 + 2] = b;
        colors[s * 6 + 3] = r;
        colors[s * 6 + 4] = g;
        colors[s * 6 + 5] = b;
      }
    }
  }

  return colors;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/render/EdgeGeometry.test.ts`

Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/EdgeGeometry.ts src/render/EdgeGeometry.test.ts
git commit -m "feat(render): Add pure edge segment and colour builders"
```

---

### Task 2: Backend-aware edge layer factory

**Files:**
- Create: `src/render/EdgeLayer.ts`
- Test: `src/render/EdgeLayer.test.ts`
- Modify: `src/render/RendererBackend.ts` (add `info` to the seam — see Step 5)

**Interfaces:**
- Consumes: `EdgeSegments`, `buildEdgeColors` from Task 1; `RendererKind` from `RendererBackend`.
- Produces: `createEdgeLayer(kind, segments, opts?)`, `registerWebGPUEdgeLayerFactory(factory | null)`, `EdgeLayerHandle`, `EdgeLayerInfo`, `EdgeOutlineInfo`.

- [ ] **Step 1: Write the failing tests**

Create `src/render/EdgeLayer.test.ts`:

```ts
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildEdgeSegments } from './EdgeGeometry';
import {
  createEdgeLayer,
  registerWebGPUEdgeLayerFactory,
  type EdgeLayerHandle,
} from './EdgeLayer';

const twoEdges = [
  [0, 0, 0, 10, 0, 0],
  [10, 0, 0, 10, 10, 0],
];

function colourBuffer(layer: EdgeLayerHandle): Float32Array {
  const geometry = (layer.object as THREE.Mesh).geometry as THREE.BufferGeometry;
  const attr = geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute;
  return attr.data.array as Float32Array;
}

beforeEach(() => {
  registerWebGPUEdgeLayerFactory(null);
});

describe('createEdgeLayer (webgl)', () => {
  it('builds a LineSegments2 carrying the expected material and segment count', () => {
    const layer = createEdgeLayer('webgl', buildEdgeSegments(twoEdges), { linewidth: 2 });

    expect(layer.object.type).toBe('LineSegments2');
    expect(layer.getInfo()).toMatchObject({
      materialType: 'LineMaterial',
      linewidth: 2,
      segmentCount: 2,
      selectedEdge: null,
    });
  });

  it('writes the selected edge into the shared colour buffer without rebuilding geometry', () => {
    const layer = createEdgeLayer('webgl', buildEdgeSegments(twoEdges));
    const before = colourBuffer(layer);

    layer.setSelected(1);

    expect(colourBuffer(layer)).toBe(before);
    expect(before[0]).toBe(0);
    expect(before[6]).toBeCloseTo(1, 6);
    expect(before[7]).toBeCloseTo(165 / 255, 6);
    expect(layer.getInfo().selectedEdge).toBe(1);
  });

  it('clears the selection back to black', () => {
    const layer = createEdgeLayer('webgl', buildEdgeSegments(twoEdges));
    layer.setSelected(1);
    layer.setSelected(null);

    expect(Array.from(colourBuffer(layer)).every((v) => v === 0)).toBe(true);
    expect(layer.getInfo().selectedEdge).toBeNull();
  });

  it('stores the resolution LineMaterial needs after a resize', () => {
    const layer = createEdgeLayer('webgl', buildEdgeSegments(twoEdges));

    layer.setResolution(800, 600);

    expect(layer.getInfo().resolution).toEqual([800, 600]);
  });
});

describe('createEdgeLayer (webgpu provider)', () => {
  it('throws a named error before the WebGPU provider is registered', () => {
    expect(() => createEdgeLayer('webgpu', buildEdgeSegments(twoEdges))).toThrow(/WEBCAD-169/);
  });

  it('delegates to the registered provider and forwards resolution calls', () => {
    let resolution: [number, number] = [0, 0];
    let selected: number | null = null;

    registerWebGPUEdgeLayerFactory(() => ({
      object: new THREE.Mesh(),
      setResolution: (w, h) => { resolution = [w, h]; },
      setSelected: (index) => { selected = index; },
      getInfo: () => ({
        materialType: 'Line2NodeMaterial',
        linewidth: 2,
        segmentCount: 2,
        selectedEdge: selected,
        selectedSegmentCount: 1,
        resolution,
      }),
    }));

    const layer = createEdgeLayer('webgpu', buildEdgeSegments(twoEdges));
    layer.setResolution(1024, 768);
    layer.setSelected(0);

    expect(layer.getInfo().materialType).toBe('Line2NodeMaterial');
    expect(resolution).toEqual([1024, 768]);
    expect(selected).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/render/EdgeLayer.test.ts`

Expected: FAIL — `Failed to resolve import "./EdgeLayer"`.

- [ ] **Step 3: Implement the factory**

Create `src/render/EdgeLayer.ts`:

```ts
import * as THREE from "three"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import type { RendererKind } from "./RendererBackend"
import { buildEdgeColors, type EdgeSegments } from "./EdgeGeometry"

export interface EdgeLayerOptions {
  linewidth?: number
}

export interface EdgeLayerInfo {
  materialType: string
  linewidth: number
  segmentCount: number
  selectedEdge: number | null
  /** Segments the selected edge covers; proves a curved edge is not a chord. */
  selectedSegmentCount: number
  resolution: [number, number]
}

export interface EdgeOutlineInfo extends EdgeLayerInfo {
  present: boolean
  visible: boolean
}

export interface EdgeLayerHandle {
  /** `LineSegments2` on WebGL, its `lines/webgpu` twin on WebGPU. */
  object: THREE.Mesh
  setResolution(width: number, height: number): void
  setSelected(selectedEdgeIndex: number | null): void
  getInfo(): EdgeLayerInfo
}

export type WebGPUEdgeLayerFactory = (
  segments: EdgeSegments,
  opts: EdgeLayerOptions,
) => EdgeLayerHandle

let webgpuFactory: WebGPUEdgeLayerFactory | null = null

/**
 * Registered by the WebGPU backend module in WEBCAD-169.
 *
 * The indirection keeps `three/webgpu` out of the main bundle: a static import
 * would ship the node renderer to every WebGL user, and the WebGL path is the
 * only one that ships today.
 */
export function registerWebGPUEdgeLayerFactory(
  factory: WebGPUEdgeLayerFactory | null,
): void {
  webgpuFactory = factory
}

export function createEdgeLayer(
  kind: RendererKind,
  segments: EdgeSegments,
  opts: EdgeLayerOptions = {},
): EdgeLayerHandle {
  if (kind === 'webgl') return createWebGLEdgeLayer(segments, opts)
  if (!webgpuFactory) {
    throw new Error(
      'WebGPU edge layer requested before its provider was registered (WEBCAD-169)',
    )
  }
  return webgpuFactory(segments, opts)
}

function createWebGLEdgeLayer(
  segments: EdgeSegments,
  opts: EdgeLayerOptions,
): EdgeLayerHandle {
  const linewidth = opts.linewidth ?? 2

  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(segments.positions)
  geometry.setColors(buildEdgeColors(segments, null))

  const material = new LineMaterial({
    color: 0xffffff,     // multiplied by the per-segment vertex colours
    linewidth,
    vertexColors: true,
    worldUnits: false,
    depthTest: true,
    depthWrite: false,
  })

  const object = new LineSegments2(geometry, material)
  object.name = 'edgeOutline'

  let selected: number | null = null
  let resolution: [number, number] = [0, 0]
  const colorScratch = new Float32Array(segments.segmentCount * 6)

  return {
    object,
    setResolution(width, height) {
      resolution = [width, height]
      material.resolution.set(width, height)
    },
    setSelected(edgeIndex) {
      selected = edgeIndex
      // setColors() allocates a fresh interleaved buffer every call, and this
      // runs on hover, so write into the existing one instead.
      const colorStart = geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute
      const buffer = colorStart.data as THREE.InterleavedBuffer
      ;(buffer.array as Float32Array).set(buildEdgeColors(segments, edgeIndex, colorScratch))
      buffer.needsUpdate = true
    },
    getInfo() {
      const selectedRange = selected === null
        ? undefined
        : segments.edgeRanges.find((range) => range.edgeIndex === selected)
      return {
        materialType: material.type,
        linewidth,
        segmentCount: segments.segmentCount,
        selectedEdge: selected,
        selectedSegmentCount: selectedRange?.count ?? 0,
        resolution,
      }
    },
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/render/EdgeLayer.test.ts`

Expected: PASS — 6 tests.

- [ ] **Step 5: Add `info` to the renderer seam**

Both `WebGLRenderer` and `WebGPURenderer` expose `info.render.calls/triangles`; the perf step in Task 5 needs them behind the seam.

In `src/render/RendererBackend.ts`, add to `RendererBackend`:

```ts
  /** Draw statistics for the last frame. Both backends populate this. */
  readonly info: {
    render: { calls: number; triangles: number };
  };
```

- [ ] **Step 6: Verify the seam still typechecks**

Run: `npm run typecheck`

Expected: PASS. `createWebGLRenderer` returns `THREE.WebGLRenderer`, which structurally satisfies the widened interface; no other change is needed.

- [ ] **Step 7: Commit**

```bash
git add src/render/EdgeLayer.ts src/render/EdgeLayer.test.ts src/render/RendererBackend.ts
git commit -m "feat(render): Add backend-aware fat edge layer factory"
```

---

### Task 3: Wire the layer into Viewer behind `?edges=fat`

**Files:**
- Modify: `src/render/Viewer.ts` (imports, `ShadingMode` type, `edgeStyle` field, `createSolid3DObject`, `createEdgeOutline`, `setShadingMode`, `tintEntityLines`, `resize`, `getEdgeOutlineInfo`, `getShadingMode`, block-insert path at ~2609)
- Modify: `src/testing/TestBridge.ts` (bridge methods)
- Modify: `tests/e2e/bridge.ts` (driver methods)
- Test: `tests/e2e/edges.spec.ts` (create)

**Interfaces:**
- Consumes: `buildEdgeSegments` (Task 1), `createEdgeLayer`, `EdgeLayerHandle`, `EdgeOutlineInfo` (Task 2).
- Produces: `ShadingMode` type, `Viewer.getShadingMode()`, `Viewer.getEdgeOutlineInfo(entityId)`, bridge `setShadingMode` / `getShadingMode` / `getEdgeOutlineInfo`.

- [ ] **Step 1: Write the failing e2e spec**

Create `tests/e2e/edges.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * The fat edge layer (WEBCAD-174) under its rollout flag.
 *
 * `?edges=fat` opts into the replacement while `?edges=classic` (the default
 * until Task 5) keeps OutlineEffect. These assertions are the semantic half of
 * the visual comparison: the layer exists, carries the right material, and
 * survives a shading round-trip.
 */
test.describe('fat edge layer', () => {
  test('is present on a shaded solid and keeps its material across shading modes', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    await cad.zoomToFit();

    const solid = await cad.onlySolid();
    const info = await cad.getEdgeOutlineInfo(solid.id);
    expect(info.present, 'a shaded box must carry an edge outline layer').toBe(true);
    expect(info.segmentCount, 'a box has twelve edges, one segment each').toBe(12);
    expect(info.materialType).toBe('LineMaterial');
    expect(info.visible).toBe(true);

    await cad.setShadingMode('PHONG');
    expect((await cad.getEdgeOutlineInfo(solid.id)).visible, 'outlines are hidden in PHONG').toBe(false);

    await cad.setShadingMode('SHADED');
    const after = await cad.getEdgeOutlineInfo(solid.id);
    expect(after.visible).toBe(true);
    expect(
      after.materialType,
      'setShadingMode must not swap the line material for a mesh material',
    ).toBe('LineMaterial');
    expect(after.segmentCount).toBe(12);
  });

  test('tracks the canvas resolution after a viewport resize', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const solid = await cad.onlySolid();

    const before = await cad.getEdgeOutlineInfo(solid.id);
    await page.setViewportSize({ width: 1400, height: 900 });
    await cad.whenIdle();
    const after = await cad.getEdgeOutlineInfo(solid.id);

    expect(after.resolution[0]).toBeGreaterThan(0);
    expect(after.resolution).not.toEqual(before.resolution);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test edges --workers=1`

Expected: FAIL — `no such bridge method: getEdgeOutlineInfo`.

- [ ] **Step 3: Add the shading-mode type and getter to Viewer**

In `src/render/Viewer.ts`, above `export class Viewer`:

```ts
export type ShadingMode = 'WIREFRAME' | 'SHADED' | 'PHONG' | 'BLINN' | 'ZEBRA'
```

Change the field at line 95 to use it:

```ts
  private shadingMode: ShadingMode = 'SHADED';
```

Change the `setShadingMode` signature and add the getter next to it:

```ts
  setShadingMode(mode: ShadingMode) {
```

```ts
  getShadingMode(): ShadingMode {
    return this.shadingMode;
  }
```

- [ ] **Step 4: Add the edge-style flag and build the layer**

Add imports at the top of `src/render/Viewer.ts`:

```ts
import { buildEdgeSegments } from "./EdgeGeometry"
import { createEdgeLayer, type EdgeLayerHandle, type EdgeOutlineInfo } from "./EdgeLayer"
```

Add the flag beside `shadingMode`:

```ts
  /**
   * Rollout switch for WEBCAD-174. `?edges=fat` paints solid edges with the
   * backend-neutral line layer; classic keeps OutlineEffect on WebGL. Task 5
   * flips the default and deletes the flag.
   */
  private readonly edgeStyle: 'classic' | 'fat' =
    new URLSearchParams(window.location.search).get('edges') === 'fat' ? 'fat' : 'classic'
```

In `createSolid3DObject()`, immediately after the edge/fallback block closes (currently `}` at line 2149, before `group.userData = ...`), add:

```ts
    if (this.edgeStyle === 'fat') {
      const outline = this.createEdgeOutline(entity, center);
      if (outline) group.add(outline);
    }
```

Add the builder method immediately before `highlightFace()`:

```ts
  /**
   * Fat-line edges (WEBCAD-174): one LineSegments2 per solid, display only.
   *
   * The thin per-edge THREE.Line objects created above remain the raycast
   * targets; this layer exists so the edges stay visible with weight at any
   * zoom, which is the affordance chamfer/fillet/trim depend on.
   */
  private createEdgeOutline(entity: Solid3D, center: THREE.Vector3): THREE.Object3D | null {
    const segments = buildEdgeSegments(entity.edgeLines ?? [], center);
    if (segments.segmentCount === 0) return null;

    const edgeLayer = createEdgeLayer(this._rendererInfo.kind, segments, { linewidth: 2 });
    const object = edgeLayer.object;

    object.userData = {
      type: 'EdgeOutline',
      isEdge: false,        // keeps it out of the thin-line registries
      entityId: entity.id,
      edgeLayer,
      segments,
    };
    // Display only: picking must stay on the thin lines that carry edgeIndex.
    object.raycast = () => {};
    object.renderOrder = 1;
    object.visible = this.shadingMode === 'SHADED' || this.shadingMode === 'ZEBRA';

    // Drawing-buffer pixels, not CSS pixels: that is what LineMaterial needs.
    edgeLayer.setResolution(this.canvas.width || 1, this.canvas.height || 1);
    return object;
  }
```

- [ ] **Step 5: Guard the Mesh traversals**

In `setShadingMode()` (line ~566), make the outline branch explicit before the mesh branch:

```ts
    this.scene.traverse((obj) => {
      if (obj.userData.type === 'EdgeOutline') {
        obj.visible = (mode === 'SHADED' || mode === 'ZEBRA');
        return;
      }
      if (obj instanceof THREE.Mesh &&
          obj.userData.type !== 'Text' &&
          obj.userData.type !== 'Edge' &&
          obj.userData.type !== 'Silhouette' &&
          obj.userData.handle === undefined) {
```

In `tintEntityLines()` (line ~4429), add the guard to **both** traversals:

```ts
        if (
          child.userData?.type !== 'EdgeOutline' &&
          (child instanceof THREE.Line || child instanceof THREE.LineSegments || child instanceof THREE.Mesh) &&
          child.material && (child.material as any).color
        ) {
```

- [ ] **Step 6: Refresh resolution on resize**

Replace the dead `LineMaterial` loop in `resize()` (lines ~699-706) with:

```ts
    // Fat edge lines need the canvas size; WebGL stores it as a uniform,
    // WebGPU's layer reads it from the renderer viewport (no-op).
    this.scene.traverse(obj => {
      const edgeLayer = obj.userData?.edgeLayer as EdgeLayerHandle | undefined;
      if (edgeLayer) edgeLayer.setResolution(this.canvas.width, this.canvas.height);
    });
```

- [ ] **Step 7: New boxes in block inserts keep working**

In the block-insert path, after the `profileLines.forEach(...)` block (line ~2611-2615), add:

```ts
            // Outlines are display-only and are not in `edgeLines`, so remap their
            // entityId to the Insert here; otherwise they would never highlight.
            const outline = obj.children.find(child => child.userData?.type === 'EdgeOutline');
            if (outline) {
                outline.userData.entityId = entity.id;
                outline.visible = (this.shadingMode === 'SHADED' || this.shadingMode === 'ZEBRA');
            }
```

- [ ] **Step 8: Add the diagnostic getter**

Add to `Viewer`, next to `getShadingMode()`:

```ts
  /**
   * Rendering counterpart to `rendererInfo` (WEBCAD-174): lets a test prove the
   * layer exists and that a shading-mode switch did not replace its material.
   */
  getEdgeOutlineInfo(entityId: string): EdgeOutlineInfo {
    const matches: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.userData?.type === 'EdgeOutline' && obj.userData.entityId === entityId) {
        matches.push(obj);
      }
    });

    const object = matches[0];
    if (!object) {
      return {
        present: false,
        visible: false,
        materialType: 'none',
        linewidth: 0,
        segmentCount: 0,
        selectedEdge: null,
        selectedSegmentCount: 0,
        resolution: [0, 0],
      };
    }

    const layer = object.userData.edgeLayer as EdgeLayerHandle;
    return { present: true, visible: object.visible, ...layer.getInfo() };
  }
```

- [ ] **Step 9: Expose the bridge methods**

In `src/testing/TestBridge.ts`, add imports:

```ts
import type { ShadingMode } from "../render/Viewer";
import type { EdgeOutlineInfo } from "../render/EdgeLayer";
```

Add methods next to `getRendererInfo()`:

```ts
  /** The current shading mode, and a way to pin it without a command string. */
  getShadingMode(): ShadingMode {
    return this.viewer.getShadingMode();
  }

  setShadingMode(mode: ShadingMode): ShadingMode {
    if (!['WIREFRAME', 'SHADED', 'PHONG', 'BLINN', 'ZEBRA'].includes(mode)) {
      throw new TestBridgeError('bad-argument', `unknown shading mode "${mode}"`);
    }
    this.viewer.setShadingMode(mode);
    return this.viewer.getShadingMode();
  }

  /** Fat-line outline diagnostics (WEBCAD-174). Never mutates the scene. */
  getEdgeOutlineInfo(objectId: string): EdgeOutlineInfo {
    this.solid(objectId);
    return this.viewer.getEdgeOutlineInfo(objectId);
  }
```

Re-export both types from `TestBridge.ts` so the Playwright driver imports only from the bridge module:

```ts
export type { ShadingMode } from "../render/Viewer";
export type { EdgeOutlineInfo } from "../render/EdgeLayer";
```

In `tests/e2e/bridge.ts`, add both names to the existing type-import block that already imports `RendererInfo`, and add beside `getRendererInfo`:

```ts
  getShadingMode = () => this.call<ShadingMode>('getShadingMode');
  setShadingMode = (mode: ShadingMode) => this.call<ShadingMode>('setShadingMode', mode);
  getEdgeOutlineInfo = (objectId: string) => this.call<EdgeOutlineInfo>('getEdgeOutlineInfo', objectId);
```

- [ ] **Step 10: Run the new spec**

Run: `npx playwright test edges --workers=1`

Expected: PASS — 2 tests.

- [ ] **Step 11: Run the full gates**

Run: `npm run typecheck; npm test`

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/render/Viewer.ts src/testing/TestBridge.ts tests/e2e/bridge.ts tests/e2e/edges.spec.ts
git commit -m "feat(render): Draw solid edges with a fat-line layer behind ?edges=fat"
```

---

### Task 4: Highlight the selected edge in the layer

**Files:**
- Modify: `src/render/Viewer.ts` (`highlightEdge`, `edgeOutlinesFor`)
- Test: `tests/e2e/edges.spec.ts` (add cases)

**Interfaces:**
- Consumes: `EdgeLayerHandle.setSelected()` (Task 2); `getEdgeOutlineInfo` (Task 3).
- Produces: selection parity between the thin line and the fat layer.

- [ ] **Step 1: Extend the failing e2e spec**

Append to `tests/e2e/edges.spec.ts`:

```ts
  test('selecting an edge marks exactly that edge, and clearing removes the mark', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const solid = await cad.onlySolid();
    const edges = await cad.getEdges(solid.id);
    expect(edges).toHaveLength(12);

    await cad.selectEdge(solid.id, edges[3].id);
    let info = await cad.getEdgeOutlineInfo(solid.id);
    expect(info.selectedEdge, 'bm selected edge must reach the outline layer').toBe(3);

    await cad.clearSelection();
    info = await cad.getEdgeOutlineInfo(solid.id);
    expect(info.selectedEdge).toBeNull();
  });

  test('a curved edge keeps its whole polyline selected', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('CYLINDER', '0,0', '30', '80');
    const solid = await cad.onlySolid();
    const edges = await cad.getEdges(solid.id);
    const closed = edges.find((e) =>
      Math.hypot(e.start[0] - e.end[0], e.start[1] - e.end[1], e.start[2] - e.end[2]) < 1e-3,
    );
    expect(closed, 'a cylinder has at least one closed circular edge').toBeTruthy();

    await cad.selectEdge(solid.id, closed!.id);

    const info = await cad.getEdgeOutlineInfo(solid.id);
    expect(info.selectedEdge).toBe(Number(closed!.id.slice(1)));
    // A circle is tessellated, so the selection must cover many segments.
    expect(info.selectedSegmentCount).toBeGreaterThan(1);
  });

  test('a new solid after a delete gets its own live layer', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const first = await cad.onlySolid();

    await cad.selectObject(first.id);
    await cad.runOk('ERASE', '');
    await cad.runOk('BOX', '10,10', '60,60', '50');
    const second = await cad.onlySolid();

    const info = await cad.getEdgeOutlineInfo(second.id);
    expect(info.present).toBe(true);
    expect(info.segmentCount).toBe(12);
  });
```

`ERASE` uses the current selection: `selectObject()` then the command, then Enter (empty step) confirms the delete.

- [ ] **Step 2: Run it and confirm the selection case fails**

Run: `npx playwright test edges --workers=1`

Expected: FAIL — `expect(info.selectedEdge).toBe(3)` receives `null`.

- [ ] **Step 3: Sync the layer in `highlightEdge`**

Add a helper next to `highlightEdge`:

```ts
  private edgeOutlinesFor(entityId: string): EdgeLayerHandle[] {
    const layers: EdgeLayerHandle[] = [];
    this.scene.traverse((obj) => {
      if (obj.userData?.type === 'EdgeOutline' && obj.userData.entityId === entityId) {
        layers.push(obj.userData.edgeLayer as EdgeLayerHandle);
      }
    });
    return layers;
  }
```

At the end of `highlightEdge()`, after the `if (edgeIndex !== null) { ... }` block and before `this.scheduleRender()`:

```ts
    // Same state, second rendering: the fat layer reads the colour attribute
    // instead of the thin line's material.
    this.edgeOutlinesFor(entityId).forEach((layer) => layer.setSelected(edgeIndex));
```

- [ ] **Step 4: Run the spec**

Run: `npx playwright test edges --workers=1`

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/Viewer.ts tests/e2e/edges.spec.ts
git commit -m "feat(render): Mirror edge selection into the fat-line layer"
```

---

### Task 5: Flip the default, record the comparison, delete OutlineEffect

**Files:**
- Modify: `src/render/Viewer.ts` (default flip, delete effect, delete flag)
- Modify: `README.md` (rendering section)
- Test: `tests/e2e/edges.visual.spec.ts` (create, then reduce)

**Interfaces:**
- Consumes: everything above.
- Produces: a single rendering path with no `OutlineEffect`, no `effect` field, and no `?edges` flag.

- [ ] **Step 1: Record baseline screenshots while both paths exist**

Create `tests/e2e/edges.visual.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Outline comparison artifact for WEBCAD-174.
 *
 * `classic` is OutlineEffect, `fat` is the replacement. Both are captured from
 * the same build while the rollout flag exists; the classic half is deleted
 * once the comparison is accepted.
 */
test.describe('edge rendering comparison', () => {
  test.skip(!process.env.WEBCAD_VISUAL, 'set WEBCAD_VISUAL=1 to run canvas screenshot tests');

  for (const style of ['classic', 'fat'] as const) {
    test(`box, cylinder and filleted box (${style})`, async ({ page }) => {
      const cad = await CadBridge.boot(page, `/?edges=${style}`);
      await cad.setView('orthogonal');

      await cad.runOk('BOX', '-50,-50', '50,50', '100');
      await cad.zoomToFit();
      await cad.whenIdle();
      await expect(page.getByTestId('viewport')).toHaveScreenshot(`edges-box-${style}.png`, {
        maxDiffPixelRatio: 0.02,
      });

      const box = await cad.onlySolid();
      await cad.runOk('SFILLET', '8', `EDGE:${box.id}:0`);
      await cad.pressEnter();
      await cad.zoomToFit();
      await cad.whenIdle();
      await expect(page.getByTestId('viewport')).toHaveScreenshot(`edges-fillet-${style}.png`, {
        maxDiffPixelRatio: 0.02,
      });

      await cad.selectObject(box.id);
      await cad.runOk('ERASE', '');
      await cad.runOk('CYLINDER', '0,0', '30', '80');
      await cad.zoomToFit();
      await cad.whenIdle();
      await expect(page.getByTestId('viewport')).toHaveScreenshot(`edges-cylinder-${style}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
```

- [ ] **Step 2: Generate both sets of baselines**

Run: `$env:WEBCAD_VISUAL=1; npx playwright test edges.visual --workers=1 --update-snapshots`

Expected: PASS, writing 6 PNGs into `tests/e2e/edges.visual.spec.ts-snapshots/`.

- [ ] **Step 3: Measure draw calls for classic vs fat**

Add to `TestBridge` next to `getRendererInfo()`:

```ts
  /** Draw statistics for the last rendered frame (WEBCAD-174 perf evidence). */
  getRenderStats(): { drawCalls: number; triangles: number } {
    return {
      drawCalls: this.viewer.renderer.info.render.calls,
      triangles: this.viewer.renderer.info.render.triangles,
    };
  }
```

and to `tests/e2e/bridge.ts`:

```ts
  getRenderStats = () => this.call<{ drawCalls: number; triangles: number }>('getRenderStats');
```

Create `tests/e2e/edges.perf.spec.ts`:

```ts
import { test } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Draw-call evidence for WEBCAD-174. Prints numbers; it does not assert a
 * budget, because the budget depends on the scene and the machine.
 *
 *   npx playwright test edges.perf --workers=1
 */
for (const style of ['classic', 'fat'] as const) {
  test(`ten solids, ${style}`, async ({ page }) => {
    const cad = await CadBridge.boot(page, `/?edges=${style}`);
    await cad.setView('orthogonal');
    for (let i = 0; i < 10; i += 1) {
      const x = -100 + i * 25;
      await cad.runOk('BOX', `${x},-50`, `${x + 15},50`, '60');
    }
    await cad.zoomToFit();
    await cad.whenIdle();

    const stats = await cad.getRenderStats();

    // Median requestAnimationFrame interval while orbiting. Headless software
    // rendering caps this at the compositor rate, so it is comparative evidence,
    // not an absolute frame budget.
    const frameMs = await page.evaluate(async () => {
      const bridge = (window as unknown as {
        __webcadTest: { orbit: (a: number, e: number) => Promise<void> };
      }).__webcadTest;
      const deltas: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 60; i += 1) {
        await new Promise<number>((resolve) => requestAnimationFrame(resolve));
        const now = performance.now();
        deltas.push(now - last);
        last = now;
        void bridge.orbit(1, 0);
      }
      deltas.sort((a, b) => a - b);
      return deltas[Math.floor(deltas.length / 2)];
    });

    console.log(
      `[edges:${style}] drawCalls=${stats.drawCalls} triangles=${stats.triangles} medianFrameMs=${frameMs.toFixed(2)}`,
    );
  });
}
```

Run: `npx playwright test edges.perf --workers=1`

Expected: PASS with two log lines. Record both in the ticket; the fat number should be within a few draw calls of classic (one per solid, minus the outline pass).

- [ ] **Step 4: Flip the default**

In `src/render/Viewer.ts`, change the flag parser so fat is the default and classic is the escape hatch:

```ts
  private readonly edgeStyle: 'classic' | 'fat' =
    new URLSearchParams(window.location.search).get('edges') === 'classic' ? 'classic' : 'fat'
```

Run the visual comparison again without `--update-snapshots`:

Run: `$env:WEBCAD_VISUAL=1; npx playwright test edges.visual --workers=1`

Expected: PASS. Both sets were recorded from the same build, so this only proves the flag still selects each path.

- [ ] **Step 5: Delete `OutlineEffect` and the flag**

In `src/render/Viewer.ts`:

1. Delete the import line `import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js'`.
2. Delete the field `effect!: any`.
3. Delete the constructor block from the comment `// OutlineEffect is a WebGL-only addon` through the `});` that closes `new OutlineEffect(...)`.
4. Replace `renderNow()` with:

```ts
  private renderNow(){
    this.onBeforeRender();
    this.gridRenderer.updateAxesScale(1 / this.camera.zoom);
    this.renderer.render(this.scene, this.camera);
  }
```

5. Delete the `edgeStyle` field and the `?edges` parsing.
6. Replace the `if (this.edgeStyle === 'fat') { ... }` block in `createSolid3DObject()` with:

```ts
    const outline = this.createEdgeOutline(entity, center);
    if (outline) group.add(outline);
```

7. In the block-insert path, keep the outline remap added in Task 3 (it does not depend on the flag).
8. In `src/render/RendererBackend.ts`, replace the stale final return in `chooseRenderer()`:

```ts
  return webgl(
    'WebGPU adapter is available, but the renderer is not wired up yet (WEBCAD-169)',
  );
```

and update the function's doc comment above it so it no longer claims `OutlineEffect` or WEBCAD-164 blocks the backend:

```ts
 * The WebGPU branch is not wired up yet and says so instead of pretending: the
 * adapter probe succeeds, but `createRenderer()` still builds WebGL until
 * WEBCAD-169 lands the backend itself.
```

- [ ] **Step 6: Prove the old path is gone**

Run:

```bash
git grep -nE "OutlineEffect|this\.effect|edgeStyle|edges=classic" -- src tests
```

Expected: no matches. (`docs/` still mentions them historically — that is fine.)

- [ ] **Step 7: Reduce the test artifacts to the shipped path**

Replace `tests/e2e/edges.visual.spec.ts` with the fat-only version:

```ts
import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Edge rendering regression for WEBCAD-174.
 *
 * Opt in with WEBCAD_VISUAL=1; record baselines on the machine that will run
 * them. The classic/OutlineEffect half of the original comparison has been
 * removed along with the effect itself.
 */
test.describe('edge rendering', () => {
  test.skip(!process.env.WEBCAD_VISUAL, 'set WEBCAD_VISUAL=1 to run canvas screenshot tests');

  test('box, cylinder and filleted box', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('orthogonal');

    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    await cad.zoomToFit();
    await cad.whenIdle();
    await expect(page.getByTestId('viewport')).toHaveScreenshot('edges-box-fat.png', {
      maxDiffPixelRatio: 0.02,
    });

    const box = await cad.onlySolid();
    await cad.runOk('SFILLET', '8', `EDGE:${box.id}:0`);
    await cad.pressEnter();
    await cad.zoomToFit();
    await cad.whenIdle();
    await expect(page.getByTestId('viewport')).toHaveScreenshot('edges-fillet-fat.png', {
      maxDiffPixelRatio: 0.02,
    });

    await cad.selectObject(box.id);
    await cad.runOk('ERASE', '');
    await cad.runOk('CYLINDER', '0,0', '30', '80');
    await cad.zoomToFit();
    await cad.whenIdle();
    await expect(page.getByTestId('viewport')).toHaveScreenshot('edges-cylinder-fat.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
```

Delete the three `*-classic.png` snapshots and the one-off perf spec (its numbers are recorded in the ticket):

```powershell
Remove-Item tests\e2e\edges.visual.spec.ts-snapshots\edges-box-classic.png,
  tests\e2e\edges.visual.spec.ts-snapshots\edges-fillet-classic.png,
  tests\e2e\edges.visual.spec.ts-snapshots\edges-cylinder-classic.png
Remove-Item tests\e2e\edges.perf.spec.ts
```

Run: `$env:WEBCAD_VISUAL=1; npx playwright test edges.visual --workers=1`

Expected: PASS — 3 screenshots, fat only.

- [ ] **Step 8: Update the README**

In `README.md`, replace the shading bullet (currently line 49) with:

```markdown
- **Shading modes:** wireframe, shaded, Phong, Blinn, and a zebra surface-analysis shader (`SHADING_ZEBRA`). Solid edges are drawn by a per-solid fat-line layer (`src/render/EdgeLayer.ts`): 2 px at any zoom, black, with the selected edge in orange.
```

- [ ] **Step 9: Run every gate**

Run:

```bash
npm run typecheck; npm test; npm run lint; npm run build
```

Expected: typecheck PASS, 332+ Vitest tests PASS, lint 0 errors, build PASS.

- [ ] **Step 10: Commit**

```bash
git add src/render/Viewer.ts src/render/RendererBackend.ts README.md tests/e2e/edges.visual.spec.ts tests/e2e/edges.visual.spec.ts-snapshots tests/e2e/edges.perf.spec.ts tests/e2e/bridge.ts src/testing/TestBridge.ts
git commit -m "feat(render): Replace OutlineEffect with fat edge lines"
```

---

### Task 6: Documentation and final verification

**Files:**
- Modify: `tests/e2e/README.md` (bridge capability table)
- Modify: `docs/superpowers/specs/2026-10-20-outline-replacement-design.md` (status line)

**Interfaces:**
- Consumes: the shipped bridge API and the eliminated flag.
- Produces: docs that match the code.

- [ ] **Step 1: Document the new bridge methods**

In `tests/e2e/README.md`, add rows to the capability table:

```markdown
| `getShadingMode()` / `setShadingMode(mode)` | Pin the shading mode without going through a command string. |
| `getEdgeOutlineInfo(objectId)` | Fat edge layer diagnostics: presence, material type, segment count, selected edge, resolution, visibility. |
| `getRenderStats()` | Draw calls and triangles for the last frame. |
```

Remove any mention of `?edges=classic` or `?edges=fat` from the README and from `tests/e2e/README.md`:

```bash
git grep -nE "edges=classic|edges=fat" -- src tests README.md
```

Expected: no matches outside `docs/superpowers/`.

- [ ] **Step 2: Update the spec status**

Change the spec header to:

```markdown
**Status:** Implemented
```

- [ ] **Step 3: Manually verify WebGPU parity on a machine with an adapter**

Run `npm run dev`, open `http://localhost:5173/?renderer=webgpu`, create a box, select an edge, and confirm: edges are visible at the same width, the selected edge is orange, and the console logs no edge-layer errors. This is the one check CI cannot perform. Record the result in the ticket.

- [ ] **Step 4: Run the complete suite one last time**

Run:

```bash
npm run typecheck; npm test; npm run lint; npm run build; npx playwright test renderer edges --workers=1
```

Expected: all PASS. `renderer.spec.ts` is included because `expectRenderer('webgl')` is an acceptance criterion for this ticket.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/README.md docs/superpowers/specs/2026-10-20-outline-replacement-design.md
git commit -m "docs: Document the fat edge layer and its bridge diagnostics"
```

---

## Manual follow-ups (not code)

After the branch is reviewed:

1. **WEBCAD-174** — close with the before/after screenshots from Task 5 and the two draw-call numbers.
2. **WEBCAD-166** — move back to Backlog: marked *started*, but `ZebraTSL.ts` was deleted and no work survives.
3. **WEBCAD-169** — update the blocker text: only the WebGPU backend wiring remains; `chooseRenderer()` should stop citing WEBCAD-164.

Plane calls use the key in `plane-secret-key.csv`; load it into `$env:PLANE_KEY` without printing it:

```powershell
$row = Import-Csv .\plane-secret-key.csv | Select-Object -First 1
$env:PLANE_KEY = $row.'Secret key'
```

Then call `https://api.plane.so/api/v1/workspaces/haktek/projects/51bb06ac-d62e-4168-b275-1cf5042bf6fe/` with header `X-API-Key: $env:PLANE_KEY`.
