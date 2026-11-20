# WEBCAD-169 — Phase D1: real WebGPU viewport behind an opt-in flag

**Status:** approved 2026-10-20
**Ticket:** WEBCAD-169 (parent epic WEBCAD-171, “Rendering — WebGL to WebGPU Migration”)
**Predecessors:** WEBCAD-161/162/170 (renderer seam and selection), WEBCAD-167 (material
audit), WEBCAD-174 (backend-neutral fat-line edge layer).

## Goal

Run the actual viewport — the document scene, the grid, the fat-line edge outlines — on
`WebGPURenderer` when the user opts in with `?renderer=webgpu`. WebGL remains the default
and the only path used by normal boots until D2 and D3 pass. A WebGPU request that cannot
be honoured must say so, draw on WebGL, and never leave a silently frozen viewport.

## Non-goals

- Shadows, clipping planes, GPU picking, plot capture, and the full parity sweep are D3 /
  WEBCAD-171.
- Deleting or rewriting the WebGL path.
- Automatic recovery from device loss. A canvas cannot change context type in place, and
  autosave is debounced, so a reload could lose work. Device loss is a visible degraded
  state instead.

## Constraints found in the existing code

1. **One context per canvas.** `HTMLCanvasElement.getContext()` returns the existing context
   type. The backend decision must therefore happen before `new Viewer()`; a WebGPU →
   WebGL swap in place is not possible without replacing the canvas and rewiring every UI
   listener.
2. **`WebGPURenderer.init()` is async** and internally falls back to `WebGLBackend` when
   WebGPU is unavailable. The factory must inspect `renderer.backend.isWebGLBackend` after
   `init()` and report/fallback honestly rather than trusting the class name.
3. **Fat lines differ.** WebGPU uses `Line2NodeMaterial` and
   `three/examples/jsm/lines/webgpu/LineSegments2.js`. It has no `setResolution()`; the
   shader reads the renderer viewport. The provider still tracks resolution for `getInfo()`.
4. **WebGPU supports point primitives only at 1 physical pixel.** `PointsMaterial` with a
   fixed screen size renders nothing on r185. `PointsNodeMaterial` used with a `Sprite`
   supports a real size. Three’s sprite path gives the quad a world size from the object;
   the point marker helper sets the sprite scale to zero so only the screen-space size
   remains.
5. **The test bridge’s idle cap is deliberate.** `framePending()` stops waiting after
   250 ms because rAF stops in a background tab. D1 must leave that behaviour intact.

## Design

### 1. Boot and backend selection

`src/main.ts` becomes:

```ts
const canvas = document.getElementById("c") as HTMLCanvasElement
const selection = await createRenderer(canvas)
const viewer = new Viewer(canvas, selection)
console.info(`[renderer] ${selection.kind} — ${selection.reason}`)
```

The old fire-and-forget `chooseRenderer().then(setRendererChoice)` probe is removed. The
selection is complete before the viewer exists, so `Viewer` never needs a mutable “probe
landed later” path.

`createRenderer(canvas, requested, builders?)`:

- calls `chooseRenderer(requested)`;
- if the choice is WebGL, builds `createWebGLRenderer(canvas)` synchronously;
- if the choice is WebGPU, dynamically imports `WebGPURendererFactory`, awaits
  `createWebGPURenderer(canvas)`, and returns it;
- on any WebGPU build/init failure, builds the WebGL renderer and returns
  `kind: 'webgl', fellBack: true` with the failure message in `reason`;
- if the WebGL fallback itself fails, throws an error containing both failures.

The optional `builders` argument exists only so unit tests can substitute a fake WebGL
backend and a rejecting WebGPU builder without a GPU.

`createWebGPURenderer(canvas)`:

1. constructs `new WebGPURenderer({ canvas, antialias: true })`;
2. applies `SRGBColorSpace`, `shadowMap.enabled`, `PCFSoftShadowMap`;
3. `await renderer.init()`;
4. if `renderer.backend.isWebGLBackend` is true, disposes and throws “three fell back to
   its WebGL2 backend” — the outer factory then records a real WebGL fallback;
5. registers the WebGPU edge provider;
6. wraps `renderer.onDeviceLost` so the original handler still runs and a
   `webcad:device-lost` `CustomEvent` is dispatched with `{ api, message, reason }`;
7. returns the renderer.

`?renderer=webgl` stays available to force the fallback path on a WebGPU-capable machine.

### 2. WebGPU edge layer

`src/render/WebGPUEdgeLayer.ts` mirrors the WebGL provider:

- `LineSegmentsGeometry` with `setPositions()` and `setColors(buildEdgeColors(...))`;
- `Line2NodeMaterial({ linewidth, vertexColors: true, worldUnits: false, depthTest: true,
  depthWrite: false })`;
- `LineSegments2` from the `lines/webgpu` path, named `edgeOutline`;
- `setSelected()` writes into the existing `instanceColorStart` interleaved buffer, exactly
  like the WebGL path, so hover does not allocate;
- `setResolution()` stores the drawing-buffer size for `getInfo()` (the node shader reads the
  viewport itself);
