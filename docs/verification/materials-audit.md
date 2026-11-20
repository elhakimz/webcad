# WebGPU stock material audit (WEBCAD-167)

**Environment:** three r185 (`0.185.1`), Windows 11, headed Chromium launched by
Playwright with `--enable-unsafe-webgpu`, Vite dev server. WebGL is the classic
`WebGLRenderer` built by `Viewer`; WebGPU is a pre-initialised `WebGPURenderer`
passed into a second `Viewer` through `RendererSelection`.

**Reproduction:** run `npm run dev`, then `node tests/manual/capture-materials-audit.mjs`.
The capture script opens one fresh page per case, asserts both backend kinds, asserts
zero `LineLoop` objects, rejects unsupported/validation errors, and writes one combined
PNG per case under `docs/verification/materials-audit/`.

The 13-case catalog exercises all seven stock material families (77 constructor call
sites) and the five user-visible drawing aids. The production default remains WebGL.

## Results

| Case | Family / aid | WebGL | WebGPU | Action |
|---|---|---|---|---|
| [grid](materials-audit/grid.png) | `GridHelper`, `ArrowHelper`, `SpriteMaterial` labels, origin `Points` | Grid, axes, X/Y labels, origin dot | Grid, axes, X/Y labels; origin dot absent | Deferred: `PointsMaterial` (origin dot) |
| [snap-endpoint](materials-audit/snap-endpoint.png) | `LineBasicMaterial` cursor marker | Yellow square marker | Yellow square marker | Same |
| [snap-midpoint](materials-audit/snap-midpoint.png) | `LineBasicMaterial` cursor marker | Yellow triangle marker | Yellow triangle marker | Same |
| [snap-center](materials-audit/snap-center.png) | Closed `Line` cursor marker (was `LineLoop`) | Yellow circle marker | Yellow circle marker | Fixed: `ClosedLine` |
| [snap-intersection](materials-audit/snap-intersection.png) | `LineSegments` cursor marker | Yellow X marker | Yellow X marker | Same |
| [snap-perpendicular](materials-audit/snap-perpendicular.png) | `LineBasicMaterial` cursor marker | Yellow right-angle marker | Yellow right-angle marker | Same |
| [gizmo](materials-audit/gizmo.png) | `MeshBasicMaterial` shafts, cones, rings, centre handle | Shafts, cones, rings, centre cube | Shafts, cones, rings, centre cube | Same |
| [dimensions](materials-audit/dimensions.png) | `LineBasicMaterial`, `MeshBasicMaterial` arrowheads and text planes | Arrowheads, extension lines, text, angular arc | Arrowheads, extension lines, text, angular arc | Same |
| [selection](materials-audit/selection.png) | `MeshPhongMaterial` face, `LineBasicMaterial` edge and selection box | Face tint, orange edge, yellow box | Face tint, orange edge, yellow box | Same; `EdgeLayer` not exercised |
| [lines](materials-audit/lines.png) | `LineBasicMaterial`, `LineDashedMaterial`, transparent overlay, closed circle | Solid, dashed, circle, overlay | Solid, dashed, circle, overlay | Fixed: `ClosedLine` (circle) |
| [points-sprites](materials-audit/points-sprites.png) | `PointsMaterial` marks, `SpriteMaterial` labels | Two cyan point marks, X/Y labels | No point marks; X/Y labels present | Deferred: `PointsMaterial` |
| [shading](materials-audit/shading.png) | `MeshPhongMaterial`, `MeshStandardMaterial`, `MeshBasicMaterial` wireframe | Blue Phong, green Standard, orange wireframe | Blue Phong, green Standard, orange wireframe | Same |
| [note-dashed](materials-audit/note-dashed.png) | `LineDashedMaterial` leader, shelf, separator; text planes | Dashed leader, shelf, separator | Dashed leader, shelf, separator | Fixed: `computeLineDistances()` |

`Same` means no visible difference beyond antialiasing or glyph rasterisation. The
WebGL panel is on the left and the WebGPU panel on the right in every image.

## Grid

