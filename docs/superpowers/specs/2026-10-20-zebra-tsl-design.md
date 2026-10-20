# Porting the zebra shader to TSL

**Ticket:** WEBCAD-166 — one zebra definition, backend-neutral
**Date:** 2026-10-20
**Status:** Approved (2026-10-20)

## Problem

Zebra surface analysis is the only custom shader left in the viewport. It is an
inline GLSL `THREE.ShaderMaterial` at `Viewer.ts:99`, shared by every solid when
`SHADING_ZEBRA` is active (`getMeshMaterial('ZEBRA')`, `Viewer.ts:629`).

`ShaderMaterial` does not run under `WebGPURenderer`; three logs
`Material "ShaderMaterial" is not compatible` and substitutes a plain node
material. That makes the zebra mode a hard blocker for WEBCAD-169 and means a
port done after the renderer swap would have no reference to compare against.

The requirement is one zebra definition in the codebase. Keeping a GLSL path as
a fallback would recreate the drift this ticket exists to remove.

## Goals

- One TSL definition of the zebra material; the inline GLSL is deleted.
- Visually identical output on the current WebGL renderer, proved against a
  golden baseline recorded before the port.
- The same material renders under `WebGPURenderer` when #169 lands, proved once
  side by side on a curved solid.
- Leaving ZEBRA restores each solid's original colour (see the `.color` trap).

## Non-goals

- No renderer swap, no async boot, no `?renderer=webgpu` app path — that is
  #169.
- No stripe redesign. Frequency, reflection vector, `0.3` x-weight and hard
  `step` stay exactly as they are.
- No GLSL fallback for browsers where the compatibility handler fails.

## Design

### One module owns the node dependency

`src/render/ZebraMaterial.ts`:

```ts
import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { WebGLNodesHandler } from 'three/examples/jsm/tsl/WebGLNodesHandler.js'
import { normalView, positionView, reflect, sin, step, vec3 } from 'three/tsl'

const ZEBRA_FREQUENCY = 30

export function createZebraMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide })
  material.name = 'ZebraSurface'

  const incident = positionView.normalize()
  const reflected = reflect(incident, normalView)
  const signal = sin(
    reflected.y.add(reflected.x.mul(0.3)).mul(ZEBRA_FREQUENCY),
  )
  material.colorNode = vec3(step(0, signal))

  return material
}

export function enableNodeMaterials(renderer: THREE.WebGLRenderer): void {
  renderer.setNodesHandler(new WebGLNodesHandler())
}
```

Why these pieces:

- `MeshBasicNodeMaterial` is the unlit node material; the current shader is
  unlit and the skill reference maps `ShaderMaterial` (unlit) to it.
- `positionView` is the fragment's view-space position, so
  `positionView.normalize()` matches `normalize(mvPosition.xyz)` — the incident
  direction of the GLSL's `reflect(-viewDir, normal)`.
  **Do not use `positionViewDirection` here.** The viewport camera is an
  `OrthographicCamera`, and TSL's `positionViewDirection` returns a constant
  `(0,0,1)` for ortho, while the existing GLSL uses the per-fragment vector to
  the camera origin. They look different on the same solid, and the golden diff
  would fail. Preserve the existing math, quirk included.
- `normalView` is the view-space normal, matching
  `normalize(normalMatrix * normal)`.
- `step(0, signal)` reproduces `step(0.0, val)`. The fragment output is only
  ever 0 or 1, so the node pipeline's working→sRGB conversion is a no-op and
  the black/white values match the old raw `gl_FragColor` write.
- `enableNodeMaterials` installs three's compatibility builder on a classic
  `WebGLRenderer`. The handler wraps the renderer in a proxy that supplies the
  node system's `lighting`, so no WebGPU renderer is required.

### Static import is deliberate

`three/webgpu` is imported statically, not lazily. The main chunk grows by the
node renderer (approximately 0.3–0.6 MB minified after tree-shaking), which
#169 will pay anyway when it moves the viewport to `WebGPURenderer`. Lazy
loading would force `setShadingMode` and its callers to become async just to
save a short-lived download.

`three.webgpu.js` imports `three.core.js`, the same module `three.module.js`
uses, so the core is not duplicated.

### Viewer wiring

- Replace the `zebraMaterial: THREE.ShaderMaterial` field with
  `private readonly zebraMaterial = createZebraMaterial()`.
