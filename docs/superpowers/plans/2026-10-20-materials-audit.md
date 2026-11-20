# WebGPU Stock Material Audit — Implementation Plan

**Ticket:** WEBCAD-167
**Spec:** `docs/superpowers/specs/2026-10-20-materials-audit-design.md`
**Goal:** Prove every stock material family and the five user-visible drawing aids
render correctly on WebGL and WebGPU, fix confirmed backend regressions, and commit the
evidence.

## Architecture

- `src/render/ClosedLine.ts` — shared closed-line helper that avoids the unsupported
  `THREE.LineLoop` on WebGPU.
- `tests/manual/materials-audit.html` + `.ts` — test-only page with two real `Viewer`s
  (WebGL and a pre-initialised `WebGPURenderer`), seeded by `?case=`.
- `tests/manual/capture-materials-audit.mjs` — local headed-Chromium capture with a
  backend and console-error gate.
- `docs/verification/materials-audit/` — one combined screenshot per case.
- `docs/verification/materials-audit.md` — table-first findings report.

**Tech stack:** TypeScript 5, three r185 (`three` + `three/webgpu`), Vite, Vitest,
Playwright, headed Chromium with `--enable-unsafe-webgpu`. Windows/PowerShell.

## Global constraints

- Do not change the shipped boot path, default renderer, or add a WebGPU flag.
- Do not implement the WebGPU `EdgeLayer` provider; #169 owns it.
- The harness is test-only and must not be imported from `src/` or `app.ts`.
- Never print, echo, or commit the contents of `plane-secret-key.csv`.
- Every production change gets a unit test or an existing visual test that would fail
  if the change regressed.
- Run commands from `C:\Dev\webcad`. The dev server must be running for capture.
- Commit after every task. Do not batch tasks into one commit.

---

## Task 1: Add the closed-line helper

**Files:**
- Create: `src/render/ClosedLine.ts`
- Create: `src/render/ClosedLine.test.ts`

**Step 1: Write the failing test**

Create `src/render/ClosedLine.test.ts`:

```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createClosedLine } from './ClosedLine'

describe('createClosedLine', () => {
  it('returns a Line with the first point repeated at the end', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 10, 0),
    ]
    const line = createClosedLine(points, new THREE.LineBasicMaterial())

    expect(line).toBeInstanceOf(THREE.Line)
    expect(line.type).toBe('Line')

    const position = line.geometry.getAttribute('position')
    expect(position.count).toBe(4)
    expect(position.getX(3)).toBe(0)
    expect(position.getY(3)).toBe(0)
    expect(position.getZ(3)).toBe(0)
  })

  it('does not mutate the source array', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 10, 0),
    ]
    createClosedLine(points, new THREE.LineBasicMaterial())
    expect(points).toHaveLength(3)
  })

  it('handles an empty point list without throwing', () => {
    const line = createClosedLine([], new THREE.LineBasicMaterial())
    expect(line.geometry.getAttribute('position').count).toBe(0)
  })
})
```

**Step 2: Run the test and confirm it fails**

```powershell
npx vitest run src/render/ClosedLine.test.ts
```

Expected: failure resolving `./ClosedLine`.

**Step 3: Implement the helper**

Create `src/render/ClosedLine.ts`:

```ts
import * as THREE from 'three'

/**
 * WebGPURenderer does not support THREE.LineLoop (WEBCAD-167).
 *
 * Append a clone of the first point and draw a normal Line. The WebGL output is the
 * same closed shape, and both backends can render it.
 */
export function createClosedLine(
  points: readonly THREE.Vector3[],
  material: THREE.Material,
): THREE.Line {
  const closed = points.length > 0 ? [...points, points[0].clone()] : []
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(closed), material)
}
```

**Step 4: Run the test and the full unit suite**

```powershell
npx vitest run src/render/ClosedLine.test.ts
npm test
```

Expected: 3 new tests pass; all previously passing tests still pass.

**Step 5: Commit**

```powershell
git add src/render/ClosedLine.ts src/render/ClosedLine.test.ts
git commit -m "feat(render): Add a closed-line helper for WebGPU"
```

---

## Task 2: Replace LineLoop and complete dash distances

**Files:**
- Modify: `src/render/Viewer.ts`
- Modify: `src/render/CursorRenderer.ts`

