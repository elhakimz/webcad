# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-27T00:40:50.534Z
> Files: 575 tracked | Anatomy hits: 0 | Misses: 0

## ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/

- `apply_audit.py` — req, comment, main (~1068 tok)
- `apply_audit2.py` — req, comment, main (~1036 tok)
- `apply_descriptions.py` — req, main (~731 tok)
- `audit_actions.json` — Declares loc (~2081 tok)
- `backlog_data.json` — Declares loc (~4864 tok)
- `bridge_done.py` — req (~4721 tok)
- `catia_comment.py` — -*- coding: utf-8 -*- (~923 tok)
- `catia_create.py` — Create the Road to CATIA backlog under epic #13 and attach to a new module. (~372 tok)
- `catia_defs.py` — Ticket definitions for the Road to CATIA roadmap (Documents/3d/road_to_catia.md). (~7262 tok)
- `close_20.py` — req (~1147 tok)
- `close_webgpu_phase_ab.py` — Declares is (~2451 tok)
- `create_bugs.py` — it: req (~3159 tok)
- `create_cycles.py` — req, main (~1170 tok)
- `create_modules.py` — req, main (~956 tok)
- `create_outline_issue.py` (~889 tok)
- `create_webgpu_backlog.py` — there: html, h, p, ul + 1 more (~8794 tok)
- `dedupe_comments.py` — call (~433 tok)
- `desc_a.json` (~6880 tok)
- `desc_b.json` — Declares marks (~8690 tok)
- `fix_encoding.py` — req, main (~713 tok)
- `fix_undo_finding.py` — req, comment (~2541 tok)
- `link_webgpu_deps.py` (~217 tok)
- `plane_api.py` — req, paged (~477 tok)
- `populate_plane.py` — req, main (~748 tok)
- `probe_render.py` (~202 tok)
- `uat_log_page_0727.py` — call (~1481 tok)
- `uat_page.py` — req (~3374 tok)
- `uat_results.py` — req (~2650 tok)
- `verify_webgpu.py` (~184 tok)
- `wolf_update.py` — add (~1611 tok)
- `wolf_update2.py` — Declares from (~431 tok)
- `wolf_update3.py` — Declares of (~506 tok)

## ./