- After `this.renderer = selection?.renderer ?? createWebGLRenderer(canvas)`
  (`Viewer.ts:257`), install the handler:
  `if (this.renderer instanceof THREE.WebGLRenderer) enableNodeMaterials(this.renderer)`.
  A future `WebGPURenderer` is not a `WebGLRenderer`, so it is skipped and node
  materials work natively.
- Delete the inline GLSL shader.
- `getMeshMaterial('ZEBRA')` still returns the shared instance.

### The `.color` trap

`MeshBasicNodeMaterial` has a `color` (default white). Today's `ShaderMaterial`
does not, so `setShadingMode` falls through to `userData.originalColor` when
leaving ZEBRA. After the port, `material.color` exists and the existing branch
would paint every solid white.

The traversal must check the zebra material first:

```ts
const material = obj.material as THREE.Material & { color?: THREE.Color }
let color = 0xebf2ff
if (material === this.zebraMaterial && obj.userData.originalColor !== undefined) {
  color = obj.userData.originalColor
} else if (material.color) {
  color = material.color.getHex()
} else if (obj.userData.originalColor !== undefined) {
  color = obj.userData.originalColor
}
```

### Failure behaviour

No second implementation. If `enableNodeMaterials` throws, the viewer logs the
error once and records that node materials are unavailable; selecting ZEBRA then
shows the existing notification (`NotificationManager`) instead of silently
falling back to GLSL. A shader compilation failure surfaces through three's
console error, which is the signal to fix the material.

## Verification

### Golden master, recorded before the port

Add `tests/e2e/zebra.visual.spec.ts` (opt-in `WEBCAD_VISUAL=1`, like
`edges.visual.spec.ts`) and record four baselines **on the current GLSL build**:

1. Box in ZEBRA.
2. Filleted box in ZEBRA — a curved surface, where a wrong normal transform
   shows immediately.
3. Cylinder in ZEBRA — a second curvature and a top face.
4. Box in ZEBRA → SHADED — pins original-colour restoration before the
   `.color` trap exists.

Then port. The same spec must pass against those baselines with
`maxDiffPixelRatio: 0.01` and no mask. That is the exact-port proof.

### Semantic and unit coverage

- `src/render/ZebraMaterial.test.ts`: the factory returns a
  `MeshBasicNodeMaterial`, `side === DoubleSide`, `colorNode` is set;
  `enableNodeMaterials` calls `setNodesHandler` with a `WebGLNodesHandler`.
- `tests/e2e/zebra.spec.ts`: `getShadingMode()` round-trips through ZEBRA;
  entering and leaving ZEBRA leaves edge outlines present and visible; the
  ZEBRA → SHADED screenshot matches baseline 4.
- Do **not** unit-test a JS re-implementation of the stripe formula. That
  would be a second definition.

### WebGL/WebGPU side by side (manual, local)

Add `tests/manual/zebra-parity.html` + `zebra-parity.ts`: one
`RoundedBoxGeometry`, the same `createZebraMaterial()` per renderer, two
canvases — left `WebGLRenderer` with `enableNodeMaterials`, right
`WebGPURenderer` (awaiting `init()`). The page reports whether the WebGPU
renderer got a real WebGPU backend or three's WebGL 2 fallback.

Run it locally in a headed browser, screenshot both panes, and attach the pair
to #166. The page is not imported by `src/` and is not part of the production
build. There is no CI in this project; this is a local evidence step.

## Risks and contingencies

- **Compatibility handler under headless SwiftShader is unproven.** The first
  visual run answers it. If it fails headless but works on hardware, stop and
  revisit the approach; do not skip the test and call it done.
- **Bundle growth.** Measure `npm run build` before and after; record the delta
  rather than relying on the estimate above.
- **Node material colour management.** Only 0/1 values are emitted, so sRGB
  conversion cannot shift the result. The golden diff proves it.
- **`WebGLNodesHandler` lives in `examples/jsm`.** It is version-pinned by the
  lockfile; a future three bump may move it. The import is isolated to
  `ZebraMaterial.ts`.

## Acceptance mapping

| Requirement | Evidence |
| --- | --- |
| One zebra definition; inline GLSL gone | `grep` finds no `zebraMaterial` GLSL; `ZebraMaterial.ts` is the only definition |
| Identical output on WebGL | Four golden screenshots recorded pre-port pass at ≤1% diff |
| Identical output on WebGPU | Manual parity page screenshot pair on the same solid |
| No regression in other shading modes | Full Playwright suite + ZEBRA → SHADED baseline |
| Edges still visible/selectable in ZEBRA | Existing `edges.spec.ts` plus semantic e2e |