**Step 1: Add the imports**

In `src/render/Viewer.ts`, add next to the other render imports:

```ts
import { createClosedLine } from "./ClosedLine"
```

In `src/render/CursorRenderer.ts`:

```ts
import { createClosedLine } from "./ClosedLine"
```

**Step 2: Replace every production `new THREE.LineLoop(...)`**

Use `createClosedLine` with the same points and material at each site.

`Viewer.ts` preview circle (around line 905):

```ts
// before
const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, p.y, z)));
const color = this.resolveColor(entity.properties?.color, previewColor);
const mat = new THREE.LineBasicMaterial({ color });
obj = new THREE.LineLoop(geo, mat);

// after
const color = this.resolveColor(entity.properties?.color, previewColor);
const mat = new THREE.LineBasicMaterial({ color });
obj = createClosedLine(points.map(p => new THREE.Vector3(p.x, p.y, z)), mat);
```

`Viewer.ts` capped closed polyline (around 2842):

```ts
// before
group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, p.y, elevation))), material));
group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(topPts), material));

// after
group.add(createClosedLine(points.map(p => new THREE.Vector3(p.x, p.y, elevation)), material));
group.add(createClosedLine(topPts, material));
```

`Viewer.ts` closed polyline body (around 2857):

```ts
// before
return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts3d), material);

// after
return createClosedLine(pts3d, material);
```

`Viewer.ts` full-ellipse caps (around 3082):

```ts
// before
group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(bottomPts), mat));
group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(topPts), mat));

// after
group.add(createClosedLine(bottomPts, mat));
group.add(createClosedLine(topPts, mat));
```

`Viewer.ts` full-ellipse body (around 3096):

```ts
// before
const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, p.y, elevation)));
if (isFullEllipse) {
  return new THREE.LineLoop(geo, mat);
}
return new THREE.Line(geo, mat);

// after
const pts3d = points.map(p => new THREE.Vector3(p.x, p.y, elevation));
if (isFullEllipse) {
  return createClosedLine(pts3d, mat);
}
return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3d), mat);
```

`CursorRenderer.ts` centre snap marker (around 177):

```ts
// before
const curve = new THREE.EllipseCurve(0, 0, size, size, 0, 2 * Math.PI, false, 0);
const points = curve.getPoints(16);
geo = new THREE.BufferGeometry().setFromPoints(points);
mesh = new THREE.LineLoop(geo, mat);

// after
const curve = new THREE.EllipseCurve(0, 0, size, size, 0, 2 * Math.PI, false, 0);
const points = curve.getPoints(16);
mesh = createClosedLine(points.map(p => new THREE.Vector3(p.x, p.y, 0)), mat);
```

`geo` may be declared with `let geo: THREE.BufferGeometry;` in the cursor switch. If
the centre branch no longer assigns it, keep the declaration only if other branches use
it; otherwise remove the now-unused declaration. Run typecheck to confirm.

**Step 3: Complete the missing dash distances**

At the note separator (`Viewer.ts` around line 4420):

```ts
// before
const sepLine = new THREE.Line(sepGeo, mat);
group.add(sepLine);

// after
const sepLine = new THREE.Line(sepGeo, mat);
sepLine.computeLineDistances();
group.add(sepLine);
```

**Step 4: Prove no production LineLoop remains and run the gates**

```powershell
Get-ChildItem -Recurse -Filter *.ts src | Select-String -Pattern "new THREE\.LineLoop" | ForEach-Object { "$($_.Path):$($_.LineNumber)" }
npm test
npm run typecheck
npm run lint
```

Expected: the search returns no matches; unit and typecheck pass; lint has 0 errors.

**Step 5: Prove WebGL pixels did not change**

With the dev server running:

```powershell
$env:WEBCAD_VISUAL=1; npx playwright test zebra.visual edges.visual
```

Expected: 5 zebra and 3 edge visual tests pass.

**Step 6: Commit**

```powershell
git add src/render/Viewer.ts src/render/CursorRenderer.ts
git commit -m "fix(render): Replace LineLoop and complete note dash distances"
```

---

## Task 3: Build the dual-backend audit harness