- `CMakeLists.txt` — Kernel C++ build configuration: OCCT 7.9.3 toolkits, protobuf, gRPC, platform-specific flags (~1300 tok)
- `Dockerfile.kernel` — Multi-stage Docker build: Ubuntu 22.04 + OCCT 7.9.3 + kernel worker, OCCT_VERSION build arg (~1300 tok)
- `.gitignore` — Git ignore rules (~47 tok)
- `AGENTS.md` — AGENTS.md - WebCAD Developer Guide (~346 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `eslint.config.js` — ESLint flat configuration (~228 tok)
- `gcs sketcher p2.md` — The dependency chain (~4119 tok)
- `gcs_sketcher_p1.md` — GCS Sketcher — Implementation Roadmap (~12927 tok)
- `GEMINI.md` — WebCAD Scaffold - Instructional Context (~651 tok)
- `index.html` — WebCAD - WebCAD 2.18 (~320 tok)
- `package-lock.json` — npm lock file (~50627 tok)
- `package.json` — Node.js package manifest (~364 tok)
- `playwright.config.ts` — Each page boots an OpenCascade WASM kernel and a Three.js WebGL context that (~405 tok)
- `README.md` — Project documentation (~2327 tok)
- `tsconfig.json` — TypeScript configuration (~59 tok)
- `vite.config.ts` — Vite build configuration (~1001 tok)
- `vitest.config.ts` — Vitest test configuration (~55 tok)

## ./src/core/gateway/

- `kernel-supervisor.ts` — Manages one native OCCT kernel process per session with spare pool, crash recovery (REHYDRATING → Restore → replay), health checks; delegates pool management to KernelPoolManager (~1300 tok)
- `kernel-supervisor.ts` — WC-EC-35: structured crash-event logging on kernel crash (exit code/signal, restart count) (~1300 tok)
- `session-manager.ts` — Session lifecycle (connected/restarting/rehydrating), event replay buffer with size+TTL eviction, kernel PID tracking (~1300 tok)
- `kernel-client.ts` — KernelClient interface + GrpcKernelClient (UDS/gRPC) implementation (~1300 tok)
- `stdio-kernel-client.ts` — Stdio-based kernel client alternative (~1300 tok)
- `kernel-pool-manager.ts` — WC-EC-34: KernelPoolManager for idle TTL eviction, CPU affinity (taskset), cgroup v2 memory/CPU limits, OOM detection and recovery (~1300 tok)
- `kernel-pool-manager.test.ts` — Vitest tests for KernelPoolManager: allocate/release, idle TTL eviction, spare pool culling, CPU affinity, cgroup limits, OOM detection (~1300 tok)
- `kernel-worker.cpp` — OCCT 7.9.3 kernel worker implementing KernelService (Execute over gRPC/UDS), shape cache, CreateBox/ImportBRep handlers, OpCreateSweep/HandleCreateSweep via BRepOffsetAPI_MakePipeShell (~1300 tok)

## ./src/core/harness/

- `native-kernel-adapter.ts` — TypeScript client harness: reads include_brep param from step params, parses MeshData byte fields into typed arrays (~1300 tok)
- `kernel-adapter.ts` — Shared interfaces: MeshData interface (positions, indices, faceMapping, edgeOffsets, edgeLines), optional mesh?: MeshData on KernelResult (~500 tok)

## ./tests/oracle/

- `native-oracle.integration.test.ts` — Integration tests against native kernel: create_box with/without include_brep MeshData tests (~800 tok)
- `fixtures/oracle/sweep_simple.json` — Oracle fixture: sweep square profile along straight spine, expect volume=10, edgeCount=12 (~400 tok)
- `fixtures/oracle/sweep_corner.json` — Oracle fixture: sweep square profile along bent spine with ROUND corner, expect volume=15, edgeCount=20 (~400 tok)
## .claude/

- `launch.json` (~52 tok)
- `settings.json` (~441 tok)
- `settings.local.json` (~312 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .github/workflows/

- `buf.yml` — CI: buf lint + breaking change check on proto/ (~600 tok)
- `kernel-build-guardrails.yml` — CI guardrails for Phase B kernel build speed item 5.8: cold kernel build time (configure + Ninja), stripped binary size, optional Docker image size vs spec section 6 thresholds (900 s / 100 MB / 1500 MB); ccache cache save/restore, $GITHUB_STEP_SUMMARY pass/fail table, upload-artifact timing results (~2k tok)

## .devcontainer/

- `devcontainer.json` — VS Code / GitHub Codespaces dev container config: ubuntu-22.04 base, C++ toolchain (gcc/g++, cmake, ninja-build, ccache, lld, gdb, lldb), protobuf/gRPC dev headers, postCreateCommand runs post-create.sh (~800 tok)
- `post-create.sh` — Post-create setup script: installs build essentials + kernel dependencies, best-effort mold install, lld fallback (~1.4k tok)

## scripts/

- `verify-kernel.sh` — One-command kernel verify: cmake configure (Ninja), build kernel_worker, ctest if available, parity subset via kernel-worker --cli, pass/fail + timing report (~2k tok)
- `sanitizer-check.sh` — WC-EC-35: CI-agnostic ASan/UBSan kernel build + crash-diagnostics test suite (~2k tok)

## docs/3d/

- `3d solid snapping, data and type of snap.md` — of: canConnect (~1176 tok)
- `3d solid snapping.md` — SNAP_TOLERANCE: executeAdvancedSnap (~1627 tok)
- `3d_render_technique.md` — The state machine (~4748 tok)
- `BASIC 3D ENTITIES.md` — WebCAD — Basic 3D Geometry System Pseudocode (~2601 tok)
- `boolean_ops_pseudocode.md` — Pseudocode: Boolean Operations — Union, Subtract, Intersect (~3976 tok)
- `code_review_v5.md` — Code Review — src v5 (~2471 tok)
- `current claude analysis.md` — Current State vs Roadmap — Full Gap Analysis (~2642 tok)
- `entity enhance.md` — Exports Solid3D (~1374 tok)
- `face  planar view 2.md` — Declares SketchEntity (~2364 tok)
- `face planar view , shape on face.md` — Declares createHoleFeature (~1030 tok)
- `face planar view, risk of face topology change aft.md` — Declares and (~1280 tok)
- `face planar view.md` — Declares getSketchCameraTransform (~987 tok)
- `fixin.md` — Root Cause (~1693 tok)
- `gcs sketcher p2.md` — The dependency chain (~4119 tok)
- `gcs_sketcher_p1.md` — GCS Sketcher — Implementation Roadmap (~12927 tok)
- `gizmo_pseudocode.md` — Gizmo Pseudocode — Move & Rotate for Solid3D (~4969 tok)
- `imageplane.md` — Loads the image and applies the selected mapping mode. (~1735 tok)
- `inspection_report.md` — WebCAD Source Inspection Report (~1185 tok)
- `logs.log` — Declares from (~2197 tok)
- `Macro Scad Recording.md` — Declares in (~1754 tok)
- `must_add.md` — OpenCascade.js 3D Transformation Requirements (~796 tok)
- `must_add2.md` — OpenCascade.js Advanced 3D Primitives & Operations (~855 tok)
- `occ_error_codes.md` — OpenCASCADE.js — Error Code Reference (~3536 tok)
- `OCC_new_ops.md` — The Core Primitive: `applyTransform` (~2678 tok)
- `open_cascade_mesh_reduce (1).md` — OpenCascade.js — Mesh Reduction Guide (~1700 tok)
- `OpenCascade Integration.md` — OpenCascade Integration — WebCAD Pseudocode Architecture (~2650 tok)
- `parametric_dag_roadmap.md` — Parametric Feature DAG — Implementation Roadmap (~9067 tok)
- `PRD_3_Impl.md` — 📄 Detailed Implementation Plan (~2588 tok)
- `PRD_3.md` — 📄 PRD — Part 3 (Corrected) (~8874 tok)
- `PRD_SQL (1).md` — PRD_SQL — WebCAD Persistence & Cache Layer (v2) (~9755 tok)
- `PRD3_readiness.md` — PRD_3 Readiness Assessment (~3575 tok)
- `RENDER.md` — WebCAD Rendering Modes — Detailed Pseudocode (~2286 tok)
- `review-2026-05-18.md` — What this project is (~1844 tok)
- `road_to_catia.md` — Road to CATIA & Autodesk Inventor: Advanced Parametric Architecture (~4138 tok)
- `scaling solid.md` — Declares scaleShape (~1981 tok)
- `selection_3D_pseudocode.md` — 3D Selection — Pseudocode (~5994 tok)
- `solid_boolean_inspection.md` — Inspection Report — Solid Geometry & Boolean Ops (~2931 tok)
- `svg_import_agent_instructions.md` — Agent Task: SVG Import → Polylines for WebCAD (~10885 tok)
- `sweep_pipe_shell.md` — Pipe Shell Sweep in OpenCascade (~674 tok)
- `UCS.md` — WebCAD UCS (User Coordinate System) — Detailed Pseudocode (~2097 tok)
- `VIEWS.md` — WebCAD View Commands — Pseudocode (~2295 tok)
- `wedge.fixing.md` — Declares dx (~906 tok)

## vendors/BOSL-master/

- `.gitignore` — Git ignore rules (~329 tok)
- `LICENSE` — Project license (~352 tok)
- `README.md` — Project documentation (~1692 tok)
- `WRITING_DOCS.md` — Formatting Comments for Docs (~1563 tok)

## vendors/BOSL-master/.github/ISSUE_TEMPLATE/

- `bug_report.md` (~131 tok)
- `feature_request.md` (~164 tok)

## vendors/BOSL-master/examples/

- `bezier_patches.scad` — CR_corner: CR_edge (~1138 tok)
- `orientations.scad` (~598 tok)

## vendors/BOSL-master/scripts/

- `docs_gen.py` — ImageProcessing: get_header_link, toc_entry, mkdn_esc, get_comment_block + 9 more (~6693 tok)
- `make_all_docs.sh` (~245 tok)

## vendors/BOSL-master/tests/

- `test_convex_hull.scad` — Declares hull_contains_index (~532 tok)
- `test_math.scad` (~4941 tok)

## docs/base/

- `ANNOTATE.md` — 📄 WebCAD Pseudocode (~1986 tok)
- `ARRAY.md` — 📄 ARRAY Command (2D) — Pseudocode (~1230 tok)
- `AutoCAD_2_18_Draw_Commands.md` — AutoCAD 2.18 (DOS) DRAW Commands (~702 tok)
- `AutoCAD_2_18_EDIT_Commands.md` — AutoCAD 2.18 (DOS) EDIT Commands: Reference & Pseudocode (~2357 tok)
- `AutoCAD_2_18_LAYER_Commands.md` — 📄 WebCAD Command Reference (AutoCAD 2.x Style) (~1720 tok)
- `autocad_2_18_shp_parser.md` — 📄 SHP / SHX Parser Design (WebCAD / Three.js) (~1627 tok)
- `autocad_2_18_sketch_shape.md` — 📄 AutoCAD 2.18 Command Reference (Pseudocode) (~1134 tok)
- `AutoCAD_2_18_TEXT_Command.md` — cmdText: flattenBezier (~1419 tok)
- `AutoCAD_2_18_UTILITY_Commands.md` — 📄 WebCAD UTILITY Commands (Pseudocode) (~1729 tok)
- `autocad_DISPLAY_commands.md` — 📄 WebCAD DISPLAY Commands (AutoCAD 2.x Style) (~1428 tok)
- `bounding_box.md` — Implementing Bounding Box Selection in CAD (~901 tok)
- `CHAMFER_BREAK_JOIN.md` — 📄 WebCAD 2D Editing Commands — Pseudocode (~1804 tok)
- `DIMALIGNED.md` — 📄 DIMALIGNED — Deep CAD-Grade Pseudocode (~2018 tok)
- `DIMDIAMETER,md` (~2624 tok)
- `DIMENSION.md` — 📄 DIMENSION RENDERING ENGINE (2D) (~1496 tok)
- `DIMENSION2.md` — 🧠 The Core Problem of CAD Dimensions (~1854 tok)
- `DIMTOH_DIMTAD.md` — 📄 WebCAD — Deep Pseudocode (~2140 tok)
- `ELLIPSE TRIM.md` — 🎯 Correct Solution (~1273 tok)
- `EXTEND.md` — 📄 EXTEND Command (2D) — Pseudocode (~1197 tok)
- `fix_svg2pdf_fonts_agent.md` — Agent Task: Fix svg2pdf Font Rendering — Convert Text to Paths (~3470 tok)
- `HATCH.md` — 📄 WebCAD HATCH — Deep CAD-Grade Pseudocode (~2237 tok)
- `INQUIRY.md` — WebCAD INQUIRY Commands — Pseudocode Design (~2325 tok)
- `LWPOLYLINE.md` — WebCAD LWPOLYLINE — Detailed Pseudocode Design (~2404 tok)
- `MTEXT.md` — MTEXT — Corrected Pseudocode (~4508 tok)
- `OFFSET.md` — OFFSET — Polyline Pseudocode (~2049 tok)
- `PLOT_agent_instructions.md` — Agent Task: Implement PLOT Command for WebCAD (~12476 tok)
- `PLOT_command_pseudocode.md` — PLOT Command — Pseudocode (~8552 tok)
- `PRD_PART2.md` — 📄 PRD — Part 2 (~1589 tok)
- `PRD.md` — 🚀 WebCAD Execution Plan (Engineering Roadmap) (~1851 tok)
- `Pseucode_draw_hatch.md` — 🧠 ANSI31 Definition (what you must replicate) (~1140 tok)
- `pseudocode_draw_hatch_adv.md` — 🧠 1. Generalized Hatch Pattern Model (~1120 tok)
- `pseudocode_hatch_PAT_parser.md` — 🧠 1. What a `.PAT` File Actually Is (~1331 tok)
- `pseudocode_PAT_to_hatch_engine.md` — 🧠 Big Picture (~1248 tok)
- `SPLINE.md` — WebCAD SPLINE Feature — Pseudocode Design (~2070 tok)
- `STRETCH.md` — WebCAD STRETCH Command — Detailed Pseudocode (~2467 tok)
- `TRIM.md` — ✂️ TRIM Command (2D) — Pseudocode (~1191 tok)
- `webcad_pat.md` — 📄 Sample `webcad.pat` (~805 tok)

## vendors/chili3d/packages/

- `global.d.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~184 tok)

## vendors/chili3d/packages/app/

- `package.json` — Node.js package manifest (~50 tok)

## vendors/chili3d/packages/app/src/

- `application.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2373 tok)
- `document.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1321 tok)
- `editEventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~179 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~98 tok)
- `pluginManager.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~4889 tok)
- `selection.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1678 tok)
- `utils.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~236 tok)

## vendors/chili3d/packages/app/src/bodys/

- `arc.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~487 tok)
- `boolean.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~250 tok)
- `box.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~542 tok)
- `circle.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~492 tok)
- `cone.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~502 tok)
- `cylinder.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~523 tok)
- `ellipse.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~677 tok)
- `face.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~612 tok)
- `fuse.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~340 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~157 tok)
- `line.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~366 tok)
- `pipe.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1739 tok)
- `point.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~299 tok)
- `polygon.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~324 tok)
- `prism.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~416 tok)
- `pyramid.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~482 tok)
- `rect.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~552 tok)
- `regularPolygon.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~795 tok)
- `revolve.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~440 tok)
- `sphere.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~379 tok)
- `sweep.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~554 tok)
- `wire.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~279 tok)