The 20-unit `GridHelper`, X/Y `ArrowHelper` heads, and Arial sprite labels are present
on both backends. The arrow shafts run along the grid centre lines, so only the
arrowheads and labels stand out. The origin dot is a `PointsMaterial` object; it draws
on WebGL and is absent on WebGPU. This is the same point-family gap recorded under
`points-sprites`, not a grid-specific regression.

## Snap markers

All five markers match in shape, colour, and screen size. Endpoint is the yellow square,
midpoint the triangle, intersection the X, and perpendicular the right-angle mark. The
centre marker is the circle that previously used `THREE.LineLoop`; it now uses
`createClosedLine()` and draws on both backends. No snap marker is offset or missing.

## Gizmo

Translate shafts and cones, rotate rings, and the centre cube match. The WebGPU ring
edge is slightly harder at this scale because of rasterisation, but the geometry,
colours, opacity, and `depthTest: false` behaviour are the same. No handle is missing.

## Dimension lines

Linear, aligned, angular, radius, and diameter dimensions all render. Arrowheads,
extension lines, the angular arc, and value text are present on both backends. Text is
a little thinner on WebGPU, a glyph-rasterisation difference rather than a material
difference. No line or arrow is missing.

## Selection highlight

The seeded solid receives the same pale face tint and orange edge outline on both
backends, and the yellow selection box is identical. The seeded solid is added directly
rather than through `addSolid3D`, so this case does not exercise `EdgeLayer` or the fat
`LineSegments2`/`Line2NodeMaterial` path; that remains #169 work. No z-fighting appears
in either pane.

## Fixes

1. **Closed lines instead of `LineLoop`.** `src/render/ClosedLine.ts` appends a clone of
   the first point and returns a normal `THREE.Line`, which `WebGPURenderer` supports.
   `src/render/Viewer.ts` now uses it for the preview circle, capped and closed
   polylines, and full-ellipse caps/bodies. `src/render/CursorRenderer.ts` uses it for
   the centre snap marker. `src/render/ClosedLine.test.ts` covers the return type,
   closure, vertex count, empty input, and input immutability. Evidence:
   `snap-center` and `lines`.
2. **Note separator dash distances.** `Viewer.createNoteObject()` now calls
   `sepLine.computeLineDistances()` where the note separator is created, matching its
   three sibling dashed lines. Evidence: `note-dashed`.

The WebGL pixel regression guard is the existing visual suite: 5 zebra and 3 edge tests
still pass after both changes.

## Deferred

- **WebGPU `EdgeLayer` provider (`Line2NodeMaterial`)** — #169. `createEdgeLayer()`
  still throws for `kind === 'webgpu'` until the provider is registered. The selection
  case deliberately seeds a mesh so the audit can check face/edge highlight without
  pretending the edge layer works.
- **`PointsMaterial` on WebGPU** — #169, with any picking/feature work in #171. Point
  marks built by `addPoint()`, the point preview, and the grid origin dot are invisible
  on WebGPU. WebGPU point primitives are expected to be 1 px regardless of the
  material's `size`; a pixel scan of the WebGPU pane found no cyan point pixels at all.
  Replacing them with world-scaled quads or sprites needs screen-size mapping and
  picking changes, so it is not a low-risk audit fix.
- **WebGPU boot, renderer lifecycle, resize/DPR, device loss** — #169. The shipped
  default remains WebGL and no WebGPU flag was added.
- **Shadows, clipping, picking, plot capture, overlay textures** — #171, unchanged by
  this audit.

## Limits

- WebGPU capture is headed-only and local; it is not part of CI.
- The two panes share one page and one 1520x820 viewport. Antialiasing, line
  rasterisation, and text hinting differ, so the review is visual and semantic rather
  than a pixel-diff gate.
- The selection solid, dimensions, gizmo, and notes are seeded directly. The audit does
  not import OpenCascade B-rep geometry, so it does not cover `EdgeLayer` output.
- The screenshots are post-fix. The `LineLoop` and separator fixes are pinned by their
  source tests and by the relevant screenshots, not by a before/after image pair.