**Files:**
- Create: `tests/manual/materials-audit.html`
- Create: `tests/manual/materials-audit.ts`
- Create: `tests/manual/capture-materials-audit.mjs`

**Step 1: Create the page**

Create `tests/manual/materials-audit.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="data:," />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WebCAD material audit</title>
    <style>
      html, body { margin: 0; height: 100%; background: #111; color: #eee; font: 13px system-ui, sans-serif; }
      main { display: grid; grid-template-columns: 1fr 1fr; height: 100%; }
      .pane { position: relative; min-width: 0; border-right: 1px solid #333; }
      .pane:last-child { border-right: 0; }
      canvas { display: block; width: 100%; height: 100%; }
      .tag { position: absolute; left: 10px; top: 10px; z-index: 2; background: #000b; padding: 4px 7px; letter-spacing: .04em; }
      #case { position: fixed; left: 50%; top: 10px; transform: translateX(-50%); z-index: 3; background: #000c; padding: 5px 9px; border: 1px solid #444; }
      #status { position: fixed; left: 10px; bottom: 10px; z-index: 3; max-width: 70vw; white-space: pre-wrap; background: #000c; padding: 6px 8px; color: #9f9; }
      #status.error { color: #f99; }
    </style>
  </head>
  <body>
    <main>
      <div class="pane"><span class="tag">WebGL</span><canvas id="webgl"></canvas></div>
      <div class="pane"><span class="tag">WebGPU</span><canvas id="webgpu"></canvas></div>
    </main>
    <div id="case">case</div>
    <div id="status">booting…</div>
    <script type="module" src="./materials-audit.ts"></script>
  </body>
</html>
```

**Step 2: Create the audit module**

Create `tests/manual/materials-audit.ts` with the following content. Keep all case
construction in this file; do not import `app.ts`.