## vendors/chili3d/packages/app/src/bodys/utils/

- `BendTypeConverter.ts` — Exports BendTypeConverter (~309 tok)
- `WireFilletBuilder.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1483 tok)

## vendors/chili3d/packages/app/src/commands/

- `boolean.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1018 tok)
- `createActCommand.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~243 tok)
- `createCommand.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~398 tok)
- `delete.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~394 tok)
- `folder.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~169 tok)
- `importExport.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~834 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~154 tok)
- `multistepCommand.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1109 tok)
- `redo.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~140 tok)
- `undo.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~144 tok)
- `workingPlane.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1374 tok)

## vendors/chili3d/packages/app/src/commands/application/

- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~103 tok)
- `newDocument.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~136 tok)
- `openDocument.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~292 tok)
- `performanceTest.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~649 tok)
- `saveDocument.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~225 tok)
- `toFile.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~303 tok)
- `toggleDynamicWorkplane.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~165 tok)
- `wechatGroup.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~355 tok)

## vendors/chili3d/packages/app/src/commands/create/

- `arc.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1186 tok)
- `bezier.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1099 tok)
- `box.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~602 tok)
- `circle.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~660 tok)
- `cone.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1150 tok)
- `converter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1560 tok)
- `copySubShape.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~426 tok)
- `curveProjection.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~541 tok)
- `cylinder.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1075 tok)
- `ellipse.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1123 tok)
- `group.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1917 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~236 tok)
- `line.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~617 tok)
- `loft.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1255 tok)
- `offset.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1360 tok)
- `pipe.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1342 tok)
- `point.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~187 tok)
- `polygon.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~951 tok)
- `prism.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~590 tok)
- `pyramid.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~608 tok)
- `rect.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1020 tok)
- `regularPolygon.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~983 tok)
- `revolve.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~593 tok)
- `section.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~369 tok)
- `sphere.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~553 tok)
- `sweep.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~422 tok)
- `thickSolid.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~546 tok)

## vendors/chili3d/packages/app/src/commands/measure/

- `angle.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1388 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~60 tok)
- `length.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~616 tok)
- `select.module.css` — Styles: 1 rules (~395 tok)
- `select.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2151 tok)

## vendors/chili3d/packages/app/src/commands/modify/

- `array.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~4378 tok)
- `break.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~863 tok)
- `brush.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~988 tok)
- `chamfer.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~691 tok)
- `explode.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~943 tok)
- `fillet.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~690 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~152 tok)
- `mirror.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~578 tok)
- `move.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~384 tok)
- `removeFeature.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~604 tok)
- `removeSubShapes.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~568 tok)
- `rotate.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1210 tok)
- `sew.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~672 tok)
- `simplify.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~781 tok)
- `split.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~844 tok)
- `transformedCommand.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~970 tok)
- `trim.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2344 tok)

## vendors/chili3d/packages/app/src/services/

- `commandService.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1036 tok)
- `editorService.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~402 tok)
- `hotkeyService.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1347 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~66 tok)

## vendors/chili3d/packages/app/test/

- `command.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~47 tok)
- `document.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2147 tok)

## vendors/chili3d/packages/builder/

- `package.json` — Node.js package manifest (~84 tok)

## vendors/chili3d/packages/builder/src/

