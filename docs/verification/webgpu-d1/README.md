# WEBCAD-169 — Phase D1 evidence

**Status:** complete on `dev` (2026-10-20)
**Parent epic:** WEBCAD-171 — Rendering: WebGL to WebGPU migration
**Spec:** `docs/superpowers/specs/2026-10-20-webgpu-d1-design.md`
**Plan:** `docs/superpowers/plans/2026-10-20-webgpu-d1.md`

## What changed

- `createRenderer()` now builds and awaits the real `WebGPURenderer` when the
  `?renderer=webgpu` request is honoured. WebGL is still the default.
- The factory detects three's silent internal `WebGLBackend` fallback and reports
  a real WebGL fallback instead of claiming WebGPU.
- The WebGPU fat-line edge provider is wired through
  `registerWebGPUEdgeLayerFactory()`; a solid's outline reports
  `Line2NodeMaterial`.
- Device loss logs, updates `rendererInfo.reason`, shows a persistent error toast,
  and stops the frame loop. There is no auto-reload, because autosave is
  debounced and a reload can lose work.
- The viewer caps DPR at 2 and re-arms a `resolution` media query on change.
  Resize, DPR, tab-hidden idle behaviour, and the test bridge's 250 ms frame-age
  cap are covered by tests.
- Point markers now use a per-marker `Sprite` + `PointsNodeMaterial` instead of
  `PointsMaterial`, which WebGPU renders at only one pixel. The per-marker quad
  is deliberate: three shares one Sprite geometry across every sprite and every
  renderer, and the dual-renderer material audit showed that a shared buffer can
  be disposed while the other backend is still submitting.

## Gates

| Gate | Result |
| --- | --- |
| `npm test` | 369 passed / 369 |
| `npm run typecheck` | clean |
| `npm run build` | succeeded; `WebGPURendererFactory` is its own chunk |
| `npm run lint` | 0 errors (warnings are pre-existing baseline) |
| `npx playwright test` | 81 passed, 12 skipped, 0 failed |
| `WEBCAD_WEBGPU=1 npx playwright test tests/e2e/webgpu.spec.ts` | 1 passed |
| Material audit (`grid`, `points-sprites`) | 2/2 cases captured on WebGL + WebGPU |

## Evidence

- `viewport.png` — real WebGPU viewport: document box, grid, axes, edge outline,
  ribbon and command line.
- `device-lost.png` — persistent error toast after `GPUDevice.destroy()`;
  `deviceLost` is true and draw statistics do not advance on a further render
  request.
- `materials/grid.png` — origin dot and grid on both backends.
- `materials/points-sprites.png` — document point and point preview (X markers)
  on both backends.

The opt-in test is intentionally not part of the default suite: most CI hosts
have no WebGPU adapter. Run it on a machine with a real device:

```powershell
$env:WEBCAD_WEBGPU=1
npx playwright test tests/e2e/webgpu.spec.ts --workers=1
```

To regenerate the two material-audit cases:

```powershell
$env:AUDIT_CASES='grid,points-sprites'
$env:AUDIT_OUT='docs/verification/webgpu-d1/materials'
node tests/manual/capture-materials-audit.mjs
```

## Not in D1 (WEBCAD-171 / D2-D3)

Shadows, clipping planes, GPU picking, plot capture, and the full visual parity
sweep are still owned by the parent epic. The device-loss state is terminal by
design: recovery is a reload with `?renderer=webgl` or a browser restart, not an
in-place backend swap, because a canvas cannot change context type after a
context exists.
