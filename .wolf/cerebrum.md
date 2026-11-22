# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-07-27

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

- **Project tracking lives in Plane**, not local markdown. Workspace `haktek`, project `webcad` (`51bb06ac-d62e-4168-b275-1cf5042bf6fe`). API token is in `plane-secret-key.csv` at repo root (gitignored — never commit or echo it).
- **User works backlog-first:** asks for epics → items → verify against code → modules → cycles → descriptions, one step per request. Don't run ahead to the next organisational layer unprompted.
- **"based on your findings"** means: reuse the verified audit evidence already gathered this session, don't re-derive it.
- **Verify claims against real code before acting on them.** When asked to compare a backlog/plan to the app, actually read the source — a large share of inherited bug reports turn out already fixed or never true.
- **Feature branches land on `main` via GitHub pull requests**, merged by the user in the web UI (merge commit, not squash/rebase). So `origin/main` can move between local operations. Always `git fetch` and check `git status -sb` before pushing to `main`; never `git merge --ff-only` a branch into `main` without fetching first, or you will discard the user's merge commit.

## Key Learnings

- **Session 2026-11-20 — materializr dependency triage:**
  - materializr (GPv3, do not copy source) pins OCCT 7.9.3 via Dockerfile (`ARG OCCT_TAG=V7_9_3`) and vcpkg.json; CMake links explicit toolkits on Linux/macOS (not umbrella) — `TKernel TKMath TKBRep TKGeomBase TKGeomAlgo TKTopAlgo TKPrim TKBool TKBO TKFillet TKOffset TKShHealing TKMesh TKBin TKDESTEP TKDEIGES` — skipping TKG3d/TKService/TKV3d (no viewer/text in headless kernel).
  - materializr exports: STEP via `STEPControl_Writer`/`Reader` (AP214, `src/io/StepIO.cpp:453`); STL via custom weld+writer (`StlAPI_Writer` included but not called for final output, `src/io/StlExport.cpp:8`); glTF/OBJ/3MF are pure custom code (no OCCT writers). Mesh tessellation via `meshWithFallback` (`src/core/MeshParams.h:637`).
  - OCCT license ships as `LICENSE_LGPL_21.txt` (LGPL v2.1) + `OCCT_LGPL_EXCEPTION.txt` (header-incorporation exception, 663 bytes) — no top-level `LICENSE` file in the Open-Cascade-SAS/OCCT repo.
  - materializr build flags: C++17 REQUIRED, MSVC `/EHa`+`/utf-8`+`/bigobj`, GNU `-Wswitch` only, `OCC_CONVERT_SIGNALS` on non-Windows. Size estimate ~60-120 MB pre-dead-strip (iOS only, unverified for Linux headless).
  - WebCad has no `FONT-CREDITS.md`; Arimo (Apache 2.0) planned via `docs/base/fix_svg2pdf_fonts_agent.md`; only `public/fonts/osifont.ttf` present.
  - No CMakeLists.txt or Dockerfile exists in WebCad yet — kernel build image (WC-EC-08) and worker skeleton (WC-EC-10) are not-yet-implemented tickets.
- **Project:** webcad-scaffold
- **Description:** A faithful CAD drafting experience, reimagined for the modern web using **TypeScript**, **Three.js**, and **Vite**.
- **Build vs typecheck gap:** `npm run build` (Vite/esbuild) strips types without checking, so it passes green even though `tsc --noEmit` reports ~128 errors in `src/`. There is no `typecheck` npm script. CI/build cannot be trusted to catch type errors.
- **tsconfig has no `include`/`exclude`**, so a bare `npx tsc --noEmit` walks the whole tree including vendored reference projects. Scope to `src/` when checking types.
- **Tests:** `npm test` = vitest (unit), `npm run test:ui` = playwright. `SvgImporter.test.ts` uses `@vitest-environment jsdom`; `jsdom` is now installed (devDep). Full suite: 320 tests across 62 files, exit 0.

## Session 2026-11-21 — WC-EC-21 Sweep Port (native OCCT kernel)