- `appBuilder.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1505 tok)
- `defaultDataExchange.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1666 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~46 tok)
- `ribbon.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1333 tok)

## vendors/chili3d/packages/core/

- `package.json` — Node.js package manifest (~41 tok)

## vendors/chili3d/packages/core/src/

- `application.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~457 tok)
- `config.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1318 tok)
- `constants.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~85 tok)
- `dataExchange.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~135 tok)
- `document.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~293 tok)
- `editor.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~118 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~252 tok)
- `material.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2350 tok)
- `modelManager.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1707 tok)
- `navigation.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~450 tok)
- `property.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~602 tok)
- `selection.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~360 tok)
- `selectionFilter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~213 tok)
- `service.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~83 tok)
- `snapType.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~309 tok)

## vendors/chili3d/packages/core/src/command/

- `command.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1250 tok)
- `commandData.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~204 tok)
- `commandKeys.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~96 tok)
- `commandStore.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~528 tok)
- `decorator.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~121 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~91 tok)
- `shortcutProfiles.ts` — Exports Chili3dShortcuts, DefaultShortcuts, RevitShortcuts, BlenderShortcuts + 3 more (~562 tok)

## vendors/chili3d/packages/core/src/eventHandlers/

- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~76 tok)
- `nodeSelectionEventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1186 tok)
- `selectionEventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1337 tok)
- `shapeSelectionEventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1596 tok)

## vendors/chili3d/packages/core/src/foundation/

- `asyncController.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~468 tok)
- `binding.ts` — Bind the property chain as a path, separated by dots (~1273 tok)
- `collection.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1423 tok)
- `converter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~92 tok)
- `deepObserver.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1501 tok)
- `disposable.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~139 tok)
- `equalityComparer.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~61 tok)
- `gc.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~303 tok)
- `history.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1693 tok)
- `id.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~284 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~232 tok)
- `lazy.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~123 tok)
- `linkedList.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1068 tok)
- `logger.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~320 tok)
- `messageType.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~53 tok)
- `objectStorage.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~423 tok)
- `observer.ts` — Set the value of a private property, and if successful, execute emitPropertyChanged. (~1464 tok)
- `precision.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~62 tok)
- `pubsub.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1041 tok)
- `result.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~590 tok)
- `storage.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~153 tok)
- `transaction.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~734 tok)

## vendors/chili3d/packages/core/src/foundation/comparers/

- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~61 tok)
- `NumberEqualityComparer.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~142 tok)
- `XYZEqualityComparer.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~149 tok)

## vendors/chili3d/packages/core/src/foundation/dto/

- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~69 tok)

## vendors/chili3d/packages/core/src/foundation/utils/

- `debounce.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~145 tok)
- `download.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~140 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~63 tok)
- `readFileAsync.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~743 tok)

## vendors/chili3d/packages/core/src/i18n/

- `i18n.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1190 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~52 tok)
- `keys.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2162 tok)

## vendors/chili3d/packages/core/src/math/

- `boundingBox.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2163 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~122 tok)
- `line.ts` — unit vector (~545 tok)
- `lineSegment.ts` — Calculates the shortest distance between this line segment and another line segment. (~1682 tok)
- `mathUtils.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~356 tok)
- `matrix4.ts` — Matrix in column-major order (~3894 tok)
- `plane.ts` — unit vector (~927 tok)
- `planeAngle.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~569 tok)
- `quaternion.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1132 tok)
- `ray.ts` — unit vector (~247 tok)
- `xy.ts` — Computes the angular value in radians between me and right (~897 tok)
- `xyz.ts` — Gets the component value of a vector at the specified index (~1926 tok)

## vendors/chili3d/packages/core/src/model/

- `component.ts` — Part of the Chili3d Project, under the AGPL-3.0 Licensettt. (~2960 tok)
- `facebaseNode.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~157 tok)
- `folderNode.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2651 tok)
- `geometryNode.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2011 tok)
- `groupNode.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~225 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~113 tok)
- `meshNode.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~487 tok)
- `node.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3052 tok)
- `shapeNode.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1859 tok)
- `visualNode.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~352 tok)

## vendors/chili3d/packages/core/src/plugin/

- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~61 tok)
- `manager.ts` — Load plugins from a file, the plugin file must be a zip file (~326 tok)
- `manifest.ts` — Author information type (~374 tok)
- `plugin.ts` — Commands to register (~179 tok)

## vendors/chili3d/packages/core/src/serialize/

- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~46 tok)
- `serializer.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2096 tok)

## vendors/chili3d/packages/core/src/shape/

- `curve.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1243 tok)
- `geometry.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~134 tok)
- `geometryUtils.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1110 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~120 tok)
- `lineType.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~50 tok)
- `meshData.ts` — LineSegments (~2924 tok)
- `shape.ts` — they share the same TShape with the same Locations and Orientations. (~897 tok)
- `shapeConverter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~227 tok)
- `shapeFactory.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~927 tok)
- `shapeType.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~688 tok)
- `surface.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1040 tok)

## vendors/chili3d/packages/core/src/snap/

- `dimension.ts` — * @param value 1: D1, 2: D2, 3: D3, other: None (~246 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~61 tok)
- `snap.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~364 tok)

## vendors/chili3d/packages/core/src/snap/handlers/

- `angleSnapEventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~697 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~84 tok)
- `lengthSnapEventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1246 tok)
- `pointSnapEventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2014 tok)
- `snapEventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2505 tok)

## vendors/chili3d/packages/core/src/snap/snaps/

- `axisSnap.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~574 tok)
- `baseSnap.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~649 tok)
- `featurePointStrategy.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~793 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~73 tok)
- `objectSnap.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2731 tok)
- `planeSnap.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~487 tok)
- `pointOnCurveSnap.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~230 tok)

## vendors/chili3d/packages/core/src/snap/tracking/

- `axis.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~300 tok)
- `axisTracking.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~476 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~66 tok)
- `objectTracking.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~865 tok)
- `trackingBase.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~384 tok)
- `trackingSnap.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2272 tok)

## vendors/chili3d/packages/core/src/step/