```ts
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Viewer } from '../../src/render/Viewer'
import { GizmoRenderer } from '../../src/render/GizmoRenderer'
import { Dimension } from '../../src/core/model/Dimension'
import { Note } from '../../src/core/model/Note'
import { Point } from '../../src/core/model/Point'
import { SnapType } from '../../src/core/engine/SnapEngine'
import type { UnitsConfig } from '../../src/core/model/Document'
import type { RendererBackend, RendererSelection } from '../../src/render/RendererBackend'

type CaseName =
  | 'grid'
  | 'snap-endpoint'
  | 'snap-midpoint'
  | 'snap-center'
  | 'snap-intersection'
  | 'snap-perpendicular'
  | 'gizmo'
  | 'dimensions'
  | 'selection'
  | 'lines'
  | 'points-sprites'
  | 'shading'
  | 'note-dashed'

const CASES: CaseName[] = [
  'grid',
  'snap-endpoint',
  'snap-midpoint',
  'snap-center',
  'snap-intersection',
  'snap-perpendicular',
  'gizmo',
  'dimensions',
  'selection',
  'lines',
  'points-sprites',
  'shading',
  'note-dashed',
]

const params = new URLSearchParams(location.search)
const caseName = (params.get('case') ?? 'grid') as CaseName
if (!CASES.includes(caseName)) throw new Error(`Unknown audit case: ${caseName}`)

const errors: string[] = []
window.addEventListener('error', (event) => errors.push(String(event.error ?? event.message)))
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)))
const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  errors.push(args.map(String).join(' '))
  originalConsoleError(...args)
}

const statusEl = document.querySelector<HTMLElement>('#status')!
document.querySelector<HTMLElement>('#case')!.textContent = caseName

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForFont(viewer: Viewer): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (viewer.font) return
    await sleep(50)
  }
  throw new Error('font did not load')
}

function setZoom(viewer: Viewer, zoom: number): void {
  viewer.camera.zoom = zoom
  viewer.camera.updateProjectionMatrix()
}

function addLights(viewer: Viewer): void {
  viewer.scene.add(new THREE.AmbientLight(0xffffff, 1.2))
  const light = new THREE.DirectionalLight(0xffffff, 2)
  light.position.set(100, 100, 200)
  viewer.scene.add(light)
}

function addSelectionSolid(viewer: Viewer): void {
  const geometry = new THREE.BoxGeometry(36, 36, 6)
  const material = new THREE.MeshPhongMaterial({
    color: 0xebf2ff,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData = {
    type: 'Solid3D',
    faceMapping: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    originalColor: 0xebf2ff,
  }

  const group = new THREE.Group()
  group.name = 'audit-solid'
  group.add(mesh)
  viewer.scene.add(group)

  const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-18, -18, 4),
    new THREE.Vector3(18, -18, 4),
    new THREE.Vector3(18, -18, 4),
    new THREE.Vector3(18, 18, 4),
  ])
  const edge = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 }),
  )
  edge.userData = { entityId: 'audit-solid', edgeIndex: 0 }
  group.add(edge)

  viewer.highlightFace('audit-solid', 0)
  viewer.highlightEdge('audit-solid', 0)
  viewer.setSelectionBox({ x: -24, y: -24 }, { x: 24, y: 24 })
}

function seedSnap(viewer: Viewer, type: SnapType, x: number, y: number): void {
  viewer.addLine(-60, 0, 60, 0)
  viewer.addLine(-60, 20, 60, 20)
  viewer.addCircle(0, 0, 25)
  viewer.addLine(-40, -40, 40, 40)
  viewer.setCursor(x, y)
  viewer.setSnapMarker({ x, y, type })
  setZoom(viewer, 3)
}

function seedCase(viewer: Viewer): void {
  viewer.setTheme('dark')
  viewer.updateGrid(20, true)
  addLights(viewer)

  switch (caseName) {
    case 'grid':
      viewer.setAxesVisible(true)
      setZoom(viewer, 1.7)
      break

    case 'snap-endpoint':
      seedSnap(viewer, SnapType.ENDPOINT, -60, 0)
      break

    case 'snap-midpoint':
      seedSnap(viewer, SnapType.MIDPOINT, 0, 20)
      break

    case 'snap-center':
      seedSnap(viewer, SnapType.CENTER, 0, 0)
      break

    case 'snap-intersection':
      seedSnap(viewer, SnapType.INTERSECTION, 0, 0)
      break

    case 'snap-perpendicular':
      seedSnap(viewer, SnapType.PERPENDICULAR, 20, 0)
      break

    case 'gizmo': {
      const gizmo = new GizmoRenderer()
      const root = gizmo.build()
      gizmo.translateGroup.position.x = -35
      gizmo.rotateGroup.position.x = 35
      root.scale.setScalar(0.8)
      viewer.scene.add(root)
      setZoom(viewer, 2.2)
      break
    }

    case 'dimensions': {
      const units: UnitsConfig = { type: 'decimal', precision: 2, scale: 1 }
      const linear = new Dimension('dim-linear', 'LINEAR', -70, -30, 10, -30, 22)
      const aligned = new Dimension('dim-aligned', 'ALIGNED', 15, -25, 65, 15, 16)
      const angular = new Dimension('dim-angular', 'ANGULAR', -40, 10, -10, 40, 0)
      angular.properties = { vertex: { x: -20, y: 0 } }
      angular.dimLineLocation = { x: 20, y: 20 }
      const radius = new Dimension('dim-radius', 'RADIUS', 40, 25, 55, 25, 0)
      const diameter = new Dimension('dim-diameter', 'DIAMETER', -55, 35, -35, 35, 0)
      for (const dim of [linear, aligned, angular, radius, diameter]) {
        viewer.addDimension(dim, units)
      }
      setZoom(viewer, 1.8)
      break
    }

    case 'selection':
      addSelectionSolid(viewer)
      setZoom(viewer, 2.4)
      break

    case 'lines': {
      viewer.addLine(-60, -30, 60, -30)
      viewer.addLine(-60, -10, 60, -10, 'dash', undefined, undefined, true, 'DASHED')
      viewer.addCircle(0, 20, 15)
      const overlayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-60, 40, 0),
        new THREE.Vector3(60, 40, 0),
      ])
      const overlay = new THREE.Line(
        overlayGeometry,
        new THREE.LineBasicMaterial({
          color: 0xffaa00,
          transparent: true,
          opacity: 0.45,
          depthTest: false,
          depthWrite: false,
        }),
      )
      overlay.renderOrder = 5
      viewer.scene.add(overlay)
      setZoom(viewer, 1.8)
      break
    }

    case 'points-sprites':
      viewer.addPoint(40, 20, 'audit-point')
      viewer.addTemporaryEntity(new Point('audit-preview-point', -20, 20))
      setZoom(viewer, 4)
      break

    case 'shading': {
      const modes = ['SHADED', 'BLINN', 'WIREFRAME'] as const
      modes.forEach((mode, index) => {
        viewer.setShadingMode(mode)
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(10, 32, 16),
          viewer.getMeshMaterial(0xebf2ff),
        )
        mesh.position.set((index - 1) * 30, 0, 0)
        viewer.scene.add(mesh)
      })
      setZoom(viewer, 2.5)
      break
    }

    case 'note-dashed':
      viewer.addNote(
        new Note('audit-note-free', null, { x: -40, y: -20 }, { x: 20, y: 20 }, 'Free note', 4),
      )
      viewer.addNote(
        new Note('audit-note-target', 'audit-solid', { x: 0, y: -10 }, { x: 40, y: 30 }, 'Target note', 4),
      )
      setZoom(viewer, 2)
      break
  }

  viewer.render()
}

function sceneCounts(viewer: Viewer) {
  const counts = { lineLoops: 0, lines: 0, points: 0, sprites: 0, meshes: 0 }
  viewer.scene.traverse((object) => {
    const candidate = object as THREE.Object3D & { isLineLoop?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean; isMesh?: boolean }
    if (candidate.isLineLoop) counts.lineLoops++
    if (candidate.isLine) counts.lines++
    if (candidate.isPoints) counts.points++
    if (candidate.isSprite) counts.sprites++
    if (candidate.isMesh) counts.meshes++
  })
  return counts
}

function mergeCounts(a: ReturnType<typeof sceneCounts>, b: ReturnType<typeof sceneCounts>) {
  return {
    lineLoops: a.lineLoops + b.lineLoops,
    lines: a.lines + b.lines,
    points: a.points + b.points,
    sprites: a.sprites + b.sprites,
    meshes: a.meshes + b.meshes,
  }
}

async function main(): Promise<void> {
  const webglCanvas = document.querySelector<HTMLCanvasElement>('#webgl')!
  const webgpuCanvas = document.querySelector<HTMLCanvasElement>('#webgpu')!

  const webglViewer = new Viewer(webglCanvas)

  const gpuRenderer = new WebGPURenderer({ canvas: webgpuCanvas, antialias: true })
  await gpuRenderer.init()
  gpuRenderer.outputColorSpace = THREE.SRGBColorSpace
  gpuRenderer.shadowMap.enabled = true
  gpuRenderer.shadowMap.type = THREE.PCFSoftShadowMap
  const selection: RendererSelection = {
    renderer: gpuRenderer as unknown as RendererBackend,
    kind: 'webgpu',
    requested: 'webgpu',
    fellBack: false,
    reason: 'manual material audit',
  }
  const webgpuViewer = new Viewer(webgpuCanvas, selection)

  await Promise.all([waitForFont(webglViewer), waitForFont(webgpuViewer)])
  seedCase(webglViewer)
  seedCase(webgpuViewer)

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  await sleep(500)

  const counts = mergeCounts(sceneCounts(webglViewer), sceneCounts(webgpuViewer))
  const audit = {
    ready: true,
    case: caseName,
    backends: { webgl: webglViewer.rendererInfo.kind, webgpu: webgpuViewer.rendererInfo.kind },
    errors,
    counts,
  }
  ;(window as unknown as { __materialsAudit: typeof audit }).__materialsAudit = audit

  statusEl.classList.toggle('error', errors.length > 0)
  statusEl.textContent = errors.length > 0 ? errors.slice(0, 4).join('\n') : 'ready'
}

main().catch((error) => {
  console.error(error)
  statusEl.classList.add('error')
  statusEl.textContent = String(error)
  ;(window as unknown as { __materialsAudit: unknown }).__materialsAudit = {
    ready: false,
    case: caseName,
    backends: {},
    errors: [...errors, String(error)],
    counts: { lineLoops: -1, lines: 0, points: 0, sprites: 0, meshes: 0 },
  }
})
```

