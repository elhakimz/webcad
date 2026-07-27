# End-to-end tests

## The test bridge

The viewport is a single `<canvas>`. Playwright can click pixels and take
screenshots, but it cannot ask "is the front face selected?" or "did OSNAP fire?".
So the app exposes a semantic API for tests to talk to:

- App side: [`src/testing/TestBridge.ts`](../../src/testing/TestBridge.ts), attached
  as `window.__webcadTest`.
- Test side: [`bridge.ts`](./bridge.ts) — a typed `CadBridge` wrapper over
  `page.evaluate`, plus `cad.input` for the few cases that need real mouse events.

The bridge only reads and calls into the existing managers. It reimplements no
picking, geometry, or selection logic, so if the bridge and the UI ever disagree,
that is a bug in the bridge.

It is installed in dev builds, and in any build loaded with `?testBridge=1`.
Production builds without that flag never construct it.

## Writing a test

```ts
import { CadBridge } from './bridge';

const cad = await CadBridge.boot(page);      // waits for kernel + first frame
await cad.setView('orthogonal');
await cad.runOk('BOX', '-50,-50', '50,50', '100');

const solid = await cad.onlySolid();
expect(solid.vertices).toBe(8);
expect(solid.bbox).toEqual({ min: [-50, -50, 0], max: [50, 50, 100] });
```

Every call resolves only once the kernel and the renderer are idle, so tests do not
need `waitForTimeout`.

### What is available

| Area | Calls |
| --- | --- |
| Readiness | `whenReady`, `whenIdle`, `isIdle`, plus `webcad:ready` / `webcad:idle` DOM events |
| Camera | `getCameraState`, `setView`, `orbit`, `zoom`, `zoomToFit`, `pan` |
| Coordinates | `worldToScreen`, `screenToWorld`, `getCanvasRect`, `isClickable` |
| Scene graph | `listObjects`, `getObject`, `getBoundingBox`, `getVertices`, `getEdges`, `getFaces` |
| Kernel truth | `checkValidity`, `expectValid`, `syncToKernel` |
| Selection | `selectObject`, `selectFace`, `selectEdge`, `clearSelection`, `getSelection`, `pickAt` |
| Commands | `run`, `runOk`, `pressEnter`, `getCommandLog` |
| Drafting aids | `getSnapState`, `moveCursor`, `moveCursorToWorld`, `getDraftingSettings`, `setDrafting` |

`run('BOX', '-50,-50', '50,50', '100')` walks the same path as typing each of those
lines into the Command: line — echo, feed the active command, fall back to starting
one, print the result — so assertions on `output` are assertions about what a user
would see. Use `pressEnter()` for a bare Enter (accepting a default, ending a
multi-select step).

### Asking the kernel, not the tessellation

Vertex and face counts describe the *triangle soup the viewport draws from*. They say
nothing about whether the solid is sound. `checkValidity()` asks OpenCascade directly
and, just as importantly, compares the kernel's face count against the model's:

```ts
await cad.expectValid(id);   // throws with the kernel's own reason if unsound or drifted
```

There are two representations of every solid — the B-rep in the worker's shape cache
and the tessellation in the document — and they drift independently. A `faceCountMatches`
failure means the viewport is showing geometry the kernel no longer holds, which is the
failure mode behind #20 / #138.

`checkValidity()` deliberately does **not** load the entity's `brepSnapshot` into the
worker first. Re-importing would guarantee a hit and make the check meaningless; the
point is to report the kernel's real state, including `inKernel: false` — a document
holding a solid the kernel has never heard of, so the next boolean or fillet would fail.
Call `syncToKernel(id)` explicitly if a test wants the shape pushed in. (The
`inKernel: false` path was verified manually by clearing the worker cache mid-session;
there is no fault-injection API for it yet.)

### Real mouse input

Use `cad.input` only when the event handling *is* the thing under test — drag
thresholds, modifier keys, box-select. Coordinates always come from bridge queries,
never from a screenshot:

```ts
await cad.input.dragSelect([240, 240, 0], [460, 360, 0]);
await cad.input.clickObject(id);   // aims at the bbox centre, verified with pickAt first
```

`cad.input` refuses to click a point that is off screen or covered by UI chrome — the
command log and the docked panes are painted over the lower and right parts of the
canvas, and a mouse event there never reaches the viewport.

### Things the app genuinely cannot do

These throw a `BridgeCallError` with `code: 'unsupported'` rather than returning a
plausible-looking wrong answer. Assert on them with `expectRejection`:

- `selectVertex` — there is no vertex selection model. Solids expose face and edge
  sub-selection; 2D entities are edited through grips.
- `setProjection('perspective')` — the renderer holds one `THREE.OrthographicCamera`.
  The `PERSPECTIVE_*` presets are angled orthographic views.
- `screenToWorld(..., planeZ)` from an edge-on view — in FRONT/BACK/LEFT/RIGHT the
  camera looks along the `z = k` planes, so a pixel maps to a whole line, not a point.

## Suites

| File | Covers |
| --- | --- |
| `camera.spec.ts` | view presets, orbit, zoom, zoom-to-fit, coordinate round-trip |
| `selection.spec.ts` | object/face/edge selection, `pickAt`, real drag-select |
| `commands.spec.ts` | command execution, geometry read-back, command log |
| `snap.spec.ts` | OSNAP capture and drafting-aid toggles |
| `visual.spec.ts` | canvas screenshots — opt-in, see below |
| `ui.spec.ts`, `grip_edit.spec.ts`, `toolbars.spec.ts`, `uat.spec.ts` | older DOM-driven specs built on `helpers.ts` |

## Running

```bash
npx playwright test --workers=2
```

Two workers is deliberate: each page boots an OpenCascade WASM kernel and a WebGL
context that headless Chromium rasterises in software, which is CPU-bound. On a
16-core box, four workers made most pages miss `domcontentloaded` entirely.

Visual tests are opt-in, because software rasterisation differs between machines:

```bash
WEBCAD_VISUAL=1 npx playwright test visual --update-snapshots
```

## Known defect covered here

`commands.spec.ts` carries a `test.fail()` case: **UNDO reports success but reverts
nothing.** `App.handleResult` brackets every dispatched action in
`startTransaction(doc.constraints)` / `commitTransaction(doc.constraints)`;
`startTransaction` stores the constraints array (empty, but an array, so non-null)
and `commitTransaction` pushes whenever that field is non-null — even with zero
records. Finishing a command therefore pushes an empty transaction, and UNDO pops
that empty entry while pushing another in its place, so the stack cycles
`[ADD, TRANSFORM+ADD, EMPTY]` → `[ADD, TRANSFORM+ADD, EMPTY]` and never advances.
`commitTransaction` also clears the redo stack, so REDO is dead as well.

The test is marked `test.fail()` so the suite stays green while the defect stands and
turns red the moment it is fixed.