- `angleStep.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~368 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~78 tok)
- `lengthStep.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~395 tok)
- `pointStep.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~858 tok)
- `selectStep.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1254 tok)
- `step.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~579 tok)

## vendors/chili3d/packages/core/src/ui/

- `button.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~117 tok)
- `combobox.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~220 tok)
- `dialog.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~87 tok)
- `floatPanel.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~118 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~84 tok)
- `ribbon.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1122 tok)
- `window.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~99 tok)

## vendors/chili3d/packages/core/src/visual/

- `act.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~536 tok)
- `cameraController.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~231 tok)
- `cursorType.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~56 tok)
- `detectedData.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~118 tok)
- `eventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~181 tok)
- `highlighter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~224 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~193 tok)
- `meshExporter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~132 tok)
- `meshUtils.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3000 tok)
- `textGenerator.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~91 tok)
- `view.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~808 tok)
- `viewGizmo.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~69 tok)
- `viewport.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~59 tok)
- `viewUtils.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~755 tok)
- `visual.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~257 tok)
- `visualContext.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~403 tok)
- `visualFactory.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~95 tok)
- `visualObject.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~210 tok)
- `visualShape.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~252 tok)

## vendors/chili3d/packages/core/test/

- `act.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3193 tok)
- `application.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1112 tok)
- `asyncController.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1440 tok)
- `binding.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~877 tok)
- `boundingBox.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~4300 tok)
- `collection.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~563 tok)
- `combobox.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1696 tok)
- `command.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~6890 tok)
- `component.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3822 tok)
- `config.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1980 tok)
- `debounce.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1290 tok)
- `decorator.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~919 tok)
- `deepObserver.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1765 tok)
- `disposable.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~590 tok)
- `facebaseNode.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2090 tok)
- `gc.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1025 tok)
- `geometryNode.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2625 tok)
- `groupNode.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~433 tok)
- `history.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~406 tok)
- `i18n.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2596 tok)
- `id.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~504 tok)
- `lazy.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~941 tok)
- `line.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1245 tok)
- `linesegment.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1577 tok)
- `linkedList.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~776 tok)
- `localStorageMock.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~613 tok)
- `logger.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~838 tok)
- `material.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~4213 tok)
- `mathUtils.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~756 tok)
- `matrix.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1727 tok)
- `meshData.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~4258 tok)
- `meshUtils.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~4680 tok)
- `modelManager.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3605 tok)
- `navigation.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1734 tok)
- `node.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1284 tok)
- `nodeList.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2661 tok)
- `objectStorage.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2062 tok)
- `observer.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~701 tok)
- `plane.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~606 tok)
- `planeAngle.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1061 tok)
- `precision.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~577 tok)
- `property.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3391 tok)
- `pubsub.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1735 tok)
- `quaternion.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~170 tok)
- `ray.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1061 tok)
- `result.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~211 tok)
- `selectionFilter.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1153 tok)
- `serializer.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~533 tok)
- `shapeNode.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3247 tok)
- `shapeType.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1725 tok)
- `snapType.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~144 tok)
- `task.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~376 tok)
- `testDocument.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~633 tok)
- `transaction.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~463 tok)
- `visual.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1588 tok)
- `visualNode.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2382 tok)
- `xy.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2575 tok)
- `xyz.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3709 tok)

## vendors/chili3d/packages/element/

- `package.json` — Node.js package manifest (~51 tok)

## vendors/chili3d/packages/element/src/

- `collection.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~951 tok)
- `elements.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1230 tok)
- `htmlProps.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~119 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~95 tok)
- `radioGroup.module.css` — Styles: 1 rules (~104 tok)
- `radioGroup.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~452 tok)
- `utils.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~372 tok)

## vendors/chili3d/packages/element/src/converters/

- `colorConverter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~436 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~86 tok)
- `numberConverter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~167 tok)
- `stringConverter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~122 tok)
- `urlConverter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~101 tok)
- `xyzConverter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~280 tok)

## vendors/chili3d/packages/element/src/expander/

- `expander.module.css` — Styles: 7 rules (~170 tok)
- `expander.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~571 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~46 tok)

## vendors/chili3d/packages/element/test/

- `collection.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2942 tok)
- `converter.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~919 tok)
- `expander.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3808 tok)
- `radioGroup.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1945 tok)
- `styleMock.js` — Part of the Chili3d Project, under the AGPL-3.0 License. (~44 tok)
- `urlConverter.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~291 tok)

## vendors/chili3d/packages/i18n/

- `package.json` — Node.js package manifest (~50 tok)

## vendors/chili3d/packages/i18n/src/

- `en.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3622 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~68 tok)
- `pt-br.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~750 tok)
- `zh-cn.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3111 tok)

## vendors/chili3d/packages/storage/

- `package.json` — Node.js package manifest (~51 tok)

## vendors/chili3d/packages/storage/src/

- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~48 tok)
- `indexedDBStorage.ts` — * @param db IDBDatabase (~1837 tok)

## vendors/chili3d/packages/three/

- `package.json` — Node.js package manifest (~78 tok)

## vendors/chili3d/packages/three/src/