**Step 3: Create the capture script**

Create `tests/manual/capture-materials-audit.mjs`:

```js
import { chromium } from 'playwright'
import fs from 'node:fs'

const CASES = [
  'grid',
  'snap-endpoint',
  'snap-midpoint',
  'snap-center',
  'snap-intersection',
  'snap-perpendicular',
  'gizmo',
  'dimensions',
  'selection',
  'lines',
  'points-sprites',
  'shading',
  'note-dashed',
]

const OUT = 'docs/verification/materials-audit'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu'],
})

const failures = []

for (const name of CASES) {
  const page = await browser.newPage({
    viewport: { width: 1520, height: 820 },
    deviceScaleFactor: 1,
  })
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('Failed to load resource')) return
    consoleErrors.push(text)
  })

  try {
    await page.goto(`http://localhost:5173/tests/manual/materials-audit.html?case=${name}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction(
      () => window.__materialsAudit?.ready === true,
      undefined,
      { timeout: 30_000 },
    )
    const audit = await page.evaluate(() => window.__materialsAudit)

    if (audit.backends.webgl !== 'webgl') throw new Error(`WebGL pane is ${audit.backends.webgl}`)
    if (audit.backends.webgpu !== 'webgpu') throw new Error(`WebGPU pane is ${audit.backends.webgpu}`)
    if (audit.counts.lineLoops !== 0) throw new Error(`found ${audit.counts.lineLoops} LineLoop objects`)

    const unsupported = [...audit.errors, ...consoleErrors].filter((text) =>
      /not supported|validation|WebGPU/i.test(text),
    )
    if (unsupported.length > 0) throw new Error(unsupported.join('\n'))

    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log(`${name}: ok ${JSON.stringify(audit.counts)}`)
  } catch (error) {
    failures.push(`${name}: ${String(error)}`)
    console.error(`${name}: FAILED ${String(error)}`)
  } finally {
    await page.close()
  }
}

