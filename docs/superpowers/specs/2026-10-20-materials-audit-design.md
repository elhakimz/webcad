# WebGPU Stock Material Audit (WEBCAD-167) — Design

**Status:** approved in brainstorming, awaiting spec review
**Ticket:** WEBCAD-167 — Phase C2, audit the 77 stock material instances
**Predecessor:** WEBCAD-166 (zebra TSL port)
**Successor:** WEBCAD-169 (real viewport on WebGPU behind a flag)

## Problem

The stock material inventory is 77 constructor call sites in seven families:

| Family | Count |
|---|---:|
| `LineBasicMaterial` | 44 |
| `MeshBasicMaterial` | 18 |
| `LineDashedMaterial` | 5 |
| `PointsMaterial` | 3 |
| `MeshPhongMaterial` | 3 |
| `SpriteMaterial` | 2 |
| `MeshStandardMaterial` | 2 |

Three auto-converts stock materials to node materials on WebGPU, but “converts” is not
“looks the same.” The real viewport cannot run on WebGPU yet (#169), so this ticket
must produce both-backend evidence through a test-only harness instead of the shipped
boot path.

A throwaway probe already proved the harness shape works and found a hard gap:
`THREE.LineLoop` is rejected by `WebGPURenderer` r185 with
`Objects of type THREE.LineLoop are not supported`. Seven production call sites and
one cursor marker are affected.

## Goals

1. Render every material family, plus the five user-visible drawing aids named in the
   ticket, on WebGL and WebGPU from the same real `Viewer` scene.
2. Capture a side-by-side screenshot per case and record the result in a committed
   report.
3. Fix confirmed backend regressions that are material-local and low risk.
4. Write up every remaining difference with a reason and a follow-up ticket.

## Non-goals

- Wiring the shipped WebGPU flag, renderer lifecycle, device-lost handling, or async
  boot. Those stay in #169.
- Implementing the WebGPU `EdgeLayer` provider (`Line2NodeMaterial`). #169 owns the
  factory registration; this audit records the gap.
- Pixel-perfect cross-backend comparison. Antialiasing and rasterisation differ; the
  audit is visual plus semantic, not a screenshot gate.
- Changing the default renderer or shipping the harness in the production bundle.

## Decisions

- Use a **real-Viewer dual-pane harness**, not a synthetic material gallery.
- **Fix confirmed regressions only**: `LineLoop` compatibility, the missing
  `computeLineDistances()` call, and any other confirmed low-risk material mismatch.
- **Defer** everything that needs #169 or #171.
- Screenshots live in `docs/verification/materials-audit/`, one combined PNG per case.
- Report is **table-first with linked images**, plus short sections for grid, snap,
  gizmo, dimensions, and selection.
- Keep the full gate set: unit, typecheck, lint, build, full Playwright, targeted
  visual, and a local headed capture with a console-error gate.
- No CI for WebGPU captures; headed Chromium is used locally, matching #166.

## Architecture

### 1. Dual-backend audit page

`tests/manual/materials-audit.html` and `tests/manual/materials-audit.ts`.

The page reads `?case=<name>` and builds two panes:

- **WebGL:** `new Viewer(glCanvas)` — the normal synchronous path.
- **WebGPU:** `new WebGPURenderer({ canvas, antialias: true })`, `await init()`,
  `outputColorSpace = SRGBColorSpace`, `shadowMap` configured as in
  `createWebGLRenderer`, then `new Viewer(gpuCanvas, selection)` with
  `{ kind: 'webgpu', requested: 'webgpu', fellBack: false }`.

Both viewers get the same camera, background, grid, lighting, and case seed. The page
does not import `app.ts` and does not change the shipped boot path.

Readiness is exposed as:

```ts
window.__materialsAudit = {
  ready: boolean,
  case: string,
  backends: { webgl: RendererKind, webgpu: RendererKind },
  errors: string[],
  counts: {
    lineLoops: number,
    lines: number,
    points: number,
    sprites: number,
    meshes: number,
  },
}
```

`errors` collects `window.error`, `unhandledrejection`, and `console.error`.
The page adds a data-URL favicon to avoid a benign 404.

### 2. Case catalog

Common setup for every case: dark theme, grid spacing 20, orthographic TOP camera,
ambient + directional light, and a render wait of two animation frames plus a short
settle.

| Case | Scene |
|---|---|
| `grid` | `updateGrid(20, true)`, axes, origin point, X/Y sprite labels |
| `snap-endpoint` | Reference line; endpoint marker and pickbox at the endpoint |
| `snap-midpoint` | Reference line; midpoint marker at its centre |
| `snap-center` | Reference circle; centre marker (the `LineLoop` path) |
| `snap-intersection` | Two crossing lines; intersection marker |
| `snap-perpendicular` | Reference line and base point; perpendicular marker |
| `gizmo` | `GizmoRenderer.build()`; translate group offset left, rotate group offset right, both visible |
| `dimensions` | Linear, aligned, angular, radius, and diameter `Dimension` entities with arrows and text |
| `selection` | Seeded solid mesh, `highlightFace`, an edge object passed to `highlightEdge`, and `setSelectionBox` |
| `lines` | Solid line, DASHED line, closed circle, transparent overlay, `depthTest:false` overlay |
| `points-sprites` | `addPoint`, point preview, grid sprite labels, point size at a close zoom |
| `shading` | Three spheres built through `getMeshMaterial` in SHADED, BLINN, and WIREFRAME modes |
| `note-dashed` | Untargeted note and targeted note with leader, shelf, and separator lines |

The `selection` case seeds a mesh directly with
`userData = { type: 'Solid3D', entityId, faceMapping, originalColor }` rather than
calling `addSolid3D`, so it does not depend on the deferred WebGPU edge provider.

### 3. Capture script

`tests/manual/capture-materials-audit.mjs` runs locally with headed Chromium
(`--enable-unsafe-webgpu`), a 1520×820 viewport, and a fresh page per case.

For each case it:

1. Navigates to `http://localhost:5173/tests/manual/materials-audit.html?case=<case>`.
2. Waits for `__materialsAudit.ready`.
3. Asserts `backends.webgl === 'webgl'` and `backends.webgpu === 'webgpu'`; a fallback
   fails the capture instead of producing a misleading WebGL-only screenshot.
4. Asserts `counts.lineLoops === 0` and `errors` contains no unsupported-object or
   WebGPU validation message.
5. Screenshots the page to
   `docs/verification/materials-audit/<case>.png`.
6. Prints the case, backend kinds, counts, and error list.

The script does not start Vite; the run instructions require `npm run dev` in another
terminal, as with the zebra parity page. It is not part of `npx playwright test`.

### 4. Fixes

#### `LineLoop` → closed `Line`

Add `src/render/ClosedLine.ts`:

```ts
export function createClosedLine(
  points: readonly THREE.Vector3[],
  material: THREE.Material,
): THREE.Line
```

It appends a clone of the first point and returns `new THREE.Line(...)`. It does not
mutate the input array. Add `src/render/ClosedLine.test.ts` covering type, closure,
vertex count, and input immutability.

Replace every production `new THREE.LineLoop(...)`:

- `Viewer.ts`: preview circle, closed polyline caps, closed polyline body, full-ellipse
  caps/body.
- `CursorRenderer.ts`: centre snap marker.

WebGL renders the same closed shape with `LINE_STRIP`; the seam is visually identical.

#### Missing dash distances

Add `sepLine.computeLineDistances()` where the note separator is created
(`Viewer.ts:4420`), matching the three sibling lines.

#### Policy for other findings

After the capture run, inspect each pair:

- **Fix** if the difference is backend-specific, material-local, and does not require
  #169/#171. Add a targeted test or an audit screenshot that pins it.
- **Document** if it is pre-existing on both backends, needs the renderer swap, or
  needs picking/feature work.
- **Never** hide a difference by loosening the harness.

### 5. Report

`docs/verification/materials-audit.md`:

1. Environment and reproduction commands.
2. One results table: case, family, WebGL, WebGPU, action.
3. Short sections for the five explicitly required items: grid, snap markers, gizmo,
   dimension lines, selection highlight.
4. Fix log with file references.
5. Deferrals with ticket links (`#169` edge provider; any #171 feature gaps).
6. Limits: headed-only WebGPU, no CI, AA differences, seeded selection mesh.

Images are linked from the table, not embedded.

## Verification

Run, in order:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npx playwright test
$env:WEBCAD_VISUAL=1; npx playwright test zebra.visual edges.visual
# with `npm run dev` running:
node tests/manual/capture-materials-audit.mjs
```

Expected:

- Unit: previous 354 plus the new `ClosedLine` tests.
- Typecheck clean.
- Lint 0 errors.
- Build succeeds; production bundle does not include the harness.
- Full Playwright: previous results, 0 unexpected failures.
- Targeted visual: 5 zebra + 3 edges still match; the `LineLoop` change does not alter
  WebGL pixels.
- Capture: 13 cases, both backend kinds, `lineLoops: 0`, no unsupported-object or
  validation errors.

## Risks and limits

- A headed browser is required for WebGPU; the capture cannot run in headless CI.
- Rasterisation differs, so screenshots are reviewed, not diff-gated.
- The seeded solid does not exercise `EdgeLayer`, so edge rendering is explicitly
  deferred to #169 rather than silently marked as passing.
- Two real `Viewer` instances share one document; their global event listeners are
  harmless because the audit does not interact with the panes.
- The harness imports `three/webgpu`; it is test-only and must stay out of `src/`.

## Acceptance mapping

| Ticket requirement | Design response |
|---|---|
| Pass over each material family | 13-case catalog + screenshots |
| Screenshot on both backends | dual-pane PNG per case |
| Differences fixed or written up | fix policy + report action column |
| Grid checked | `grid` case + report section |
| Snap markers checked | five `snap-*` cases + report section |
| Gizmo checked | `gizmo` case + report section |
| Dimension lines checked | `dimensions` case + report section |
| Selection highlight checked | `selection` case + report section |

## Out of scope / follow-ups

- **#169:** WebGPU edge provider (`Line2NodeMaterial`), renderer flag, device-lost,
  resize/DPR/tab-hidden lifecycle.
- **#171:** shadows, clipping, picking, plot capture, overlay textures under the real
  WebGPU backend.
- Pre-existing non-backend quirks found during the audit (for example stale zoom-based
  dash scaling) are recorded, not fixed here.