- `cameraController.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3603 tok)
- `common.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~740 tok)
- `constants.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~97 tok)
- `highlightable.ts` — Part of the Chili3d Project, under the AGPL-3.0 Licensettt. (~113 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~49 tok)
- `meshExporter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~758 tok)
- `outlinePass.js` — This is a forked and simplified version of the OutlinePass from three.js. In order to improve performance, various (~3475 tok)
- `threeGeometry.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2442 tok)
- `threeGeometryFactory.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1177 tok)
- `threeHelper.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1606 tok)
- `threeHighlighter.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2905 tok)
- `threeView.module.css` — Styles: 2 rules, 2 vars (~215 tok)
- `threeView.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~6573 tok)
- `threeViewEventHandler.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1980 tok)
- `threeVisual.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~711 tok)
- `threeVisualContext.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~4242 tok)
- `threeVisualFactory.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~125 tok)
- `threeVisualObject.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~3934 tok)
- `viewGizmo.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2994 tok)

## vendors/chili3d/packages/three/test/

- `cameraControls.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~81 tok)
- `testDocument.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~558 tok)
- `testEdge.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1355 tok)
- `testView.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~614 tok)
- `three.test.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~550 tok)
- `viewGizmo.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~108 tok)

## vendors/chili3d/packages/ui/

- `package.json` — Node.js package manifest (~59 tok)

## vendors/chili3d/packages/ui/src/

- `dialog.module.css` — Styles: 4 rules (~372 tok)
- `dialog.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~569 tok)
- `editor.module.css` — Styles: 6 rules, 1 media queries (~453 tok)
- `editor.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1409 tok)
- `floatPanel.module.css` — Styles: 6 rules (~365 tok)
- `floatPanel.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1540 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~62 tok)
- `mainWindow.module.css` — Styles: 1 rules, 70 vars (~1188 tok)
- `mainWindow.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~1281 tok)
- `okCancel.module.css` — Styles: 2 rules (~319 tok)
- `okCancel.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~467 tok)
- `permanent.module.css` — Styles: 4 rules, 1 animations (~233 tok)
- `permanent.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~305 tok)

## vendors/chili3d/packages/ui/src/cursor/

- `draw.cur` (~224 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~139 tok)

## vendors/chili3d/packages/ui/src/home/

- `home.module.css` — Styles: 3 rules, 2 vars (~2276 tok)
- `home.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~2256 tok)
- `index.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~45 tok)
- `languageSelector.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~261 tok)
- `navigation3DSelector.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~259 tok)
- `themeSelector.ts` — Part of the Chili3d Project, under the AGPL-3.0 License. (~332 tok)

## data/

- `shapes.shp` (~92 tok)
- `test.shp` (~163 tok)
- `webcad.pat` (~451 tok)

## docs/plans/

- `kernel_abstraction.md` — Kernel-Agnostic Geometry Service — Design Sketch (~2642 tok)
- `rendering_roadmap.md` — Rendering Roadmap — toward an Onshape-grade viewport (~2080 tok)

## doc/results/

- `kernel_create_box_findings.md` — Part A findings: kernel create_box P0 failure diagnosis — header/lib mismatch hypothesis, OpCreateBox call sequence correct, no swallowed exceptions, init is no-op handshake, unported ops (createLoft) return INVALID_PARAMETER → propose UNSUPPORTED, test changes recommended (~9k)

## docs/superpowers/specs/
- `2026-11-25-wc-ec-34-kernel-process-pool-idle-eviction-cgroup-design.md` — WC-EC-34 design spec: KernelPoolManager for idle TTL eviction, CPU affinity, cgroup memory/CPU limits, OOM detection and recovery (~14k tok)
> - `2026-11-25-wc-ec-35-crash-isolation-diagnostics-sanitizer-design.md` — WC-EC-35 design spec: crash isolation 
(exit code/signal capture, structured crash logging, respawn via pool manager), diagnostics (structured logging only), 
sanitizer CI script (ASan/UBSan build + crash-diagnostics test) (~9k tok)
  
## docs/superpowers/plans/
- `2026-11-19-grpc-connect-transport.md` — Implementation plan for gRPC/Connect transport replacement across three PRs (~13k tok)
- `2026-11-19-parity-harness.md` — Implementation plan for WC-EC-12 parity harness: WASM worker vs native OCCT kernel comparison with tolerances (~14k tok)
- `2026-11-20-wc-ec-05-kernel-skeleton.md` — Implementation plan for WC-EC-05 kernel skeleton: native OCCT 7.9.3 kernel worker behind gRPC/UDS, gateway supervisor with process pool, crash recovery (REHYDRATING → Restore → replay), transport integration, E2E verification (~19k tok)
- `2026-11-20-kernel-dependency-implementation-plan.md` — Implementation plan for dependency triage work: font credits, OCCT image size optimization, B-rep TKBin import/export, STEP/STL export, OCCT license doc, unverified item verification (~15k tok)
- `2026-11-20-handler-scaffolding-template.md` — Phase B item 5.5 handler scaffolding template: concrete C++ handler pattern (oneof dispatch, payload decoding, OCCT-logic-only OpXxx + HandleXxx, in-band ExecutionFailureCode), per-handler checklist (inputs validated, entityId cache store/release, failure codes, unit tests, parity script), the 4 existing handlers as examples, step-by-step add-a-handler guide (~5k tok)
- `2026-11-20-port-workflow.md` — Phase B item 5.6 port workflow: Python OCP prototype workflow, parity-harness-as-oracle rule, ~15 files / ~600 lines PR budget, step-by-step port sequence (proto op → Python OCP → OpXxx → HandleXxx → switch case → CLI branch → unit tests → parity script → PR), create_cylinder porting example, harness runbook for Python vs C++ results (~6k tok)
- `2026-11-20-dev-environment.md` — Dev environment setup for Phase B item 5.7: .devcontainer configuration, verify-kernel.sh usage, sanitizer (asan/ubsan) builds, gdb/lldb debugging (~6k tok)
- `2026-11-20-binary-occt-evaluation.md` — Phase B item 5.9 Binary OCCT evaluation: conda-forge occt 7.9.3 novtk via micromamba (proposed primary), vcpkg (no OCCT package), Debian/Ubuntu (max 7.6.3, not 7.9.3), from-source occt-base Docker as documented fallback (~11k tok)
- `2026-11-20-wc-ec-09-kernel-protocol-codecs.md` — Implementation plan for WC-EC-09 kernel protocol codecs (TS + C++): TS codec round-trip, misaligned bytes, 256 KiB boundary tests in vitest; C++ codec round-trip, misaligned bytes, 256 KiB boundary tests in CTest (~32k tok)
- `2026-10-22-wc-ec-21-sweep-plan.md` — WC-EC-21 sweep implementation plan: port createSweep to native OCCT kernel using BRepOffsetAPI_MakePipeShell (~20k tok)

## docs/superpowers/specs/

- `2026-10-21-grpc-connect-transport-design.md` — Replacing WebSocket transport with gRPC (kernel link) and Connect (browser link) (~4600 tok)
- `2026-11-19-grpc-connect-transport.md` — Implementation plan for gRPC/Connect transport replacement across three PRs (~13k tok)
- `2026-11-19-parity-harness-design.md` — Parity harness: WASM worker vs native OCCT kernel comparison with tolerances (~4000 tok)
- `2026-11-20-vitest-protobuf-alias-fix-design.md` — Vitest protobuf alias fix design spec (SUPERSEDED by regenerate-protobuf-es-v2-design.md): add resolve.alias to vitest.config.ts via shared vite.aliases.ts module (~4000 tok)
- `2026-11-20-regenerate-protobuf-es-v2-design.md` — Regenerate protobuf with protoc-gen-es v2 design spec: replace v1 generated code, delete compat shims, remove aliases (~4300 tok)
- `2026-11-20-kernel-strategy-adr-design.md
- `2026-11-20-kernel-dependency-triage-spec.md` — Dependency triage & reuse plan for native OCCT kernel using materializr as reference: adopt OCCT in kernel, zlib in gateway (Node built-in), skip ImGui/SDL3/GLEW/pfd/libcurl/GLM, keep nanosvg/fonts in browser; OCCT build flags, export analysis, LGPL license text (~27k tok)
- `2026-11-20-wc-ec-09-kernel-protocol-design.md` — WC-EC-09 language-neutral kernel protocol spec: wire protocol semantics, TS/C++ codec validation, data flow, error handling, testing (~9000 tok)
- `2026-10-22-wc-ec-21-sweep-design.md` — WC-EC-21 sweep design spec: OCCT BRepOffsetAPI_MakePipeShell sweep operation, corner modes, solid capping (~20k tok)
- `2026-11-23-wc-ec-22-loft-design.md` — WC-EC-22 loft design spec: OCCT BRepOffsetAPI_ThruSections loft operation, wires + vertex apex, is_ruled/is_solid, id+points profile refs (~2k tok)
- `2026-11-21-wc-ec-24-brep-import-export-design.md` — Revised WC-EC-24 B-rep import/export design: explicit format field (binary|text|step) replacing BREP magic + trailing-0x1a, prefix verification per format, kernel import supports BinTools/BRepTools/STEPControl_Reader, export text B-rep for WASM fallback, hash to BrepReference.sha256 (no proto change), OpenSSL not linked (vendored SHA-256 or add linking), ValidateBrepInput factored into pure C++ + GoogleTest, real fuzzing (libFuzzer/AFL++, ASan/UBSan), committed fixtures, size limits reconciled (64MB kernel vs 4MiB/16MiB gRPC, PutBlob UNIMPLEMENTED), specific failure reasons, Open questions + Risks sections (~10k)

## Root