- `getInfo()` reports `material.type`, width, edge/segment counts, selection, and resolution.

The factory is registered only after a real WebGPU renderer initialises. Selecting WebGPU
without registration still throws the existing explicit error.

### 3. DPR and resize

`RendererBackend` gains `setPixelRatio(value)` and `getPixelRatio()`. `Viewer.resize()`:

```ts
const dpr = Math.min(window.devicePixelRatio || 1, 2)
if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr)
this.renderer.setSize(w, h)
```

The cap prevents a 3× or 4× phone from quadrupling fill cost. Existing window and
`ResizeObserver` paths stay. A `matchMedia('(resolution: Ndppx)')` listener updates the
query and calls `resize()` when the monitor/zoom changes DPR. Fat-line resolution still uses
`canvas.width/height` (the drawing buffer).

### 4. Device loss

`Viewer` owns the degraded-state policy:

- listen for `webcad:device-lost`;
- on the first event set `deviceLost = true`, replace `rendererInfo.reason` with the loss
  message, log it, and show a persistent error toast:
  “WebGPU device lost. Rendering stopped; reload with `?renderer=webgl` to continue.”;
- `scheduleRender()` and `renderNow()` return immediately while lost;
- `captureImage()` therefore returns the last frame rather than issuing a draw against a
  dead device;
- the test bridge exposes `deviceLost` and a `destroyRendererDevice()` hook that calls
  `renderer.backend.device.destroy()`, exercising the real callback.

`NotificationManager.show()` treats `duration <= 0` as persistent instead of scheduling an
immediate removal.

### 5. Point markers

`src/render/PointMarker.ts` exports `createScreenSpacePoint({ color, size, map?, transparent?,
alphaTest? })`:

- `PointsNodeMaterial` with `sizeAttenuation: false`;
- `THREE.Sprite` with `scale.set(0, 0, 1)` — the sprite quad contributes no world size, so
  `size` is the whole marker;
- `frustumCulled = false` and a no-op `raycast`, since the marker is display-only;
- used by `GridRenderer` (origin dot, size 6), `Viewer.addPoint()` and the point preview
  (size 12, X texture).

Scene teardown adds `THREE.Sprite` to the disposal checks so marker materials/textures do not
leak.

### 6. Tests and evidence

Unit:

- `chooseRenderer()` returns WebGPU when an adapter exists.
- `createRenderer()` falls back with the init error in `reason`; a WebGPU success keeps
  `fellBack: false`.
- WebGPU edge provider: material type, segment/edge counts, selection colour buffer,
  resolution tracking.
- Point marker: sprite + `PointsNodeMaterial`, size, zero scale, map/alpha settings.

Playwright (default, WebGL):

- default boot still reports WebGL with no fallback;
- forced `?renderer=webgpu` with `navigator.gpu` removed reports a WebGL fallback and still
  draws/validates a box;
- DPR 2 boot has a drawing buffer at 2× the CSS rect;
- viewport resize updates the drawing buffer and camera;
- stopping rAF leaves the test bridge idle (250 ms cap) instead of hanging.

Playwright (opt-in, `WEBCAD_WEBGPU=1`, headed Chromium with `--enable-unsafe-webgpu`):

- `?renderer=webgpu` reports the real backend and no fallback;
- a box renders, its edge outline reports `Line2NodeMaterial`, and the viewport screenshot is
  captured under `docs/verification/webgpu-d1/`;
- resize keeps the drawing buffer in step;
- destroying the device flips `deviceLost`, stops frames, and shows the persistent toast.

The WEBCAD-167 manual material audit is re-run for `grid` and `points-sprites`, writing to
`docs/verification/webgpu-d1/materials/`, to show the origin dot and X markers now survive on
both backends.

## Acceptance mapping

| WEBCAD-169 acceptance | Evidence |
| --- | --- |
| WebGPU renders the document scene in the real canvas | opt-in e2e box + screenshot |
| WebGL remains the default | default e2e backend assertion |
| Device loss is visible and degrades, never silently freezes | opt-in device-loss e2e + toast |
| Resize / DPR / tab-hidden / idle do not regress | DPR, resize, rAF-stopped e2e |
| Edge provider seam is wired | `getEdgeOutlineInfo().materialType === 'Line2NodeMaterial'` |
| Point markers do not disappear on WebGPU | point unit test + material audit capture |

## Risks and mitigations

- **Internal WebGL fallback:** detected via `backend.isWebGLBackend`; the outer selection then
  reports a real WebGL fallback. If the canvas already holds a WebGPU context and init fails,
  the WebGL fallback may also fail; the error names both failures and the user can reload
  with `?renderer=webgl`.
- **Node-material sprite sizing:** the helper zeroes object scale; the visual result is
  checked in the material audit on both backends.
- **Device loss is destructive:** the test bridge hook is the only caller; production only
  reacts to the browser’s event.
- **Bundle weight:** `three/webgpu` is already statically imported by the zebra material, so
  the renderer factory adds little. The dynamic import still keeps the factory itself out of
  the critical path.