await browser.close()

if (failures.length > 0) {
  console.error(`\n${failures.length} case(s) failed:\n${failures.join('\n')}`)
  process.exit(1)
}

console.log(`\n${CASES.length} cases captured to ${OUT}`)
```

**Step 4: Run one case and fix harness errors**

With the dev server running:

```powershell
node tests/manual/capture-materials-audit.mjs
```

Expected: all 13 cases capture, `lineLoops: 0`, both backend kinds correct. If a case
fails, read the reported console/page error and fix the harness only; do not weaken the
backend, LineLoop, or unsupported-object assertions.

**Step 5: Commit the harness**

```powershell
git add tests/manual/materials-audit.html tests/manual/materials-audit.ts tests/manual/capture-materials-audit.mjs
git commit -m "test(render): Add the WebGL/WebGPU material audit harness"
```

---

## Task 4: Capture the evidence and write the report

**Files:**
- Create: `docs/verification/materials-audit.md`
- Create: `docs/verification/materials-audit/*.png` (13 files)

**Step 1: Capture all cases**

With `npm run dev` running:

```powershell
node tests/manual/capture-materials-audit.mjs
```

Expected: 13 `ok` lines and a final `13 cases captured` line. The PNGs are written under
`docs/verification/materials-audit/`.

**Step 2: Inspect every pair**

Open each PNG and compare the panes. For each case record one of:

- `same` — no visible difference beyond antialiasing.
- `fixed` — this ticket changed production code; name the file and change.
- `deferred` — a difference that needs #169/#171; name the follow-up and reason.

Do not mark a case `same` without looking at the image. Pay particular attention to:

- grid lines and sprite labels;
- all five snap markers, especially the centre circle;
- gizmo shafts, cones, and rings;
- dimension arrows, text, and dashes;
- face and edge highlight, selection box, and z-fighting;
- point size and sprite scale;
- dashed note leader, shelf, and separator.

**Step 3: Apply the fix policy**

If a pair shows a **backend-specific, material-local, low-risk** difference:

1. Add a focused failing test or a semantic assertion that captures it.
2. Fix the production code.
3. Re-run the capture for the affected case and the full gate set.
4. Mark the row `fixed` and describe the change.

If it is pre-existing on both backends, needs the renderer swap, or needs picking or
feature work, mark it `deferred`, name the ticket, and do not change production code.
Never loosen the harness to make a difference disappear.

**Step 4: Write the report**

Create `docs/verification/materials-audit.md` with this exact structure:

1. **Title and environment:** three r185, Windows, headed Chromium with
   `--enable-unsafe-webgpu`; WebGL is the classic `WebGLRenderer` via `Viewer`; WebGPU
   is `WebGPURenderer` passed into `Viewer` through `RendererSelection`; reproduction
   is `npm run dev`, then `node tests/manual/capture-materials-audit.mjs`.
2. **Results table:** columns `Case | Family / aid | WebGL | WebGPU | Action`, one row
   for each of the 13 cases in `CASES` order. Use the observed outcome from Step 2.
3. **Grid:** what the grid, axes, origin dot, and labels look like on each backend.
4. **Snap markers:** one sentence per snap type, calling out the centre marker.
5. **Gizmo:** shafts, cones, rings, centre handle, transparency, depth behaviour.
6. **Dimension lines:** arrows, text, extension lines, and dashes.
7. **Selection highlight:** face fill, edge colour, selection box, z-fighting.
8. **Fixes:** each production change, with file references and the case that proves it.
9. **Deferred:** at minimum the WebGPU `EdgeLayer` provider (`Line2NodeMaterial`) for
   #169, plus any other deferred difference and its reason.
10. **Limits:** headed-only WebGPU, no CI capture, antialiasing/rasterisation
    differences, and the directly-seeded selection solid.

Link images as `[grid](materials-audit/grid.png)` rather than embedding them. Do not
leave a row or section unfilled.

**Step 5: Commit the evidence**

```powershell
git add docs/verification/materials-audit.md docs/verification/materials-audit
git commit -m "docs(render): Record the WebGPU stock material audit"
```

---

## Task 5: Full verification, docs, and ticket close-out

**Files:**
- Modify: `docs/plans/rendering_roadmap.md` (Phase 4 note only)
- Modify: `.superpowers/sdd/2026-10-20-webcad-167/progress.md` (local, ignored)

**Step 1: Run the full gate set**

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npx playwright test
$env:WEBCAD_VISUAL=1; npx playwright test zebra.visual edges.visual
node tests/manual/capture-materials-audit.mjs
```

Expected:

- Unit: all pass, including the 3 new helper tests.
- Typecheck: no errors.
- Lint: 0 errors.
- Build: succeeds; inspect `dist/assets` to confirm the audit harness is absent.
- Full Playwright: same pass/skip counts as before #167 (78 passed / 11 skipped), 0
  unexpected.
- Targeted visual: 5 zebra + 3 edges pass.
- Capture: 13 cases, both backend kinds, `lineLoops: 0`, no unsupported/validation
  errors.

**Step 2: Update the roadmap**

In `docs/plans/rendering_roadmap.md`, Phase 4, add a short note:

```markdown
- Stock materials audited on both backends (#167): `LineLoop` replaced with closed
  lines, note separator dash distances completed. WebGPU `EdgeLayer` remains part of
  the swap (#169).
```

Do not claim WebGPU is wired; the default remains WebGL.

**Step 3: Update the local ledger**

Record in `.superpowers/sdd/2026-10-20-webcad-167/progress.md`:

- commands run and their results;
- the 13 case outcomes and any fixes/deferrals;
- commit hashes;
- the Plane comment/state IDs.

**Step 4: Commit and push**

```powershell
git add docs/plans/rendering_roadmap.md
git commit -m "docs(render): Note the completed stock material audit"
git push origin dev
```

**Step 5: Update Plane #167**

Use the workspace token from `plane-secret-key.csv` without printing it:

1. Post a comment with the commit range, case count, gate results, and deferrals.
2. Move #167 to Done.

Do not echo the token. Confirm the final state from the API response without printing
the secret.

---

## Review Focus

| Failure mode | Owning task | Guard |
|---|---|---|
| Empty/single-point closed line produces NaN or throws | Task 1 | Empty-list test; helper returns empty geometry |
| Dashed note separator still renders solid | Task 2 | `computeLineDistances()` + `note-dashed` screenshot |
| WebGPU pane silently falls back to WebGL | Task 3 | Capture asserts `backends.webgpu === 'webgpu'` |
| Harness leaks into the production bundle | Task 5 | Build; harness stays under `tests/manual` |
| Screenshot taken before font or WebGPU frame | Task 3 | `waitForFont`, two rAFs, 500 ms settle, capture re-check |