- `CMakeLists.txt` — Kernel C++ build: OCCT 7.9.3 toolkits, protobuf, gRPC; kernel_worker target (~1300 tok)
- `Dockerfile.kernel` — Multi-stage OCCT 7.9.3 build image + kernel worker; `OCCT_VERSION` build arg (~1300 tok)
- `Dockerfile.kernel.conda` — Conda-forge based kernel image using prebuilt OCCT 7.9.3 novtk via micromamba; faster cold build (~2-3 min vs 15-20 min from source) and smaller image (~0.5-0.7 GB vs ~1.2 GB) (~700 tok)
- `environment.yml` — Conda-forge environment spec: OCCT 7.9.3 novtk, protobuf-cpp, grpc-cpp, abseil-cpp, cmake, ninja, ccache, mold, lld (~100 tok)
- `environment.lock.yml` — conda-lock pinned build strings for reproducible builds (~300 tok)
- `assets/fonts/FONT-CREDITS.md` — Font license & attribution for browser-served fonts from public/fonts/; materializr fonts NOT bundled (~900 tok)

## src/

- `app.ts` — Result of the most recent snap resolution, kept so the drafting aids can be (~34944 tok)
- `main.ts` — canvas: updateStatusBar (~6873 tok)
- `vite-env.d.ts` — / <reference types="vite/client" /> (~11 tok)
- `webgpu-env.d.ts` — The real WebGPU type definitions (WEBCAD-165). (~112 tok)

## src/compat/

- (deleted) protobuf-v1-compat shims removed after protobuf v2 migration — all generated code now uses protoc-gen-es v2 output directly (~0 tok)

## src/core/engine/handlers/

- `PlotHandler.ts` — Exports PlotHandler (~2243 tok)

## src/core/io/

- `OCCWorkerClient.ts` — Requests sent to the worker that have not yet resolved. Used by the test bridge's idle signal. (~3762 tok)
- `OpenCascadeService.ts` — True once the worker has finished booting. Read-only probe — unlike `client`, never throws. (~4538 tok)
- `RemoteGrpcTransport.ts` — gRPC transport over Connect; v2 create(Schema, data) API with generated message Schemas (~600 tok)
- `KernelGrpcTransport.ts` — Stub transport routing OCC operations to native OCCT kernel via gRPC/UDS through KernelSupervisor; methods throw "not yet implemented" pending Chunk 6 wiring (~2560 tok)

## src/core/gateway/

- `auth.ts` — JWT authenticator with iss/aud claims for Authorization header validation (~230 tok)
- `command-registry.ts` — CommandRegistry: register/get/list/validate commands + CommandImplementation interface (~330 tok)
- `command-registry.test.ts` — 9 unit tests for CommandRegistry (~240 tok)
- `connect-server.ts` — Connect server handler for EngineGatewayService; uses createConnectRouter with v2 GenService from engine_pb.ts (~860 tok)
- `commands/box.ts` — BoxCommand: create_box pilot command server implementation (~600 tok)
- `commands/box.test.ts` — 5 unit tests for BoxCommand (~320 tok)
- `dedupe.ts` — Dedupe cache: request_id → status + result reference, TTL, size cap (~290 tok)
- `kernel-client.ts` — gRPC client for KernelService (gateway→kernel) (~290 tok)
- `kernel-supervisor.ts` — Node kernel process supervisor: spawn/pool/respawn/crash recovery, one kernel per session, spare pool, health check (~8300 tok)
- `kernel-worker.cpp` — C++ gRPC server skeleton: Kernel.Execute with OCCT 7.9.3, BRepPrimAPI_MakeBox, BRepMesh_IncrementalMesh, B-rep pre-validation, in-band ExecuteFailure codes, OpCreateSweep sweep operation (~7500 tok)
- `mock-kernel.ts` — Mock gRPC kernel server implementing KernelService for testing (~240 tok)
- `ordering.ts` — Per-session reorder buffer (client_seq), cancel queued semantics (~380 tok)
- `session-manager.ts` — Session lifecycle management with OpenSession/CloseSession (~380 tok)

## src/core/harness/

- `kernel-adapter.ts` — Core types (KernelAdapter, Script, KernelResult, ScriptTolerances, DEFAULT_TOLERANCES); foundation for all harness files (~400 tok)
- `wasm-kernel-adapter.ts` — Playwright-based WasmKernelAdapter; dispatches ops to OCC Worker via postMessage bridge (~600 tok)
- `native-kernel-adapter.ts` — gRPC client to KernelService.Execute using @grpc/grpc-js + @grpc/proto-loader; loads proto from proto/webcad/engine/v1/engine.proto; opMap includes create_sweep (~700 tok)
- `parity-harness.ts` — Orchestrator runs both adapters, compares per-step via comparator, writes JSON report via parity-report (~600 tok)
- `script-parser.ts` — ScriptParser validation; validates JSON script format (~300 tok)
- `metric-extractor.ts` — extractMetrics; extracts volume, surfaceArea, bbox, face/edge/vertex counts, valid from KernelResult (~300 tok)
- `comparator.ts` — Diffs WASM vs native results per step with tolerance-based diffing; 5 tests pass (~400 tok)
- `parity-report.ts` — Writes JSON report with summary counts; 1 test passes (~300 tok)

## src/core/model/

- `Document.test.ts` — Regression cover for the OCC worker cache going stale on undo. (~996 tok)
- `Document.ts` — Push a solid's previous B-rep back into the OCC worker. (~1895 tok)

## src/render/

- `RendererBackend.test.ts` — Backend selection (WEBCAD-162). (~978 tok)
- `RendererBackend.ts` — The renderer seam (WEBCAD-161). (~1530 tok)
- `Viewer.ts` — Typed as the seam, not the concrete class (WEBCAD-161). The concrete renderer is (~51282 tok)

## src/testing/

- `TestBridge.ts` — In-app test bridge (WEBCAD-156). (~11189 tok)

## src/generated/

- `proto/webcad/engine/v1/common_pb.ts` — Regenerated with protoc-gen-es v2; message Schema constants (CommandHeaderSchema, etc.) (~600 tok)
- `proto/webcad/engine/v1/engine_pb.ts` — Regenerated with protoc-gen-es v2; message Schemas + GenService for EngineGatewayService (~600 tok)

## src/ui/

- `FileToolWindow.ts` — Exports FileToolWindow (~3421 tok)

## tests/harness/

- `script-parser.test.ts` — ScriptParser validation; 5 tests pass (~200 tok)
- `metric-extractor.test.ts` — extractMetrics; 3 tests pass (~150 tok)
- `comparator.test.ts` — compareStepResults; 5 tests pass (~200 tok)
- `parity-report.test.ts` — writeParityReport; 1 test passes (~150 tok)
- `wasm-kernel-adapter.integration.test.ts` — Mocked Playwright tests; 2 tests pass (~200 tok)
- `native-kernel-adapter.integration.test.ts` — Mocked gRPC tests; 3 tests pass (~200 tok)
- `parity-harness.integration.test.ts` — Mocked adapter tests; 3 tests pass (~200 tok)
- `kernel-docker-phase1.integration.test.ts` — gRPC integration against Docker OCCT kernel; 6 tests pass (health, InitOp→failure, create_box→failure, step_export→failure, missing-entity→failure ×2) (~300 tok)

## tests/e2e/