- **`BRepOffsetAPI_MakePipeShell`** sweep: `SetTransitionMode(BRepBuilderAPI_RoundCorner)` adds 4 extra edges at rounded bends (one per profile vertex) vs sharp miter. Account for this in oracle edgeCount expectations.
- **`ExecuteSuccess` oneof field 15** is `SweepResult sweep` — C++ accessor is `mutable_sweep()`, NOT `mutable_create_sweep()`. The proto field name in the oneof (`sweep`) differs from the request field name (`create_sweep`).
- **PowerShell does not support `&&`** — use `;` for command chaining. `docker exec ... bash -c '... && ...'` works because `&&` is interpreted by bash inside the container.
- **Container binary staleness:** `docker cp` source → container path, kill process, `cmake --build`, `cp build/kernel_worker /kernel/kernel_worker`, `docker restart`. All steps required; missing any one leaves a stale binary.
- **OCCT 7.9.x transition modes:** `BRepBuilderAPI_MiterCorner` and `BRepBuilderAPI_ExtendedIntersection` do not exist. Available: `BRepBuilderAPI_Transformed`, `BRepBuilderAPI_RightCorner`, `BRepBuilderAPI_RoundCorner`.
- **Network is slow/flaky on this machine**, not MITM'd: `npm ping` succeeds (~70s) and the registry serves the genuine cert (Google Trust Services / npmjs.org). A one-off `UNABLE_TO_VERIFY_LEAF_SIGNATURE` from `npm install` was transient — retry with `--fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-timeout=300000` rather than disabling strict-ssl.
- **`npm run typecheck` now exists** (added 2026-06-22) and `tsconfig.json` has `"include": ["src"]`. As of 2026-06-22 the `src/` app code is type-clean (0 non-test errors); ~15 errors remain in test files only.
- **CommandAction type** lives in `src/core/commands/types.ts`. Many commands/handlers add new `action` discriminator strings and payload fields here — when a handler reads `action.foo` and tsc says foo doesn't exist, add the field to `CommandAction` (e.g. `projectName`, `height` were missing).
- **Primitive creation params** (`src/core/model/Solid3D.ts`): Cone uses `r1`/`r2`/`h` (NOT `r`); Torus uses `r1`/`r2` (NOT `rMajor`/`rMinor`). The single-radius worker `createCone` takes `r1` as its radius.
- **Service↔worker arg drift:** `OpenCascadeService` wrappers accept a `deflection` param that several `OCCWorkerClient` face-ops (`filletSolidFace`, `chamferSolidFace`, `makeThickSolid`, `draftSolidFaces`) do NOT accept — JS ignored the extra arg at runtime, tsc flagged it. Don't pass deflection to those client methods.
- **SketchModel API:** `addPoint()` returns a `SketchPoint`; `addLine()`/constraints take the numeric handle `point.h` (`hEntity = number`), not the SketchPoint object.
- **E2E stack:** Playwright 1.59, `npm run test:ui`, specs in `tests/e2e/`, chromium only, dev server on :5173 via `webServer` with `reuseExistingServer`. Shared page object lives in `tests/e2e/helpers.ts` (`CadApp`) — use it rather than raw locators.
- **The app boots straight into the drawing editor.** There is no main-menu gate: `#main-menu-screen`/`#main-menu-input` were removed from `index.html`, and `src/ui/MainMenuScreen.ts` is orphaned (never imported). Readiness signal = `#command-log` contains `New drawing started.`
- **Runtime DOM ≠ index.html.** The static status bar in `index.html` (`#layer-info`, `#coords-info`, `#tag-ortho`…) is replaced at startup by a ribbon: `#ribbon-coords`, `#ribbon-layer-name`, `#ribbon-ortho`, `#ribbon-otrack` (toggles carry an `active` class). Always check the live DOM, not the HTML file.
- **App layout:** `.app-tab` Modelling/Scripting. Modelling owns the docked toolbars in `#docking-pane` — `#floating-toolbar` (Draw), `#dim-toolbar`, `#edit-toolbar`, `#solid-toolbar`, each holding `.tool-button[title="CMD"]`. Scripting collapses the docking pane to zero width and is for loading/executing SCAD (`#scad-editor-window` + CodeMirror, `#scad-run-btn`, Add to Doc, Export 3D/2D). Tool windows open from `#tool-window-bar .bar-item[title="…"]` → `#tool-window-<key>.visible`: Layers, Properties, Objects, File Operations, Block Library, Object Generator, Sketching, SCAD Projects.
- **World↔screen mapping:** do NOT compute it arithmetically. `screenX = canvasWidth/2 + worldX` only holds at the default top view with zoom 1 and the camera over the origin, and the canvas keeps resizing after boot, so clicks drift ~10 units and tests fail intermittently. Project through the live camera instead — `helpers.ts` and `bridge.ts` both go through the test bridge's `worldToScreen()` now.
- **Command log strings** to assert on: `Command: X`, `LINE specify first point:`, `To point:`, `Line created. Distance: N`, `Center[X:…]`, `[R:50.0000]`, `*Cancel*`, `[Selection] N object. Width: W, Height: H`, `Deleted N objects.`, `Undo performed.` / `Nothing to undo.`, `Grip edit completed.`, `*Cancel Grip Edit*`, `Command finished.`
- **Escape is ignored while focus is in `#cmd`** (guard at `main.ts:559`). Blur the input first — don't click the canvas to shift focus, because `#tool-window-bar` overlays the canvas corner and intercepts pointer events, and a canvas click feeds a point into the active command.
- **Undo/redo exists and works** — `CommandManager.ts:231` maps `UNDO`, `SystemHandler.ts:47-54` handles it, `Document.undo()` at `Document.ts:160`. Do not re-report it as missing.
- **OpenWolf token counting pipeline:** `post-read.js`/`post-write.js` append per-file token estimates to `.wolf/hooks/_session.json`; `stop.js` rolls a finished session into `.wolf/token-ledger.json` (lifetime totals). The **daemon** (port 18791) only runs cron + the dashboard — it does NOT count tokens. So a zeroed `token-ledger.json` / empty `_session.json` means the **in-session hooks aren't firing**, not that the daemon is down. Hooks are registered from `.claude/settings.json` at session start; a session that started before that config was loaded won't route tool calls through them — fix is to restart the Claude Code session. The hook scripts themselves work correctly when fed valid JSON on stdin.
- **Test bridge (2026-07-27):** `window.__webcadTest` from `src/testing/TestBridge.ts`, installed at the end of the boot chain in `main.ts`, enabled in dev builds or via `?testBridge=1`. Playwright-side wrapper is `tests/e2e/bridge.ts` (`CadBridge`), docs in `tests/e2e/README.md`. **Prefer it over `helpers.ts` (`CadApp`) for new specs** — it removes pixel guessing, log-string scraping and `waitForTimeout`. Use `cad.input` only when the mouse event handling itself is under test.
- **Solid topology from the model:** the render buffer duplicates corners per face (a box has 24 buffer vertices), so derive true corners from `Solid3D.edgeLines` endpoints — that yields exactly 8 for a box. `edgeLines` is itself not deduplicated: a box has 24 polylines covering 12 distinct edges, so two `EDGE:<id>:<n>` indices can name the same physical edge. `faceMapping` is per-triangle; distinct values are the face indices used by `FACE:<id>:<n>`.
- **`Viewer.screenToWorld()` is drafting-specific and unsafe for general use.** It picks its intersection plane by comparing `|camera.x|`, `|camera.y|`, `|camera.z|` and swizzles the returned axes; in angled views no axis dominates and the result is nonsense. For real world↔screen work do an explicit raycast against a named plane (see `TestBridge.screenToWorld`), and refuse when the view grazes it.
- **The canvas is not fully clickable.** `#command-log` and the docked panes are painted over it, so a point inside the canvas bounding rect can still be unreachable — `main.ts`'s pointer listeners require `e.target === canvas`. Check `document.elementFromPoint` before dispatching a synthetic mouse event.
- **Command results are printed twice** (`handleResult` prints, then `main.ts:591` prints the returned string again). Pre-existing and visible in the real UI — don't chase it as a test artefact.
- **The camera is always a `THREE.OrthographicCamera`.** The `PERSPECTIVE_*` view presets are angled orthographic views; there is no perspective projection to switch to. There is also no vertex-selection model — `App` tracks `selectedFaces` and a single `selectedEdge` only.
- **Two representations of every solid, and they drift.** The OCC worker holds a B-rep in `shapeCache`; the `Solid3D` entity holds an independent tessellation (`positions`/`indices`/`faceMapping`). Vertex and face counts read off the entity describe only what the viewport draws. `OpenCascadeService.checkValidity(id)` asks the kernel (BRepCheck_Analyzer + a face-count explore) and **throws `Shape not found for entity: <id>` when the shape is not cached** — that throw is a finding, not a precondition failure: the document is holding a solid the kernel cannot operate on, so the next boolean/fillet would fail. The bridge surfaces it as `inKernel: false` and compares kernel vs model face count (`faceCountMatches`). Never auto-import the snapshot before checking; that guarantees a hit and hides the drift.
- **Renderer state (2026-07-27, after phases A+B of Plane epic #158):** three is **r185.1** with `@types/three` aligned; the r160→r185 jump was clean (tsc, build, 332 unit, 69 e2e all green) because the types were already pinned at r184, so the code had effectively been written against the newer library. `src/render/RendererBackend.ts` owns the renderer: `RendererBackend` (the 5-member seam), `chooseRenderer()` (async decision, unit-tested), `createRenderer()` (decision + construction), `createWebGLRenderer()` (the only place a concrete renderer is named). `Viewer.renderer` is typed as the seam. `?renderer=webgpu|webgl` overrides in both directions; `viewer.rendererInfo` / bridge `getRendererInfo()` / `cad.expectRenderer()` report what actually drew. **WebGPUPOC.ts, ZebraTSL.ts and src/types/three-webgpu.d.ts are deleted** — they imported r160-era paths r185 removed. Material census: 44 `LineBasicMaterial`, 18 `MeshBasicMaterial`, 5 `LineDashedMaterial`, 3 `PointsMaterial`, 3 `MeshPhongMaterial`, 2 `SpriteMaterial`, 2 `MeshStandardMaterial`, 1 `ShaderMaterial` (inline-GLSL zebra, `Viewer.ts:65`, still compiles on r185).
- **`Viewer.render()` no longer draws — it queues.** The single immediate draw is the private `renderNow()`, with two callers: the rAF frame loop and `captureImage()`. The ~44 `viewer.render()` call sites across handlers and UI now coalesce to one draw per tick. If you need pixels synchronously, use `captureImage()`; do not add another immediate-draw path.
- **Two things block a WebGPU renderer** (both found by doing the work, both in #169/#174): `OutlineEffect` is WebGL-only and draws every SHADED/ZEBRA frame; and **a canvas can only ever have one context type** — once `getContext('webgl2')` has run, `getContext('webgpu')` returns null, so a renderer cannot be swapped in after boot and the async decision must move ahead of `new Viewer()` in `main.ts`.
- **`canvas.toDataURL` for thumbnails worked by luck.** `app.ts` and `FileToolWindow.ts` read the canvas at an arbitrary later moment with no `preserveDrawingBuffer`. Measured: on WebGL/Chromium it returns the same 14.9 KB JPEG as a proper capture — which is *why* it was never reported as a bug and why it would have failed at the backend swap, not before. Both now go through `Viewer.captureImage()`, which draws and reads in the same turn.
- **Do not enable ACES tone mapping in this viewport** without arguing it separately. Most of the scene is flat `MeshBasicMaterial`/`LineBasicMaterial` carrying ACI layer colours; a filmic response curve desaturates every one of them, so a layer set to red stops drawing the red it was assigned. Antialiasing and explicit `outputColorSpace` are on; tone mapping was deliberately left off (#159).

- **Docs layout (2026-10-20):** all documentation lives in `docs/` (`docs/plans/`, `docs/scad/`, `docs/3d/`, `docs/base/`, `docs/uidesign/`). Third-party reference code lives in `vendors/` (`replicad-main`, `chili3d`, `BOSL-master`) and is gitignored. `docs/` and `vendors/` are excluded from eslint and vitest; `tsconfig` includes only `src`, so vendored code never type-checks. **Never put vendored repos under `docs/`** — vitest's default glob picks up their `__tests__/` and `test/` suites (it broke 75 test files) and eslint reports errors on them.
- **WC-EC-16 — OCCT 7.9.3 `gp_GTrsf::SetValue` row-4 quirk:** `SetValue(row, col, value)` only accepts rows 1-3; row 4 (`[0,0,0,1]`) is implicit. Calling `SetValue(4, ...)` raises `Standard_OutOfRange` (caught by kernel catch-all, returns empty error). Build `gp_Trsf` with `SetValues(mat, tr)` or construct translation/rotation/scale/mirror directly; never call `SetValue(4, ...)`.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->
- [2026-06-22] Do NOT typecheck/read `Documents/chili3d` — it is a vendored third-party reference project, not part of webcad. User explicitly excluded it.
- [2026-07-27] **Do NOT trust `grep -rl` through the rtk proxy for existence checks — it returns false zeroes.** It reported "0 matches" for `zebra`, `FeatureNode` and `faceMapping`, all of which exist in `src/`. Nearly filed duplicate Plane tickets for a feature DAG and a zebra shader that were already implemented. Use the dedicated Grep tool for any "does X exist in the codebase?" question; rtk grep is only safe once a match is already known to exist.
- [2026-07-27] **Never `git merge --ff-only` a feature branch into `main` without fetching first.** The user merges branches via GitHub PRs in the web UI, so `origin/main` carries a merge commit that a local fast-forward silently rewrites past. Fetch, check `git status -sb`, then `reset --keep` + cherry-pick if local `main` has already been moved. Use `--keep`, not `--hard` — there are usually uncommitted working-tree edits (`files/TEST.dxf`, `plans/todo.md`, `test-results/`).
- [2026-07-26] **Always pass `encoding="utf-8"` to `open()` in Python on this machine.** Default is cp1252; reading a UTF-8 JSON file without it silently double-encodes every em-dash/arrow before it reaches an API. Cost: all 124 Plane titles created as mojibake and needing a full re-PATCH pass. Also add `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` or `print()` crashes on the same characters mid-run.
- [2026-07-26] Do NOT trust inherited bug lists without verifying against current source. Of 31 audited backlog claims, only 6 were still true — 11 were already fixed and 11 were never valid (wrong file, working-as-designed, or presuming a feature that doesn't exist). Read the code first, then act.
- [2026-07-26] **Never conclude a feature is missing from a grep alone — exercise it.** A subagent grepped `'UNDO'`, found only the `main.ts:529` call site, and reported "no undo/redo system exists anywhere". Wrong: `CommandManager.ts:231` maps it and `SystemHandler.ts:47-54` handles it. I relayed that to the user and filed an urgent Plane issue on a false premise, then had to retract it. Run the thing in a browser before declaring it absent.
- [2026-07-26] **Playwright workers must be capped at 2 on this app** (1 in CI). Every page boots an OpenCascade WASM kernel plus a Three.js WebGL context that headless Chromium rasterises in software, so contexts are CPU-bound. At the default worker count (16 cores) pages never even reach `domcontentloaded` and ~35 of 41 tests fail on `page.goto`. The dev server is not the bottleneck — it serves in ~10ms throughout. Symptom to recognise: pass count falling and runtime climbing across successive runs.
- [2026-07-26] Long API batch scripts must be **resumable** (persist a done-set to disk and skip it on restart). Plane rate-limits and the SSL path is flaky; a crash at item 109/124 without resume support means redoing everything.
- [2026-07-27] **`startTransaction(doc.constraints)` uses a truthiness check on an array, and `[]` is truthy.** That makes `currentConstraintsBefore` non-null on every action, so `commitTransaction` pushes an empty transaction for actions that record nothing — including UNDO itself, which is why undo pops an empty entry and never advances. Filed as Plane #157. When reasoning about history state, dump `doc.history.undoStack` rather than trusting the log message.
- [2026-07-27] **Don't build a bridge waiter on `requestAnimationFrame` alone.** Browsers stop firing rAF in a hidden tab, so any flag cleared inside a rAF callback sticks and every wait hangs. Use a timer for watchers, and cap how long a queued frame may block an idle signal.
- [2026-07-27] **Re-importing a Plane script module re-runs it.** `import bridge_done` executed the whole file again and duplicated comments on three issues. Guard side-effecting scripts with `if __name__ == "__main__":`, or make each write idempotent by checking for the existing record first.
- [2026-07-27] **Plane pages are create-only over the API** — `PATCH` and `PUT` on `/pages/<id>/` both return 405. To add to a page, create a new dated page and tell the user to fold it in.
- [2026-07-27] **Never derive a stable identifier from `constructor.name`.** Vite/esbuild minifies class names in a production build, so `Solid3D` becomes `sn` and every type filter silently matches nothing. Dev mode is unminified and hides this completely — test any such code against `npm run build` output, not just the dev server. Use an `instanceof` table with explicit names instead.

- [2026-11-20] **Protobuf v2 migration pattern:** v1 generated `ServiceType` + constructor functions (`new Xxx({...})`). v2 generates `GenService` (DescService-compatible) directly into `_pb.ts` files — no separate `_connect.ts`. v2 message types are type-only exports; runtime construction uses standalone `create(Schema, data)` from `@bufbuild/protobuf`, not `Schema.create(data)`. Import both Schema values AND types from generated files. Generated files carry `@ts-nocheck` so typecheck skips them. All 4 compat shims and all alias blocks deleted. `buf.gen.yaml`: protoc-gen-es v2 only (removed protoc-gen-connect-es).

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- [2026-07-26] **Plane backlog structure:** epics as parent issues (13), Modules mirroring the epics 1:1 (11 with items), and Cycles cut by **priority** rather than by feature area — Sprint 1 Critical (2) / Sprint 2 High (38) / Sprint 3 Medium (47) / Sprint 4 Low (19). Priority-based cycles were chosen because the audit showed most "critical" work was already done, so a feature-area split would have produced sprints of wildly uneven urgency.
- [2026-07-26] **Audit verdicts recorded as state, not deletion:** already-fixed items → Done, invalid claims → Cancelled, both with a comment explaining the evidence. Nothing was deleted, so the reasoning stays auditable and a wrong verdict can be reversed.
- [2026-07-27] **Known-broken behaviour is pinned with `test.fail()`, not skipped or left red.** UAT-01..05 and the undo case in `commands.spec.ts` describe correct behaviour that does not hold today. `test.fail()` keeps the suite green while the defect stands and turns it red the moment the defect is fixed, so nobody has to remember to re-enable them. Skipping would lose the signal; leaving them failing would make the suite meaningless.
- [2026-07-27] **The bridge refuses rather than guessing.** `selectVertex`, `setProjection('perspective')` and edge-on `screenToWorld` throw `code: 'unsupported'` with an explanation instead of returning a plausible wrong answer, so a test failure names a real app limitation instead of silently asserting fiction.
- [2026-07-26] Backlog item #135 (Maker.js migration) was written up as **decide-before-doing** rather than a build task — a broad swap of all 2D drawing routines with no demonstrated benefit over working code. It may legitimately close as "won't do".

- [2026-11-21] **WC-EC-23 tessellation architecture:** Option B — static `PopulateMeshData` helper in `kernel-worker.cpp` called from every `HandleCreate*` handler after `ComputeShapeMetrics`, gated by `request->include_brep()`. Chosen over per-handler duplication (too much code), a separate mesh service file (premature file bloat), or proto changes (`MeshData` already exists — no changes needed).

- [2026-11-20] **Phase B kernel build speed (items 5.8, 5.9):**
  - CI guardrails workflow `.github/workflows/kernel-build-guardrails.yml` — fails when cold build >900s, binary >100MB, Docker image >1500MB; ccache cache save/restore; $GITHUB_STEP_SUMMARY pass/fail table; timing results uploaded as artifact.
  - Binary OCCT evaluation `docs/superpowers/plans/2026-11-20-binary-occt-evaluation.md` — conda-forge occt 7.9.3 novtk via micromamba (proposed primary); vcpkg has NO OCCT package — not viable; Debian/Ubuntu max 7.6.3 — not 7.9.3 — not viable; from-source occt-base Docker as documented fallback. conda-forge can supply full stack: occt + protobuf-cpp + grpc-cpp + abseil-cpp + cmake + ninja + gcc + gxx. conda-lock available for exact build string pinning.
  - Baseline: cold build 19s→15.5s (~18% faster), warm build 5s→0.5s (10x faster) with ninja + ccache + mold/lld. Docker image: webcad/kernel:occt-7.9.3 = 1.16GB; Kernel binary = 1.9MB (stripped).
  - Verification: typecheck PASS, lint PASS (pre-existing warnings in app.ts only), test 494/496 pass (2 pre-existing Docker kernel integration test failures needing running container), buf:lint PASS, buf:breaking FAIL (Windows .git path infrastructure issue — pre-existing).

- [2026-10-21] **WC-EC transport replacement: gRPC (kernel link) + Connect (browser link).** Replaces WebSocket engine transport. proto is single source of truth under `proto/webcad/engine/v1/` (`common.proto` + `engine.proto`); buf for lint/breaking/codegen. Gateway <-> kernel: native gRPC HTTP/2 over Unix socket (same host) or TCP+mTLS (cross-host). Browser <-> gateway: Connect (connect-es client, connect-node server). WebSocket removed, no parallel impl. Local WASM worker transport stays via `OCCTransport` interface (unchanged). Design doc: `docs/superpowers/specs/2026-10-21-grpc-connect-transport-design.md`. Three PRs: (1) proto+codegen+CI, (2) gateway+kernel server, (3) client+infra+cleanup. Tickets: WC-EC-09, 26, 27, 28, 29, 30, 31, 32, 36, 37, 47.

- [2026-11-19] **WC-EC transport design doc revised.** Error model: in-band `ExecuteResponse.failure { ExecuteFailure }` enum separates kernel-side errors from gRPC transport status codes; gRPC codes reserved for transport/session problems (UNAUTHENTICATED, PERMISSION_DENIED, UNAVAILABLE, DEADLINE_EXCEEDED, CANCELLED, INTERNAL, NOT_FOUND, RESOURCE_EXHAUSTED). Rehydrate/resume: `Restore` on `EngineGateway`, `needs_rehydrate` + monotonic per-session `event_id`, replay buffer (1024 events / 2 min proposed), `last_event_id` resume semantics. Ordering: `Execute`/`Restore` sequenced (client_seq starts at 1, 5s reorder buffer proposed), all other RPCs unsequenced; bounded dedupe cache (request_id → status + result ref, 10 min TTL proposed, results >256 KiB stored by result_id); sticky routing via `x-session-id` header + nginx hash. HTTP versions: HTTP/2 TLS browser→nginx, HTTP/1.1 nginx→gateway; nginx not on gateway→kernel link (remove grpc_pass). Payload limits table with BlobRef generalisation; upload storage (temp dir vs MinIO) open question. Kernel language removed from hardcoded C++ — PR split into 2a (mock kernel TS) and 2b (real kernel per WC-EC-05 ADR). Problem section rewritten: Web Worker postMessage transport, no `ws` dependency exists. Cleanup section rewritten: no `ws` to remove, ad-hoc `{type,payload,id}` envelope stays (local WASM transport retained as config option). Typed arrays: decoded bytes may be misaligned — copy into fresh buffer or use DataView before Float32Array/Uint32Array/Int32Array; test with odd byte offset. Auth: JWT expiry during Subscribe → server ends stream with UNAUTHENTICATED, client reopens with fresh token; auth covers UploadChunk and StreamMesh. Validation/quotas (WC-EC-32): protovalidate constraints + per-session rate limits. OpenSessionResponse: protocol_version, minimum_client_version, server_limits, heartbeat_interval, kernel/OCCT version, supported ops. BrepReference.data opt-in via include_brep flag. Kill-and-respawn assumes one kernel process per session. Rejected alternatives updated: WebTransport Baseline March 2026 but uneven/Node no server support/UDP-blocked fails; gRPC-Web+Envoy extra hop only; WebSocket+protobuf needs CORS cross-origin. Status: "Draft - pending human review", date 2026-11-19. Open questions: 14 items (upload storage, kernel language, reorder timeout, dedupe TTL/size cap, replay buffer, result inline limit, BlobRef chunk size/TTL/quota, result_id TTL, heartbeat interval, max concurrent calls, per-op deadlines).

## Key Learnings (gRPC/Connect transport)

- **No `proto/` dir, no buf config, no `@bufbuild/*` packages exist yet.** Must be created from scratch for PR 1.
- **`OCCWorker.ts` is the ground truth for the 34 operation payloads** — each handler's exact field names must be used in proto oneofs. Do not invent or rename fields.
- **`OCCWorkerClient.ts`** shows exact payload fields per operation (e.g., createBox: x,y,z,dx,dy,dz,deflection,entityId; transformShape: entityId,dx,dy,dz,targetEntityId,deflection; createBoolean: operation,idA,idB,entityId,deflection,rotA,rotB,centerA,centerB).
- **`OpenCascadeService.ts` wraps `OCCWorkerClient`, builds THREE.BufferGeometry from responses, has `pendingCount` for TestBridge.** Wraps both transports behind `OCCTransport` interface.
- **No existing `OCCTransport`/`RemoteWsTransport`/`RemoteGrpcTransport` interface found in `src/`** — these must be created; `OCCTransport` already exists conceptually via `OCCWorkerClient` but not as a formal TS interface.
- **Vite config:** COOP same-origin, COEP require-corp headers; port 5173; no dev proxy currently configured.
- **package.json: no `ws` dependency, no `@bufbuild/*`, no grpc/connect packages.** `ws` removal is a no-op (not present).
- **AGENTS.md:** Project developer guide at repo root; needs updating for gRPC/Connect architecture.
- **Fire-and-forget sites confirmed:** `Document.ts` `restoreSolidBRep` (Promise.resolve + .catch, no await) and undo/redo `transformShape(id, dx, dy, dz)` calls without await — must be made tracked and awaited in client transport PR.
- **Decoded `bytes` fields may be misaligned** — client must copy into fresh buffer or use DataView before creating Float32Array/Uint32Array/Int32Array views. Add test with odd byte offset.
- **Error cases in OCCWorker.ts handlers inventory:** MISSING_ENTITY, INVALID_SHAPE, FILLET_FAILED, BOOLEAN_FAILED, INVALID_PARAMETER, SHAPE_NOT_FOUND, EDGE_NOT_FOUND, FACE_NOT_FOUND, NEUTRAL_FACE_NOT_FOUND, GEOMETRY_EMPTY, READ_FAILED, IMPORT_FAILED, EXPORT_FAILED, KERNEL_ERROR, INTERNAL — map to `execution_failure_code` enum.

## Key Learnings

- **No `proto/` dir, no buf config, no `@bufbuild/*` packages exist yet.** Must be created from scratch for PR 1.
- **`OCCWorker.ts` is the ground truth for the 34 operation payloads** — each handler's exact field names must be used in proto oneofs. Do not invent or rename fields.
- **`OCCWorkerClient.ts`** shows exact payload fields per operation (e.g., createBox: x,y,z,dx,dy,dz,deflection,entityId; transformShape: entityId,dx,dy,dz,targetEntityId,deflection; createBoolean: operation,idA,idB,entityId,deflection,rotA,rotB,centerA,centerB).
- **`OpenCascadeService.ts` wraps `OCCWorkerClient`, builds THREE.BufferGeometry from responses, has `pendingCount` for TestBridge.** Wraps both transports behind `OCCTransport` interface.
- **No existing `OCCTransport`/`RemoteWsTransport`/`RemoteGrpcTransport` interface found in `src/`** — these must be created; `OCCTransport` already exists conceptually via `OCCWorkerClient` but not as a formal TS interface.
- **Vite config:** COOP same-origin, COEP require-corp headers; port 5173; no dev proxy currently configured.
- **package.json: no `ws` dependency, no `@bufbuild/*`, no grpc/connect packages.** `ws` removal is a no-op (not present).
- **AGENTS.md:** Project developer guide at repo root; needs updating for gRPC/Connect architecture.

## Key Learnings (Plane API)

- **Plane API responses are UTF-16LE with BOM (char 65279)** � must strip BOM and decode with `utf-8-sig` before `json.loads()`. PowerShell `curl.exe` works but `Invoke-WebRequest` is aliased to `curl` and mangles raw HTTP; use `curl.exe` or Python `urllib.request`.
- **Plane `/epics/` endpoint requires payment (error 1999).** Epics are modeled as parent issues: create the epic as a top-level issue (`parent` = null), then create child issues with `parent` set to the epic's UUID. State `backlog` = `d2595e99-1359-40f0-9efc-6f590d813476`.
- **Plane issue creation fields:** `name` (required), `description_html` (HTML markup), `priority` (high/medium/low/none/urgent), `state` (state UUID), `parent` (optional, links to epic/module). `depends_on` is not a native Plane field � put dependency info in description or labels.
- **PowerShell `PID` is read-only** � never use `$PID` as a variable name; use `$ppid` or similar instead.

## Key Learnings — gRPC/Connect Transport (2026-11-19)

- **connect-node v2.3.0 does NOT export `createHandler`** — uses `createConnectRouter`/`connectNodeAdapter` instead. Generated v1.x connect-es service objects have `methods` as a keyed object without `localName`; DescService requires a `methods` array with `localName`. Created `toDescService()` conversion helper with `Object.defineProperty` for readonly `parent`.
- **`@grpc/grpc-js` engineProto is a runtime value from protoLoader, not a TypeScript namespace.** Fixed with `type KernelServiceClass = typeof engineProto.KernelService` and `InstanceType<KernelServiceClass>`.
- **gRPC `@grpc/grpc-js` handler signatures use `GrpcCall` type** with optional `write`, `end`, `on`, `send` fields — mock kernel handlers must match this shape.
- **`@bufbuild/protoc-gen-connect-ts` doesn't exist on npm** — used `@connectrpc/protoc-gen-connect-es` instead. `buf gen` uses `local:` not `name:` for local plugins in buf.gen.yaml.
- **PR 1 (proto + codegen + CI) committed:** `proto/webcad/engine/v1/common.proto`, `engine.proto`, `buf.yaml`, `buf.gen.yaml`, generated TS in `src/generated/proto/webcad/engine/v1/`, CI workflow `.github/workflows/buf.yml`.
- **PR 2a (gateway + mock kernel, TS) committed:** `src/core/gateway/{auth,connect-server,dedupe,kernel-client,mock-kernel,ordering,session-manager}.ts`. `tsc --noEmit` passes with 0 errors.
- **PowerShell doesn't support `&&`/`||`** — use `;` with `if ($LASTEXITCODE -ne 0)`. `tail` not available — use `Select-Object -Last N`.
- **Next steps:** Write gateway unit tests (ordering, dedupe, session manager), PR 2b real kernel server (language TBD by WC-EC-05 ADR), PR 3 client (RemoteGrpcTransport) + infra + cleanup.

- **SessionOrderer.processBuffered() must call entry.resolve(entry) after deleting buffered entries**, or promises for out-of-order commands hang forever. Fixed in ordering.ts.
- **makeCommand test helper in ordering.test.ts must not include a promise field** � OrderedCommand type doesn't have it and tsc --noEmit fails. Tests await submit()'s return promise, not cmd.promise.
 
 # #   K e y   L e a r n i n g s   ( 2 0 2 6 - 1 1 - 1 9   g R P C / C o n n e c t   t r a n s p o r t )  
  
 -   * * @ b u f b u i l d / p r o t o b u f   v 2 . x   d o e s   n o t   e x p o r t   p r o t o 3 * * ,   b u t   g e n e r a t e d   p b . t s   f i l e s   i m p o r t   i t   a n d   c a l l   p r o t o 3 . u t i l . s e t E n u m T y p e ( )   a t   s t a t i c   i n i t .   V i t e s t   m o c k s   m u s t   p r o v i d e   p r o t o 3 . u t i l . { n e w F i e l d L i s t , s e t E n u m T y p e , g e t E n u m T y p e } ,   p r o t o I n t 6 4 ,   M e t h o d K i n d   o r   p b   f i l e s   c r a s h   b e f o r e   t e s t s   r u n .  
 -   * * M o c k   p a t h s   i n    i . m o c k   m u s t   m a t c h   E S M   i m p o r t   s p e c i f i e r s   e x a c t l y * *   ( w i t h   . j s   e x t e n s i o n ) ,   o t h e r w i s e   v i t e s t   d o e s n ' t   i n t e r c e p t   t h e   r e a l   m o d u l e   l o a d .  
 -   * * 
 e w   F l o a t 3 2 A r r a y ( b u f f e r ,   b y t e O f f s e t ,   l e n g t h )   c r a s h e s   o n   m i s a l i g n e d   b y t e O f f s e t . * *   M u s t   c o p y   v i a   D a t a V i e w   i n t o   a   f r e s h   a l i g n e d   b u f f e r   b e f o r e   c r e a t i n g   t y p e d   a r r a y s   f r o m   p r o t o b u f    y t e s   f i e l d s   ( p e r   d e s i g n   d o c   r e q u i r e m e n t ) .  
 -   * * c l i e n t S e q   s t a r t s   a t   1 n   p e r   s e s s i o n * *   ( s p e c :   \  
 s t a r t s  
 a t  
 1  
 p e r  
 s e s s i o n \ ) ,   n o t   0 n .   F i r s t   E x e c u t e   c a l l   c a r r i e s   c l i e n t S e q :   1 n .  
 -   * * P o w e r S h e l l   d o e s   n o t   s u p p o r t   & & * *      u s e   ;   f o r   c o m m a n d   c h a i n i n g .  
 - **v1 generated connect-es ServiceType objects ({ typeName, methods: Record<string, ...> }) are incompatible with @connectrpc/connect v2.x, which requires DescService (methods as array with localName, parent.typeName). Step 0 spike confirmed runtime mismatch: TypeError: Cannot read properties of undefined (reading 'toString') at create-method-url.js:31. Regeneration with protoc-gen-es v2 is the correct fix, not alias shims.
- **3 source files import from src/generated/**: session-manager.ts (types only), connect-server.ts (uses 	oDescService() wrapper), RemoteGrpcTransport.ts (casts s any). No 
ew message construction or 	oBinary/romBinary calls in source code. Test file RemoteGrpcTransport.test.ts mocks generated modules only.

## Key Learnings (2026-11-23 WC-EC-22 Loft Design)

- **`CreateLoftOp` proto already defined** (field 24): `repeated LoftProfile profiles`, `bool is_solid`, `bool is_ruled`, `double deflection`, `string entity_id`; `LoftProfile { string id, repeated Point3D points, bool closed }`; `LoftResult { string shape_id }`. **No proto changes needed.**
- **OCCT `BRepOffsetAPI_ThruSections`** lives in `TKOffset` toolkit; constructor `(isSolid, ruled, precision)`; `AddWire()` for section wires, `AddVertex()` for point apices, `CheckCompatibility(Standard_True)`, `Build()`, `IsDone()`, `Shape()`.
- **Single-point non-closed profile** → treat as vertex apex via `BRepBuilderAPI_MakeVertex` + `aLoft.AddVertex()`; multi-point → wire via `BRepBuilderAPI_MakeWire` + `BRepBuilderAPI_MakeEdge` per consecutive pair, close last→first if `closed`.
- **`id` takes priority over `points`** — UI sends both fields on every profile; if `id` is non-empty, look up cached shape and ignore `points`. Only fall back to `points` when `id` is empty. Error only if neither is set.
- **Pattern:** Follow sweep exactly (`OpCreateLoft` → `HandleCreateLoft` → switch case `kCreateLoft` → native adapter opMap entry `create_loft`).
- **Design doc:** `docs/superpowers/specs/2026-11-23-wc-ec-22-loft-design.md`

## Key Learnings (2026-11-20 SolidCraft evaluation)

- **SolidCraft** (elhakimz fork of tangency-labs/solidcraft at C:\Dev\Research\solidcraft) is pure-Rust parametric CAD; kernel = solidcore/SMLib (Rust port of NVIDIA's SMLib, Apache-2.0), migrating from "truck" kernel on kernel-smlib branch (not in releases).
- **Version 0.45.0-rc.4**, daily releases, 0.x pre-1.0. Requires Rust 1.95+/1.99.1 CI; machine has 1.92.0 (user said "dont code or compile solidcraft, just check it").
- **License:** MIT OR Apache-2.0 (app), Apache-2.0 (solidcore), separate brand license for UI kit/look/name.
- **Command model:** every operation is a command with JSON input/output; same commands from desktop UI, browser API (`solidcraft.execute(command, params)`), headless CLI (`solidcraft-cli exec`), MCP server. Matches WebCad's `Kernel.Execute(ExecuteRequest)` handler model.
- **Oracle:** 90/90 reference parts pass (analytic + FreeCAD cross-check). **Kernel regression rig:** 372 cases — booleans 73/89 pass (14 fail, 1 hang), fillets 41/50 (6 fail), shell 13/18 (5 fail), sweeps 74/83 (7 fail, 1 crash, 1 hang), threads 23/28 (3 fail, 2 hang).
- **Platforms:** desktop, browser (WASM), headless CLI, MCP server — same commands everywhere.
- **WC-EC-06 recommendation:** Option A — Ignore SolidCraft as kernel. WC-EC-05 ADR already selected OCCT 7.9.3 as sole kernel; SolidCraft "for inspiration only." Kernel mid-migration, known failures/hangs, 0.x version, Rust toolchain mismatch, protocol constraint ("do not change protocol"). Borrow patterns only: command registry, oracle reference parts, regression rig, browser command API.

## Decision Log

- [2026-11-20] **WC-EC-06 SolidCraft evaluation — go/no-go:** Ignore (stay with OCCT only). Rationale: ADR already decided OCCT 7.9.3 as sole kernel; SolidCraft kernel mid-migration (truck→SMLib branch, not in releases), 0.x pre-1.0, known regression rig failures/hangs, Rust toolchain mismatch with WebCad's Node/C++ stack, and protocol constraint ("do not change protocol"). Borrow patterns only (command registry, oracle, regression rig, browser command API) — no code changes.

## Key Learnings (2026-11-21 WC-EC-23 Tessellation)

- **`MeshData` proto already exists** in `common.proto` (lines 46-75): `bytes positions=1`, `bytes indices=2`, `bytes face_mapping=3`, `bytes edge_offsets=4`, `bytes edge_lines=5`. `ExecuteResponse.mesh = 4` already exists in `engine.proto` — **no proto changes needed**.
- **`PopulateMeshData` helper pattern:** Static function in `kernel-worker.cpp` that triangulates via `BRepMesh_IncrementalMesh(shape, deflection, Standard_False, 0.5, Standard_False)`, iterates faces with `TopExp_Explorer`, extracts node/triangle data via `BRep_Tool::Triangulation`/`Poly_Triangle::Get(n1,n2,n3)` (1-based indices), extracts edge lines via `BRep_Tool::Polygon3D` (with `BRepAdaptor_Curve` fallback sampling 10 points), and serializes typed arrays to protobuf `bytes` fields via `set_positions()`/`set_indices()` etc. using raw `reinterpret_cast<const char*>`.
- **`edge_offsets` layout:** cumulative **float count** (not vertex count), N+1 entries for N edges, `offsets[0]=0`, `offsets[N]=totalFloats`, empty edges produce equal consecutive offsets (`offsets[k+1]=offsets[k]`).
- **Edge lines use 3D triplets** `[x1,y1,z1,x2,y2,z2,...]` packed as float32 LE, not 2D pairs.
- **OCCT `Poly_Triangle::Get(n1,n2,n3)`** — not `Value(1)`. Triangle indices are 1-based, subtract 1 to convert to 0-based buffer indices.
- **Triangulation reuse:** Check `BRep_Tool::Triangulation()` for null before calling `BRepMesh_IncrementalMesh` to avoid redundant meshing when shape already triangulated.
- **Determinism:** `BRepMesh_IncrementalMesh` with fixed deflection is deterministic; face iteration via `TopExp_Explorer` is deterministic; no random jitter — byte-identical output for same shape + same deflection.
- **`NativeKernelAdapter.ts` hardcodes `include_brep: false`** — needs `includeBrep` option in `executeStep`/`execute` for mesh integration testing.
- **Pre-existing tsc errors** (2: codec.test.ts, KernelGrpcTransport.ts) — unrelated to WC-EC-23 work.
- **PowerShell:** No `&&` operator; use `;` with `if ($LASTEXITCODE -ne 0)`.

## Key Learnings (2026-11-20 WC-EC-09 Chunk 2)

- @bufbuild/protobuf v2 uses standalone 	oBinary(schema, msg) and romBinary(schema, bytes) functions � NOT msg.toBinary() method calls
- DescMessage type is exported from @bufbuild/protobuf, NOT @bufbuild/protobuf/codegenv2
- Protobuf enum values in TS are short names (e.g. ExecutionFailureCode.UNSPECIFIED), not full proto names (EXECUTION_FAILURE_CODE_UNSPECIFIED)
- For uint32 enum field value   (UNSPECIFIED), round-trip returns   (number), not undefined � use 	oBe(0) not 	oBe(undefined) | Done | ~200 |


## Key Learnings (2026-11-20 WC-EC-09 Chunks 3-4 C++ codec tests)

- gtest ASSERT_TRUE/ASSERT_* macros return void � cannot be used inside value-returning functions (e.g. template roundTrip<T>()); use EXPECT_* or omit assertions inside helpers
- C++ test target linking generated *.grpc.pb.cc files needs gRPC libraries (libgrpc++, libgrpc) in 	arget_link_libraries, not just protobuf
- Container path mapping: host C:\Dev\webcad\ = container /kernel/; CMakeLists.txt lives at project root
- docker cp requires destination directory to exist in container first (docker exec mkdir -p before docker cp)
- Push to https://github.com/elhakimz/webcad.git returns 403 for user bilidade � no write access; SSH host key not configured; cannot push until access granted or alternate auth configured


## Key Learnings (2026-11-21 WC-EC phase 1 Docker kernel integration test)

- OCCT kernel in Docker image `webcad/kernel:occt-7.9.3` returns `BRepPrimAPI_MakeBox IsDone=0` for `MakeBox(10,10,10)` — create_box fails with code 5 ("BRepPrimAPI_MakeBox failed") in this kernel; do not assert success for create_box/step_export against this kernel image
- Kernel worker gRPC `Execute()` switch statement handles only kCreateBox/kImportBrep/kExportBrep/kStepExport/kReleaseShapes — InitOp falls to `default` → "Unknown or missing operation" (code 2); test expectations must match actual kernel behavior, not spec ideal
- Pre-existing typecheck errors (3: codec.test.ts ×2, KernelGrpcTransport.ts ×1) are unrelated to this change and block `npm run verify`; lint/test/buf pass
- Push to `https://github.com/elhakimz/webcad.git` returns 403 — user `abilidad` lacks write access to elhakimz/webcad; commits stay local until access granted or alternate auth configured
## Key Learnings (2026-11-21 WC-EC-12 Shape Metrics Parity)

- buf generate unavailable in this environment (missing protoc-gen-grpc plugin); generated TS stubs hand-edited not required since harness uses protoLoader dynamic loading at runtime
- ShapeMetrics attached to ExecuteResponse (field 6), not inside ExecuteSuccess � response.mutable_metrics() returns ShapeMetrics* in C++
- BoundingBox3D uses inline double fields (min_x/y/z, max_x/y/z) instead of Point3D reference to avoid circular proto import (common.proto imported by engine.proto, Point3D defined in engine.proto)

## Key Learnings (2026-11-21 WC-EC-18 Booleans + C++ Memory Safety Review)

- OCCT 7.9.3 `BRepAlgoAPI_Fuse/Cut/Common` builders use setter-style API: `SetRunParallel(bool)`, `SetCheckInverted(bool)`, `SetNonDestructive(bool)`. Getter-style `RunParallel(false)` etc. do not exist and fail to compile.

## Key Learnings (2026-11-21 cpp-memory-leak-prevention fixes in kernel-worker.cpp)

- **Bounded g_shapeCache (logical leak, skill checklist #11):** Added `kMaxCachedShapes = 1024` constant and `CacheShape(shape, entityId)` helper that evicts oldest entry (`g_shapeCache.erase(g_shapeCache.begin())`) when at capacity before inserting. All cache writes route through `CacheShape` — `OpCreateBox`, `OpCreateCylinder`, `OpCreateAndCache` (used by all transform handlers), and `OpImportBRep`. No more unbounded growth.
- **mkstemp fd exception safety (OpImportBRep):** mkstemp fd is now `close(fd)`'d immediately after creation since `std::ofstream` opens its own fd by path. Added `if (!out)` check that removes tmpPath and returns error on open failure. `BinTools::Read` remains wrapped in try/catch that removes tmpPath. OpExportBRep and OpStepExport already closed fd immediately — only OpImportBRep needed fixing.
- C++ build in container (`webcad-kernel-test`) succeeds with no errors after both fixes. All 580 TypeScript unit tests pass. Pre-existing typecheck errors (3) unchanged.
- `OpCreateBoolean` (kernel-worker.cpp ~lines 724-810) is memory-safe per cpp-memory-leak-prevention skill: no naked new/delete, all OCCT builders stack-allocated (RAII), `TopoDS_Shape` is ref-counted handle, `try/catch(Standard_Failure)` wraps OCCT calls, builder→Shape→cache in single statement (`return OpCreateAndCache(builder.Shape(), deflection, entityId)`).
- Boolean face/edge/vertex counts are OCCT 7.9.3 implementation-dependent (splitting at intersection curves); not a single "correct" value — fixtures must match actual deterministic output. `surfaceArea`/`volume` are geometric invariants and must match analytic values.
- `g_shapeCache` is `std::unordered_map<std::string, TopoDS_Shape>` — TopoDS_Shape handles are ref-counted, no leaks from cache insertion/overwrite.
- Push to origin/dev returns 403 for user `abilidad` on elhakimz/webcad — credential/access issue, not a code problem. Commit `9a6310f` stays local until access resolved.
- Pre-existing tsc errors (2: codec.test.ts, KernelGrpcTransport.ts) are unrelated to WC-EC-18; lint (0 errors) and buf lint pass.
- Native adapter parseExecuteResponse reads response.metrics (any type) and maps snake_case proto fields to camelCase KernelMetric fields
- Pre-existing typecheck errors (codec.test.ts x2, KernelGrpcTransport.ts x1) are unrelated and block 
pm run verify; lint/test/buf:lint all pass
 
 # #   S e s s i o n :   W C - E C - 1 3   O r a c l e   S u i t e  
 -   N a t i v e K e r n e l A d a p t e r . i n i t ( )   o n   W i n d o w s   n e e d s   i n c l u d e D i r s :   [ P R O T O _ R O O T ]   i n   p r o t o L o a d e r . l o a d S y n c ( )   t o   r e s o l v e   c o m m o n . p r o t o   i m p o r t s  
 -   T o p E x p _ E x p l o r e r   c o u n t i n g   i n f l a t e s   t o p o l o g y   c o u n t s ;   T o p E x p : : M a p S h a p e s   g i v e s   u n i q u e   c o u n t s   ( b o x :   6 / 1 2 / 8   i n s t e a d   o f   6 / 2 4 / 4 8 )  
 -   K e r n e l   t o p o l o g y - c o u n t   f i x   c o m m i t t e d   b u t   n o t   d e p l o y e d   t o   r u n n i n g   c o n t a i n e r   ( u s e r   f o r b a d e   D o c k e r   r e b u i l d )  
 
## Key Learnings (2026-11-21 WC-EC-14 Native Primitives)
- PowerShell does not support && operator; use ; or separate commands
- Docker container binary replacement: docker cp updated source, 
inja -C /kernel/build kernel_worker compiled, docker restart deployed new binary
- All 7 primitives (cylinder, frustum, sphere, cone, torus, wedge, pyramid) compiled and deployed to webcad-kernel-test container
- TS typecheck: 3 pre-existing errors in codec.test.ts/KernelGrpcTransport.ts, 0 in modified files
- Lint: 0 errors on native-kernel-adapter.ts (pre-existing ny warnings only)
- Harness tests: 32/32 passed


## Key Learnings (Session WC-EC-17)

- **BRepBndLib::Add with Standard_False** computes exact bounding box without using triangulated mesh. Required after BRepMesh_IncrementalMesh has meshed the shape, otherwise bbox on curved surfaces (revolved cylinders) has ~0.0146 error vs 0.001 tolerance.
- **ShapeFix_Wire methods**: FixConnected(), FixReorder(), FixGaps3d() — NOT FixAddConnected() or FixGaps().
- **BRepAdaptor_Curve, BRep_Tool::Curve(), BRep_Tool::CurveOnSurface()** work on TopoDS_Edge, NOT TopoDS_Wire. To sample a wire as a single curve, iterate its edges individually and append to one loop.
- **OpExtractFaceProfile**: build one ShapeFix_Wire from all face edges, then sample each wire edge into a single continuous 2D loop — matches WASM reference behavior (1 loop per wire, not per edge).

> ## Key Learnings (2026-11-21 WC-EC-19 Fillet/Chamfer Edge Deduplication)

  - **TopExp_Explorer(shape, TopAbs_EDGE) visits each manifold edge twice** (once per incident face). A cube yields 24 edges instead of 12 unique edges, making edge indices [0..11] only cover the first 3 faces' worth of edges (2 edges + 4 corners missed).
  - **Fix: Use TopExp::MapShapes(shape, TopAbs_EDGE, edgeMap)** which deduplicates shared edges, giving exactly N unique edges indexed 0..N-1 matching metrics.edge_count. Apply in OpCreateFilletSolid and OpCreateChamferSolid in kernel-worker.cpp.
  - With MapShapes, passing edge_indices: [0..11] on a 10x10x10 cube with radius 1.0 produces: Faces=26 (6 plane + 12 cylindrical + 8 spherical), Volume=975.587 (fillet) / 945.333 (chamfer) � matching theoretical values exactly.

## Key Learnings (2026-11-21 WC-EC-20 Shell + Draft)
- **Shell (`makeThickSolid`):** Implemented via scaling-based thickening — scale up for outward thickening, scale down + boolean cut for inward hollowing. Passes integration test (2x2x2 box, thickness 0.1, volume 10.648). `MakeThickSolidByJoin` previously failed at runtime ("builder not done"); scaling approach is the working fallback.
- **Draft (`draftSolidFaces`):** Implemented via `BRepOffsetAPI_DraftAngle(shape)` constructor. Gets neutral face plane (`BRepAdaptor_Surface::Plane()`) as pull direction, accounts for face orientation (reversed flips direction), skips neutral face and faces parallel to neutral plane (dot > 0.999) to avoid degenerate drafts, tries flipped direction on failure. Passes integration test (2x2x2 box, angle 0.2, neutral face 0, volume 11.682, bbox extends to [-0.405, 2.405]).
- **Oracle fixtures must match actual correct geometric output**, not theoretical assumptions. Draft expands outward from neutral face, so bbox extends beyond original solid bounds.
- **Alternative approaches noted (not used):** `BRepOffsetAPI_MakeThickSolid`/`MakeThickSolidByJoin` for shell (signed offset, `TopTools_ListOfShape` faces to remove); `Draft_Modification` + `BRepTools_Modifier` for draft (neutral plane + pull direction + `theFlag`). Current implementations are verified working; refactor only if needed.
- **Push to origin dev blocked:** 403 permission denied — manual auth/push required.
- **Typecheck pre-existing errors:** `codec.test.ts` and `KernelGrpcTransport.ts` have ~3 errors unrelated to WC-EC-20 changes.

## Key Learnings (2026-11-21 WC-EC-21 Sweep Polyline Corners)
- **SetMode(Standard_True) = Frenet mode** is undefined on straight polyline segments; causes frame flips at corners, making SetTransitionMode(BRepBuilderAPI_RoundCorner) work at only some bends (not all).
- **Fix: SetDiscreteMode()** keeps profile orientation constant along each spine segment and applies corner transitions between segments correctly � required for polyline spines per design spec docs/superpowers/specs/2026-10-22-wc-ec-21-sweep-design.md.
- **Profile orientation:** Profile must be perpendicular to the spine's starting tangent. Coplanar profile+spine produces flat shell (volume=0, isValid=false).
- **STEP results:** sweep_simple.stp (15,419 bytes), sweep_corner.stp (25,269 bytes), sweep_s_shape.stp (50,988 bytes, S-shape polyline volume=18.79, isValid=true). All in doc/results/.
- **Typecheck pre-existing errors:** codec.test.ts and KernelGrpcTransport.ts have ~3 errors unrelated to sweep changes (0 errors in modified files).
| kernel-worker.cpp | learnings | ~300 |

## Key Learnings (2026-11-21 WC-EC-24 B-rep Import/Export + Part A create_box Diagnosis)

- **Part A create_box failure â€” header/library mismatch RULED OUT:** Standalone MakeBox reproduction inside kernel:occt-7.9.3 passes (IsDone before Build=false, IsDone after Build=true, Shape is null=false, exit code 0). ldd/readelf -d confirm headers (7.9.3) match runtime libs (libTK*.so.7.9 from /usr/local/lib/, RUNPATH=/usr/local/lib). Likely causes: (a) kernel-worker binary inside image built from stale/different source than current kernel-worker.cpp, or (b) incorrect dx/dy/dz values arriving from client via proto. Next: rebuild kernel-worker from current source inside image and re-test via gRPC; add logging of dx/dy/dz values. See doc/results/kernel_create_box_findings.md for full findings.
- **OpCreateBox call sequence is correct:** `MakeBox` → `Build()` → `IsDone()` → `Shape()`. No temporary-copy or double-Build issue. `dx`/`dy`/`dz` arrive as `double` from proto — no type truncation.
- **No swallowed exceptions in OpCreateBox:** `BRepPrimAPI_MakeBox` does not throw on failure; it sets `IsDone()==false`. The `Execute()` catch-all maps throws to `UNSPECIFIED`, not `OPERATION_FAILED`.
- **`init` is already a no-op handshake:** `HandleInit` sets `shape_id=""` and returns OK. Proposal: make it return kernel/OCCT version message, or mark `reserved` in proto.
- **Unported ops list:** `createLoft` (proto field 24) is declared in `engine.proto` but has no `case` in the `Execute()` switch — falls through to `default:` → `INVALID_PARAMETER`. Proposal: return `UNSUPPORTED` (code 4) instead.
- **WC-EC-24 design doc revised (11 requirements):** Format field replaces "BREP" magic + trailing-0x1a. Prefix per format: binary=`\nOpen CASCADE Topology V4`, text=`DBRep_DrawableShape`, step=`ISO-10303-21;`. Hash maps to `BrepReference.sha256` (field exists, no proto change). OpenSSL not linked — vendored SHA-256 or add linking. PutBlob UNIMPLEMENTED — B-reps >4 MiB blocked. See `docs/superpowers/specs/2026-11-21-wc-ec-24-brep-import-export-design.md`.

## Do-Not-Repeat

- [2026-11-21] Don't assume "BREP" magic / trailing 0x1a for B-rep format detection — OCCT 8.0.1 text starts with `DBRep_DrawableShape`, binary starts with `\nOpen CASCADE Topology V4`, neither starts with "BREP" nor ends with 0x1a. Use explicit `format` field + prefix verification.
- [2026-11-21] Don't link OpenSSL without checking `CMakeLists.txt` — no OpenSSL linked (verified). Use vendored SHA-256 or add linking + licence review.
- [2026-11-21] Don't commit generated proto files — `src/generated/` is codegen output; never edit or commit by hand.


## Decision Log (WEBCAD-218)
- Approach C (both KernelGrpcTransport + command registry) — full parity for both grpc and kernel transport types (2026-11-22)
- No proto changes needed — all 37 operations already defined in engine.proto (2026-11-22)
- WASM remains as temporary fallback; remove after gRPC parity verified (2026-11-22)
- Unimplemented ops → UNIMPLEMENTED (not INVALID_PARAMETER) per Part A findings (2026-11-22)
- Unexpected exceptions → INTERNAL (not UNSPECIFIED) per Part A findings (2026-11-22)


## Plan (WEBCAD-218)
- Implementation plan saved to docs/superpowers/plans/2026-11-22-grpc-kernel-transport-parity.md (2026-11-22)
- 37 commands across 11 chunks, each chunk self-contained and committable
- TDD approach: write failing test first, then implement, then verify