- `bridge.ts` — Playwright-side driver for the in-app test bridge (WEBCAD-156). (~4014 tok)
- `camera.spec.ts` — Camera control through the test bridge (WEBCAD-148). (~1224 tok)
- `commands.spec.ts` — Command execution and its log output (WEBCAD-151). (~1158 tok)
- `grip_edit.spec.ts` — Selection, modify commands, grip editing and undo. (~1458 tok)
- `helpers.ts` — Shared helpers for the WebCAD e2e suite. (~2900 tok)
- `README.md` — Project documentation (~1927 tok)
- `kernel-roundtrip.spec.ts` — E2E test stub for kernel round-trip via Connect, crash recovery (skipped until native OCCT kernel binary built) (~600 tok)
- `renderer.spec.ts` — Which backend is actually drawing (WEBCAD-170). (~534 tok)
- `selection.spec.ts` — Selection through the test bridge (WEBCAD-150), plus the one case that has to go (~1308 tok)
- `snap.spec.ts` — Object snap and the drafting aids (WEBCAD-153). (~747 tok)
- `toolbars.spec.ts` — Right-hand chrome: the docked command toolbars, the tool-window rail (~2132 tok)
- `uat.spec.ts` — UAT — Undo/Redo restores solid B-rep to the geometry kernel (WEBCAD-20 / 138). (~1916 tok)
- `ui.spec.ts` — App shell + command-line behaviour. (~1672 tok)
- `visual.spec.ts` — Canvas visual regression (WEBCAD-154) — the fallback, not the primary check. (~603 tok)

## docs/superpowers/plans/

- `2026-11-23-wc-ec-22-loft-implementation.md` — WC-EC-22 loft implementation plan: OpCreateLoft + HandleCreateLoft + switch case in kernel-worker.cpp, BRepOffsetAPI_ThruSections loft with wires + vertex apex, opMap entry in native-kernel-adapter.ts, oracle fixtures loft_simple.json + loft_apex.json | ~15k
- `2026-11-21-wc-ec-23-tessellation-implementation-plan.md` — WC-EC-23 tessellation implementation plan: PopulateMeshData helper in kernel-worker.cpp, mesh call sites in all ~25 HandleCreate handlers, NativeKernelAdapter includeBrep option, C++ MeshDataFromBox unit test, TS mesh integration tests | ~24k
 
 # #   t e s t s / u n i t / k e r n e l /  
 -    r e p - e x p o r t . t e s t . t s      5   t e s t s   f o r   v a l i d a t e B R e p   e x p o r t   s c e n a r i o s   ( e m p t y ,   o v e r s i z e d ,   t r u n c a t e d ,   v a l i d   a t   t e r m i n a t o r ,   v a l i d   a t   6 4 M i B   l i m i t ) ;   a l l   p a s s   ( ~ 4 0 0   t o k )  
 -    r e p - i m p o r t . t e s t . t s      5   t e s t s   f o r   v a l i d a t e B R e p   i m p o r t   s c e n a r i o s ;   a l l   p a s s   ( ~ 4 0 0   t o k )  
 -   s t e p - e x p o r t . t e s t . t s      5   t e s t s   f o r   v a l i d a t e S t e p   e x p o r t   s c e n a r i o s   ( e m p t y ,   o v e r s i z e d ,   t r u n c a t e d   S T E P   e n d   m a r k e r ,   v a l i d   t e r m i n a t o r ,   v a l i d   a t   6 4 M i B   l i m i t ) ;   a l l   p a s s   ( ~ 4 0 0   t o k )  
 
- src/core/io/__tests__/codec.test.ts — TS codec round-trip test suite (16 tests: CommandHeader, OpenSession, MeshData, misaligned bytes, 256 KiB boundary, ExecuteFailure); vitest + @bufbuild/protobuf v2 | ~2KB

- src/core/io/__tests__/RemoteGrpcTransport.reconnect.integration.test.ts — Reconnect integration tests: gateway kill/restart, dedupe no-duplicate, rehydrate-needed, seq-gap handling (5 tests) | ~3KB

- 	ests/codec_test.cpp — C++ gtest codec round-trip suite (14 tests: CommandHeader, OpenSessionRequest/Response, MeshData, misaligned bytes, 256 KiB boundary, ExecuteFailure); mirrors TS codec.test.ts for WC-EC-09 chunks 3-4 | ~2KB

## Superpower Specs (docs/superpowers/specs/)
| File | Description | Tokens |
|------|-------------|--------|
| 2026-11-22-grpc-kernel-transport-parity-design.md | WEBCAD-218: gRPC kernel transport full parity design (KernelGrpcTransport + all 37 commands) | ~4.5KB |
| 2026-11-20-remote-grpc-transport-reconnect-design.md | WC-EC-28: RemoteGrpcTransport reconnect, heartbeat, connection state design | ~4KB |

## Implementation Plans (docs/superpowers/plans/)
| File | Description | Tokens |
|------|-------------|--------|
| 2026-11-22-grpc-kernel-transport-parity.md | WEBCAD-218: gRPC kernel transport full parity implementation plan (~70 tasks, 11 chunks) | ~11KB |
| 2026-11-22-remote-grpc-transport-reconnect.md | WC-EC-28: RemoteGrpcTransport reconnect implementation plan | ~26KB |

## Benchmark Design (docs/superpowers/specs/)
| File | Description | Tokens |
|------|-------------|--------|
| 2026-11-23-wc-ec-33-benchmark-native-wasm-thread-scaling-design.md | WC-EC-33: Benchmark native vs WASM, thread scaling design (BenchmarkAdapter, BenchmarkRunner, BenchmarkReport, fixtures, tests) | ~9KB |

## New (unlisted)
| File | Description | Tokens |
|------|-------------|--------|
| src/core/benchmark/benchmark-adapter.ts | Planned: wraps KernelAdapter, instruments per-step timing + memory | ~0KB (not yet created) |
| src/core/benchmark/benchmark-runner.ts | Planned: orchestrates benchmarks across kernels × thread counts | ~0KB (not yet created) |
| src/core/benchmark/benchmark-report.ts | Planned: report types + JSON writer | ~0KB (not yet created) |
| tests/fixtures/benchmarks/turbine-01.json | Planned: turbine-01.dxf import benchmark script | ~0KB (not yet created) |
| tests/fixtures/benchmarks/composite_box.json | Planned: script-defined composite benchmark | ~0KB (not yet created) |
| tests/fixtures/benchmarks/composite_cylinder.json | Planned: script-defined composite benchmark | ~0KB (not yet created) |
| tests/benchmark/benchmark-adapter.test.ts | Planned: unit tests with mock KernelAdapter | ~0KB (not yet created) |
| tests/benchmark/benchmark-runner.test.ts | Planned: unit tests for runner aggregation | ~0KB (not yet created) |
| tests/benchmark/benchmark-e2e.spec.ts | Planned: Playwright E2E against real WASM + native kernels | ~0KB (not yet created) |
tests/benchmark/benchmark-adapter.test.ts | Unit tests for BenchmarkAdapter (mock KernelAdapter, timing/memory recording, error handling) | ~300 |
tests/benchmark/benchmark-runner.test.ts | Unit tests for BenchmarkRunner (thread count propagation, continue-on-error, report writing) | ~250 |
