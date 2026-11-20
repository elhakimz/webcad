# Memory

> Chronological action log. Hooks and AI append to this file automatically.
> Old sessions are consolidated by the daemon weekly.

| 2026-11-19 | Patched gRPC/Connect transport design doc with 13 final items (PutBlob client streaming, result_id release semantics, WC-EC-33 ref, include_brep moved to requests, Restore repeated items, cancel-by-state, nginx-for-dev, document_id, OpenSession ALREADY_EXISTS, interim O13/O14, missing tests, resolution table rows) | docs/superpowers/specs/2026-10-21-grpc-connect-transport-design.md | Complete | ~4000 |

| 00:50 | Project health check (build/typecheck/tests) | src/** | build OK; 128 src tsc errors (112 app/16 test); 311/312 tests pass, 1 fail + jsdom missing | ~8k |
| 15:30 | Created docs/superpowers/specs/2026-10-21-grpc-connect-transport-design.md | new file | Design doc for gRPC/Connect transport replacement â€” all 12 design sections approved | ~4.6k |
| 15:31 | Updated .wolf/cerebrum.md | 2 entries | Added Decision Log entry for gRPC/Connect transport decision; Key Learnings about missing proto/buf/OCCTransport conventions | ~2k |

| 10:54 | Fixed native OCCT kernel build files: kernel-worker.cpp API/proto alignment, CMakeLists.txt protobuf/gRPC codegen, Dockerfile.kernel deps/copy/URL | src/core/gateway/kernel-worker.cpp, CMakeLists.txt, Dockerfile.kernel | Edits applied, verified by re-read | ~1k |
| 15:32 | Updated .wolf/anatomy.md | 1 entry | Added docs/superpowers/specs/ section with new design doc entry | ~0.5k |
| 01:03 | Edited src/ui/StatusBar.ts | 4â†’5 lines | ~26 |
| 01:03 | Edited src/core/engine/handlers/CenterlineHandler.ts | 2â†’2 lines | ~36 |
| 01:04 | Edited src/core/io/OpenCascadeService.ts | modified createRevolve() | ~122 |
| 01:04 | Edited src/core/io/OpenCascadeService.ts | modified toVec3() | ~98 |
| 01:05 | Edited src/core/commands/types.ts | 2â†’3 lines | ~17 |
| 01:05 | Edited src/core/engine/handlers/IOHandler.ts | modified if() | ~134 |
| 01:06 | Edited src/core/model/Solid3D.ts | inline fix | ~26 |
| 01:06 | Edited src/core/model/Solid3D.ts | inline fix | ~28 |
| 14:00 | Migrated protobuf v1â†’v2 across all call sites | src/core/io/RemoteGrpcTransport.ts, connect-server.ts, session-manager.ts | Deleted 4 compat shims + engine_connect.ts + all aliases; typecheck/lint/buf:lint pass; 1 pre-existing Document.test.ts failure unrelated | ~8k |
| 10:05 | Completed WC-EC-04 Headless Snapshot Renderer | src/render/HeadlessRenderer.ts, tests/snapshot/snapshot-host.html, scripts/snapshot.ts, tests/snapshot/determinism.test.ts | Determinism test 2/2 pass; CLI renders 4 PNGs; all tasks checked off in plan and epic docs | ~6k |
| 10:16 | Created docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md | new file | WC-EC-05 ADR design spec: native OCCT 7.9.3 kernel workers behind gRPC/UDS, WASM fallback kept, SolidCraft waiver recorded, 4 open questions | ~9k |
| 01:06 | Created src/types/three-webgpu.d.ts | â€” | ~122 |
| 01:07 | Created src/types/three-webgpu.d.ts | â€” | ~92 |
| 01:07 | Edited src/core/model/Entity.ts | 2â†’2 lines | ~29 |
| 01:09 | Edited src/core/sketcher/constraints/Horizontal.ts | inline fix | ~25 |
| 01:09 | Edited src/ui/NotificationManager.ts | inline fix | ~29 |
| 01:09 | Edited src/core/engine/ProfileUtility.ts | modified if() | ~199 |
| 01:10 | Edited src/core/model/MText.ts | modified constructor() | ~152 |
| 01:10 | Edited src/core/model/Donut.ts | modified constructor() | ~90 |
| 01:11 | Edited src/core/engine/MathUtils.ts | 2â†’2 lines | ~48 |
| 01:13 | Edited src/core/io/OpenCascadeService.ts | inline fix | ~23 |
| 01:13 | Edited src/core/io/OpenCascadeService.ts | inline fix | ~24 |
| 01:13 | Edited src/core/io/OpenCascadeService.ts | inline fix | ~28 |
| 01:13 | Edited src/core/io/OpenCascadeService.ts | inline fix | ~30 |
| 01:15 | Edited src/core/engine/Solid3DReevaluator.ts | modified if() | ~172 |
| 01:15 | Edited src/core/model/Solid3D.ts | 9â†’9 lines | ~65 |
| 01:15 | Edited src/core/engine/handlers/SvgImportHandler.ts | 3â†’3 lines | ~28 |
| 01:16 | Edited src/core/commands/types.ts | inline fix | ~51 |
| 01:16 | Edited src/core/commands/types.ts | inline fix | ~26 |
| 01:17 | Edited src/app.ts | modified if() | ~71 |
| 01:17 | Edited src/core/commands/LoftCommand.ts | added 1 condition(s) | ~80 |
| 01:18 | Edited src/core/engine/CommandManager.ts | inline fix | ~60 |
| 01:18 | Edited src/app.ts | modified if() | ~27 |
| 01:21 | Edited src/core/engine/CommandManager.ts | inline fix | ~25 |
| 01:30 | Cleared all 112 app-code tsc errors (now 0) | src/** (many) | build OK, 312/312 tests pass; added typecheck script + tsconfig include | ~40k |
| 02:00 | Fixed remaining 15 test-file tsc errors | *.test.ts (5 files) | `npm run typecheck` now exits 0; 312/312 tests pass | ~6k |
| 02:20 | Installed jsdom (transient net fail, not cert) | package.json | vitest exit 0; 320/320 tests, 62 files | ~3k |
| 01:56 | Created plans/kernel_abstraction.md | â€” | ~2747 |
| 02:45 | Wrote kernel-agnostic geometry service design | plans/kernel_abstraction.md | 3-layer split (Kernel/MeshFactory/Facade) to enable server-side kernel later | ~9k |
| 01:57 | Edited plans/kernel_abstraction.md | expanded (+10 lines) | ~282 |
| 02:02 | Created plans/rendering_roadmap.md | â€” | ~1929 |
| 03:00 | Wrote rendering roadmap (AA/IBL/GTAO vs WebGPU) | plans/rendering_roadmap.md | 6-phase plan sequencing visual wins against three upgrade + WebGPU | ~7k |

## Session: 2026-06-21 02:15

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-21 02:21

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| â€”    | Pushed main to origin | git | origin/main ba79b83â†’ab95848 (5 commits); excluded docs untouched | ~1k |
| â€”    | Diagnosed OpenWolf token counter "not running" | .wolf/hooks/*, token-ledger.json | Hooks healthy + daemon alive (PID/port 18791); root cause: Claude Code session not invoking PreToolUse/PostToolUse/Stop hooks â†’ _session.json stayed empty. Fix = restart session | ~3k |

## Session: 2026-06-21 02:27

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-22 09:53

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-24 13:46

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-24 23:40

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-25 14:36

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-25 20:13

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-25 04:13

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-25 04:13

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 04:20 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/backlog_data.json | â€” | ~4864 |
| 04:20 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/populate_plane.py | â€” | ~692 |
| 04:20 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/populate_plane.py | 1â†’3 lines | ~29 |
| 04:20 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/populate_plane.py | inline fix | ~23 |
| 04:21 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/populate_plane.py | 2â†’4 lines | ~64 |
| 04:23 | Session end: 5 writes across 2 files (backlog_data.json, populate_plane.py) | 2 reads | ~5672 tok |
| 04:28 | Session end: 5 writes across 2 files (backlog_data.json, populate_plane.py) | 2 reads | ~5672 tok |
| 04:38 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/audit_actions.json | â€” | ~2081 |
| 04:38 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/apply_audit.py | â€” | ~1068 |

## Session: 2026-07-25 05:12

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-25 05:40

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-25 06:09

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 06:10 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/fix_encoding.py | â€” | ~644 |
| 06:11 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/fix_encoding.py | 1â†’2 lines | ~34 |
| 06:11 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/fix_encoding.py | modified enumerate() | ~91 |
| 06:13 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/fix_encoding.py | inline fix | ~25 |
| 06:13 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/fix_encoding.py | 2â†’3 lines | ~34 |
| 06:13 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/fix_encoding.py | modified range() | ~106 |
| 06:14 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/apply_audit2.py | â€” | ~1036 |
| 06:16 | Session end: 7 writes across 2 files (fix_encoding.py, apply_audit2.py) | 0 reads | ~1970 tok |
| 06:19 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/create_modules.py | â€” | ~956 |
| 06:20 | Session end: 8 writes across 3 files (fix_encoding.py, apply_audit2.py, create_modules.py) | 0 reads | ~2926 tok |
| 06:24 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/create_cycles.py | â€” | ~1160 |
| 06:24 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/create_cycles.py | 6â†’7 lines | ~69 |
| 06:25 | Edited ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/create_cycles.py | 2â†’2 lines | ~13 |
| 06:25 | Session end: 11 writes across 4 files (fix_encoding.py, apply_audit2.py, create_modules.py, create_cycles.py) | 0 reads | ~4168 tok |
| 06:29 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/desc_a.json | â€” | ~6880 |

## Session: 2026-07-26 07:24

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-26 08:00

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-26 14:25

| 13:28 | Reviewed and fixed dependency triage spec ticket mappings (Section 9) | docs/superpowers/specs/2026-11-20-kernel-dependency-triage-spec.md, .wolf/buglog.json | Fixed WC-EC ticket mappings: WC-EC-16→WC-EC-18 (booleans), WC-EC-18→WC-EC-19 (fillet/chamfer), WC-EC-20→WC-EC-23 (tessellation). Logged bug-002. | ~500 |
| 13:34 | Resolved open questions from user decisions (Section 8) | docs/superpowers/specs/2026-11-20-kernel-dependency-triage-spec.md, .wolf/buglog.json | Q1: image size reducible via multi-stage Docker cleanup; Q2: yes FONT-CREDITS.md; Q3: no bundle fonts; Q4: lesser time for Document.test.ts; Q5: default >100 MB; Q6: yes STEP-first export; Q7: hosted delivery. Logged bug-003. | ~400 |

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 14:27 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/desc_b.json | â€” | ~8690 |
| 14:28 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/apply_descriptions.py | â€” | ~731 |

## Session: 2026-07-26 â€” Plane backlog build-out

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| â€” | Connected to Plane API, read project `webcad` | plane-secret-key.csv | 13 epic placeholders found, all in Backlog | ~3k |
| â€” | Populated 124 backlog items from webcad_backlog.html | scratchpad/populate_plane.py | Created as sub-issues under 11 epics, priority + label per item | ~12k |
| â€” | Audited 31 falsifiable bug claims vs current source | subagent, 91 tool calls | 6 still valid / 11 already fixed / 11 invalid / 3 undercounted | ~109k |
| â€” | Fixed own cp1252 double-encoding bug in all 124 titles | scratchpad/fix_encoding.py | All titles re-PATCHed as correct UTF-8 | ~8k |
| â€” | Applied audit verdicts | scratchpad/apply_audit2.py | 11â†’Done, 11â†’Cancelled, 3 renamed, 6 confirmed, 4 new issues (#138-141) | ~6k |
| â€” | Created 11 Modules mirroring epics | scratchpad/create_modules.py | 118 items attached | ~3k |
| â€” | Created 4 priority-based Cycles | scratchpad/create_cycles.py | 2/38/47/19 items, Jul 27â€“Oct 11 2026 | ~3k |
| â€” | Wrote descriptions for all 128 child issues | scratchpad/desc_a.json, desc_b.json | Audit evidence + scope/depends-on/done-when per item | ~25k |

**Key finding:** the app has **no undo/redo system at all** (no `'UNDO'` handler in `src/`, only an unwired call site at main.ts:529) â€” filed as #138, the most significant functional gap surfaced. Also: `app.ts` is 2800 lines (logged as 900+), `Viewer.ts` is 4368 (logged as 2400+), 26 stray `console.log` in app.ts (logged as 9), and the GCS solver has **zero failing tests** (320/320 pass) â€” its real gaps are design-level (#139-141).
| 14:32 | Session end: 2 writes across 2 files (desc_b.json, apply_descriptions.py) | 0 reads | ~9421 tok |
| 14:44 | Created .claude/launch.json | â€” | ~52 |
| 14:46 | Created tests/e2e/_probe.spec.ts | â€” | ~1052 |
| 14:48 | Created tests/e2e/_probe.spec.ts | â€” | ~1094 |
| 14:51 | Created tests/e2e/helpers.ts | â€” | ~1721 |
| 14:52 | Created tests/e2e/ui.spec.ts | â€” | ~1604 |
| 14:53 | Created tests/e2e/_probe.spec.ts | â€” | ~1228 |
| 14:54 | Created tests/e2e/toolbars.spec.ts | â€” | ~1957 |
| 14:54 | Created tests/e2e/grip_edit.spec.ts | â€” | ~1228 |
| 15:00 | Created playwright.config.ts | â€” | ~303 |

## Session: 2026-07-26 15:10

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-26 15:10

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 15:14 | Edited tests/e2e/helpers.ts | modified cancel() | ~178 |
| 15:15 | Edited tests/e2e/helpers.ts | added 2 condition(s) | ~382 |
| 15:15 | Edited tests/e2e/ui.spec.ts | click() â†’ focusViewport() | ~44 |
| 15:15 | Edited tests/e2e/ui.spec.ts | expanded (+6 lines) | ~156 |
| 15:15 | Edited tests/e2e/toolbars.spec.ts | modified for() | ~142 |
| 15:15 | Edited tests/e2e/grip_edit.spec.ts | expanded (+9 lines) | ~392 |
| 15:23 | Edited tests/e2e/helpers.ts | modified boot() | ~219 |
| 15:23 | Edited tests/e2e/ui.spec.ts | 3â†’3 lines | ~47 |
| 15:35 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/fix_undo_finding.py | â€” | ~2541 |
| 15:38 | Edited tests/e2e/helpers.ts | added optional chaining | ~228 |
| 15:38 | Edited playwright.config.ts | 7â†’8 lines | ~118 |
| 15:41 | Edited tests/e2e/grip_edit.spec.ts | expanded (+6 lines) | ~182 |

## Session: 2026-07-26 â€” E2E Playwright suite

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| â€” | Ran existing e2e suite | tests/e2e/*.spec.ts | 19/19 FAILED â€” all timed out in beforeEach on removed `#main-menu-input` | ~4k |
| â€” | Explored live app DOM | browser | Runtime DOM â‰  index.html; status bar replaced by `#ribbon-*`; tabs, docking pane, tool windows mapped | ~12k |
| â€” | Probed real behaviour (3 throwaway specs) | scratchpad | Captured exact log strings, worldâ†”screen mapping, grip/undo/erase flows | ~10k |
| â€” | Wrote page object + 3 specs | tests/e2e/helpers.ts, ui/toolbars/grip_edit.spec.ts | 41 tests covering shell, commands, drawing, toolbars, tool windows, SCAD tab, editing, grips, undo | ~20k |
| â€” | Fixed worker saturation | playwright.config.ts | workers 16â†’2 (1 CI), timeout 90s, domcontentloaded boot; 35 failures â†’ 0 | ~5k |
| â€” | **Final: 41/41 e2e pass (1.4m), 320/320 vitest pass** | â€” | Green | ~2k |
| â€” | Corrected false undo finding in Plane | Plane #138, #20 | #138 retitled to the real defect, #20 reopened + added to Sprint 1 | ~4k |
| â€” | Annotated 7 verify-first backlog items | Plane #51/55/61/62/65/74/104 | Each proven already built, with evidence | ~3k |

**Correction:** the earlier audit claim "no undo/redo system exists" was **wrong** â€” undo works (`CommandManager.ts:231`, `SystemHandler.ts:47-54`, `Document.ts:160`). The real defect is narrower: `Document.undo()`/`redo()` pass `undefined` for `onSolidBRepRestore` (`Document.ts:168`/`:183`), so `HistoryManager`'s B-rep restore (`:139-140`/`:210-211`) never runs and the OCC worker cache goes stale after undoing a fillet/shell/chamfer. That is exactly what original issue #20 said.

**Also found already built** (contradicting backlog): grip editing, CodeMirror SCAD editor + Run Script, ViewCube faces, shading modes, Properties/Block Library tool windows, OTRACK.
| 15:45 | Session end: 12 writes across 6 files (helpers.ts, ui.spec.ts, toolbars.spec.ts, grip_edit.spec.ts, fix_undo_finding.py) | 1 reads | ~4629 tok |
| 15:59 | Edited tests/e2e/helpers.ts | modified cancel() | ~168 |
| 15:59 | Created tests/e2e/_probe.spec.ts | â€” | ~878 |
| 16:00 | Edited tests/e2e/helpers.ts | 10â†’10 lines | ~145 |
| 16:01 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/create_bugs.py | â€” | ~3159 |
| 16:02 | Edited tests/e2e/toolbars.spec.ts | modified for() | ~265 |
| 16:03 | Edited tests/e2e/helpers.ts | modified shaderButton() | ~93 |

## Session: 2026-07-26 (cont.) â€” BUGS column in Plane

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| â€” | Verified 5 candidate defects before filing | probe spec | 4 confirmed, 1 rejected (shader popup opens on click â€” not a bug) | ~5k |
| â€” | Created BUGS state in Plane | Plane | seq 20000, group=unstarted â†’ column sits between Backlog and Todo | ~1k |
| â€” | Filed 5 new confirmed bugs (#142-#146) | Plane | Escape-in-cmd, canvas resize race, double-printed results, no-op grip commit, MainMenuScreen dead code | ~5k |
| â€” | Moved 9 previously-confirmed defects into BUGS | Plane #20/21/22/23/33/34/130/137/138 | BUGS column = 14 items | ~2k |
| â€” | Added shader-popup e2e coverage | toolbars.spec.ts | **42/42 e2e pass** | ~2k |

**Plane API gotcha:** `POST /states/` ignores the `sequence` field and appends the state last (got 70000). Must follow with `PATCH /states/{id}/ {"sequence": N}` to position the Kanban column.

**Verification discipline paid off twice this session:** the "no undo system" claim was false, and the "shading modes unreachable" candidate was also false (popup opens on clicking `.daz-shader-btn`). Conversely, reading `main.ts:542-557` suggested Escape-in-`#cmd` *should* work â€” empirically it does not. Reading code is not sufficient evidence in either direction; exercise the app.
| 16:05 | Session end: 18 writes across 8 files (helpers.ts, ui.spec.ts, toolbars.spec.ts, grip_edit.spec.ts, fix_undo_finding.py) | 2 reads | ~9337 tok |
| 16:10 | Edited src/core/model/Document.ts | added error handling | ~404 |
| 16:10 | Edited src/core/model/Document.ts | modified canUndo() | ~68 |
| 16:11 | Edited src/core/model/Document.test.ts | added 2 import(s) | ~74 |
| 16:11 | Edited src/core/model/Document.test.ts | expanded (+83 lines) | ~855 |
| 16:12 | Edited src/core/model/Document.test.ts | 56â†’55 lines | ~465 |
| 16:15 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/close_20.py | â€” | ~1147 |

## Session: 2026-07-26 (cont.) â€” Executed Todo #20

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| â€” | Checked Plane Todo column | Plane | Exactly 1 item: #20 (OCC worker cache stale after undo) â†’ moved to In Progress | ~2k |
| â€” | Implemented fix | src/core/model/Document.ts | Added `restoreSolidBRep` field; passed it as `onSolidBRepRestore` from both `undo()` and `redo()` | ~4k |
| â€” | Added regression tests | src/core/model/Document.test.ts | 3 tests: undo restores pre-op snapshot, redo restores, kernel failure logs not throws | ~4k |
| â€” | **Proved tests catch the bug** | â€” | Reverted callback to `undefined` â†’ 3 fail; restored â†’ 5 pass | ~1k |
| â€” | Full verification | â€” | **tsc clean, 323 vitest (was 320), 42 e2e** | ~2k |
| â€” | Closed #20 and #138 in Plane | Plane | Both Done (converged on the same defect) | ~2k |

**Fix detail:** `HistoryManager` always supported `onSolidBRepRestore` (`:87`, invoked `:139-140` undo / `:210-211` redo) but `Document.undo()`/`redo()` passed `undefined`, making it dead code. Callback now calls `OpenCascadeService.importBRep(id, brep, 0.1/facetres)` â€” same call the existing `rehydrate()` uses â€” fire-and-forget with `.catch()` since the history callback is sync.

**Deliberately did NOT re-tessellate:** the restored entity is a clone of the pre-op solid and already carries its old `positions`/`indices`, so visuals were never wrong â€” only the kernel cache was. Keeps the change minimal and avoids a redundant re-mesh per undo.

**Not committed** â€” user hasn't asked.
| 16:16 | Session end: 24 writes across 11 files (helpers.ts, ui.spec.ts, toolbars.spec.ts, grip_edit.spec.ts, fix_undo_finding.py) | 7 reads | ~14245 tok |
| 16:19 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/uat_page.py | â€” | ~3374 |

## Session: 2026-07-26 (cont.) â€” UAT page

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| â€” | Probed Plane Pages API | â€” | `/pages/` exists in API v1 (was empty); POST with name + description_html works | ~1k |
| â€” | Wrote UAT for the B-rep restore fix | Plane page `ba956457` | 7 cases + exit criteria + sign-off; linked from #20 and #138 | ~6k |

**Key point captured in the UAT:** the unit tests for this fix **mock the kernel**, so they verify wiring only â€” no real OpenCascade fillet/shell/chamfer is ever executed. UAT-01..04 are the only checks that the live worker ends up with the correct shape after undo. Stated explicitly in the page and in the issue comments so nobody reads the green suite as full acceptance.

**Plane Pages API:** `POST /pages/` accepts `{name, description_html, access}` (access 0 = public). Round-trip confirmed by GET.
| 16:20 | Session end: 25 writes across 12 files (helpers.ts, ui.spec.ts, toolbars.spec.ts, grip_edit.spec.ts, fix_undo_finding.py) | 7 reads | ~17619 tok |
| 16:22 | Created tests/e2e/_probe.spec.ts | â€” | ~761 |
| 16:28 | Edited playwright.config.ts | modified Number() | ~112 |
| 16:29 | Created tests/e2e/uat.spec.ts | â€” | ~2501 |
| 16:35 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/uat_results.py | â€” | ~2650 |

## Session: 2026-07-26 18:35

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-26 19:15

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-26 01:11

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-26 01:18

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 01:24 | Edited src/core/io/OCCWorkerClient.ts | modified pendingCount() | ~93 |
| 01:24 | Edited src/core/io/OpenCascadeService.ts | modified client() | ~142 |
| 01:24 | Edited src/render/Viewer.ts | modified isRenderPending() | ~65 |
| 01:24 | Edited src/app.ts | modified reportSelectionDimensions() | ~31 |
| 01:24 | Edited src/app.ts | expanded (+6 lines) | ~118 |
| 01:25 | Created src/vite-env.d.ts | â€” | ~11 |
| 01:27 | Created src/testing/TestBridge.ts | â€” | ~8429 |
| 01:27 | Edited src/testing/TestBridge.ts | inline fix | ~24 |
| 01:28 | Edited src/testing/TestBridge.ts | modified getSelection() | ~14 |
| 01:28 | Edited src/testing/TestBridge.ts | 3â†’2 lines | ~7 |
| 01:28 | Edited src/main.ts | 11â†’15 lines | ~120 |
| 01:28 | Edited src/main.ts | added 1 import(s) | ~33 |
| 01:31 | Created tests/e2e/bridge.ts | â€” | ~3159 |
| 01:32 | Edited src/testing/TestBridge.ts | modified isIdle() | ~81 |
| 01:32 | Edited src/testing/TestBridge.ts | added 2 condition(s) | ~337 |
| 01:32 | Edited src/testing/TestBridge.ts | 2â†’3 lines | ~17 |
| 01:32 | Edited src/testing/TestBridge.ts | requestAnimationFrame() â†’ setInterval() | ~143 |
| 01:34 | Edited src/testing/TestBridge.ts | added 3 condition(s) | ~456 |
| 01:34 | Edited src/testing/TestBridge.ts | expanded (+7 lines) | ~112 |
| 01:36 | Edited src/testing/TestBridge.ts | modified pressEnter() | ~168 |
| 01:36 | Edited tests/e2e/bridge.ts | 1â†’2 lines | ~41 |
| 01:37 | Edited tests/e2e/bridge.ts | modified moveCursorToWorld() | ~172 |
| 01:38 | Created tests/e2e/camera.spec.ts | â€” | ~1075 |
| 01:38 | Created tests/e2e/selection.spec.ts | â€” | ~1244 |
| 01:39 | Created tests/e2e/commands.spec.ts | â€” | ~1094 |
| 01:39 | Created tests/e2e/snap.spec.ts | â€” | ~724 |
| 01:40 | Edited src/testing/TestBridge.ts | modified if() | ~247 |
| 01:40 | Edited tests/e2e/camera.spec.ts | modified for() | ~279 |
| 01:41 | Edited tests/e2e/snap.spec.ts | 1â†’2 lines | ~41 |
| 01:42 | Edited tests/e2e/selection.spec.ts | 2â†’4 lines | ~49 |
| 01:45 | Edited src/testing/TestBridge.ts | modified isClickable() | ~203 |
| 01:45 | Edited tests/e2e/bridge.ts | modified pixel() | ~212 |
| 01:45 | Edited tests/e2e/bridge.ts | 1â†’2 lines | ~55 |
| 01:45 | Edited tests/e2e/selection.spec.ts | 12â†’13 lines | ~202 |
| 01:47 | Created tests/e2e/visual.spec.ts | â€” | ~603 |
| 01:49 | Created tests/e2e/README.md | â€” | ~1455 |
| 01:50 | Created tests/e2e/uat.spec.ts | â€” | ~1721 |
| 01:51 | Edited tests/e2e/uat.spec.ts | 5â†’9 lines | ~129 |
| 01:55 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/bridge_done.py | â€” | ~4721 |
| 01:58 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/dedupe_comments.py | â€” | ~433 |
| 01:59 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/uat_log_page_0727.py | â€” | ~1481 |
| 02:00 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/wolf_update.py | â€” | ~1611 |

## Session 2026-07-27 â€” WEBCAD-156 Test Automation Bridge

Processed the Plane Todo item "Automation -- WebCAD Test Automation Bridge" (#156) and its nine epics (#147-#155). All closed Done.

Built:
- `src/testing/TestBridge.ts` â€” `window.__webcadTest`, dev-only or `?testBridge=1`. Readiness/idle, camera, coordinates, scene graph, selection, commands, drafting aids.
- `tests/e2e/bridge.ts` â€” typed `CadBridge` driver + `RealInput` for genuine mouse gestures.
- `tests/e2e/{camera,selection,commands,snap,visual}.spec.ts`; `uat.spec.ts` rewritten onto the bridge.
- `tests/e2e/README.md` â€” usage, what is unsupported and why, the known undo defect.
- `data-testid` pass on toolbars, tabs, tool-window rail, view control, settings, command line, canvas.

Small app-side hooks: `OCCWorkerClient.pendingCount`, `OpenCascadeService.isInitialized`/`pendingCount`, `Viewer.isRenderPending`, `App.lastSnap`, `getSelectableEntities`/`getSolid3DSelectables` made public.

Also fixed a long-standing flake it exposed: `helpers.ts` computed click pixels arithmetically
(`screenX = width/2 + worldX`), which drifts as the canvas resizes after boot â€” three old specs
failed intermittently with ~10.8-unit offsets. It now projects through the live camera via the
bridge, with the arithmetic kept only as a fallback. Deleted the temporary `_probe.spec.ts`.

Suite: 68 passed, 0 failed, 3 skipped (166s at 2 workers). Vitest 323/323. Typecheck clean.
Bridge verified against a real production build (`npm run build` + `vite preview`): absent
without `?testBridge=1`, fully working with it.

Found and filed: Plane #157 (urgent) â€” UNDO reports success but reverts nothing, because every dispatched action pushes an empty history transaction. UAT verdict REJECTED; logged on a new Plane page (API cannot edit existing pages).

| 02:04 | Edited src/testing/TestBridge.ts | added 18 import(s) | ~252 |
| 02:05 | Edited src/testing/TestBridge.ts | added 1 condition(s) | ~288 |
| 02:07 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/wolf_update2.py | â€” | ~431 |
| 02:09 | Session end: 45 writes across 20 files (OCCWorkerClient.ts, OpenCascadeService.ts, Viewer.ts, app.ts, vite-env.d.ts) | 10 reads | ~124907 tok |
| 02:11 | Edited tests/e2e/helpers.ts | added 1 condition(s) | ~390 |
| 02:13 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/wolf_update3.py | â€” | ~506 |
| 02:18 | Session end: 47 writes across 22 files (OCCWorkerClient.ts, OpenCascadeService.ts, Viewer.ts, app.ts, vite-env.d.ts) | 12 reads | ~128343 tok |
| 02:31 | Session end: 47 writes across 22 files (OCCWorkerClient.ts, OpenCascadeService.ts, Viewer.ts, app.ts, vite-env.d.ts) | 12 reads | ~128343 tok |

## Session: 2026-07-26 04:09

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-26 05:08

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 06:14 | Edited src/testing/TestBridge.ts | expanded (+28 lines) | ~350 |
| 06:14 | Edited src/testing/TestBridge.ts | added error handling | ~656 |
| 06:14 | Edited tests/e2e/bridge.ts | modified expectValid() | ~323 |
| 06:14 | Edited tests/e2e/bridge.ts | 5â†’6 lines | ~30 |
| 06:15 | Edited tests/e2e/commands.spec.ts | 3â†’7 lines | ~100 |
| 06:15 | Edited tests/e2e/uat.spec.ts | expanded (+6 lines) | ~170 |
| 06:15 | Edited tests/e2e/uat.spec.ts | 3â†’4 lines | ~48 |
| 06:17 | Edited tests/e2e/README.md | 1â†’2 lines | ~45 |
| 06:17 | Edited tests/e2e/README.md | expanded (+23 lines) | ~339 |

## Session 2026-07-27 (cont.) â€” kernel validity in the bridge

Wired `OpenCascadeService.checkValidity` into the test bridge as `checkValidity(id)` /
`syncToKernel(id)`, plus `cad.expectValid(id)` on the driver.

Key design call: `checkValidity` does NOT push the entity's brepSnapshot into the worker
first. Re-importing would guarantee a hit and hide the very drift the check exists to
find. Instead the worker's "Shape not found" throw is reported as `inKernel: false`, and
the kernel's face count is compared against the model's (`faceCountMatches`).

Verified live, both branches: box 6/6 valid, filleted 7/7 valid; after `clearCache()`
`inKernel:false` with the model still at 7 faces; after `syncToKernel()` back to 7/7 valid.

Assertions added to commands.spec.ts (box is sound) and uat.spec.ts (setup + UAT-06).
Also removed the stale `_probe.spec.ts` entry the hook had re-added to anatomy.md.
| 06:20 | Session end: 9 writes across 5 files (TestBridge.ts, bridge.ts, commands.spec.ts, uat.spec.ts, README.md) | 2 reads | ~2088 tok |

## Session â€” gRPC/Connect transport design doc revised

Revised `docs/superpowers/specs/2026-10-21-grpc-connect-transport-design.md` in place per design review. Key changes: in-band `ExecuteFailure` enum in `ExecuteResponse` (kernel-side errors separated from gRPC transport status codes); `Restore` added to `EngineGateway` for rehydrate; ordering rules (Execute/Restore sequenced, others unsequenced, client_seq starts at 1, 5s reorder buffer, bounded dedupe cache, x-session-id sticky routing); HTTP/2 TLS browserâ†’nginx, HTTP/1.1 nginxâ†’gateway (nginx not on gatewayâ†’kernel link); payload limits table with BlobRef generalisation (upload storage open question); removed hardcoded C++ (PR split into 2a mock kernel TS, 2b real kernel per WC-EC-05 ADR); rewritten Problem section (Web Worker postMessage, no ws dependency exists); rewritten Cleanup section (no ws to remove, ad-hoc envelope stays); typed arrays misalignment guidance + odd-offset test; JWT expiry during Subscribe â†’ UNAUTHENTICATED + fresh token reopen; validation/quotas section (WC-EC-32, protovalidate); OpenSessionResponse fields; BrepReference include_brep flag; kill-and-respawn assumes one kernel per session; additional tests (Playwright h2, backpressure, token expiry, StreamMesh integrity, version skew, trace-context, metrics); updated rejected alternatives (WebTransport Baseline March 2026 but uneven/Node no server support/UDP-blocked fails; gRPC-Web Envoy extra hop only; WebSocket+CORS needed cross-origin); trade-offs/revisit triggers paragraph; Status set to "Draft - pending human review", date 2026-11-19; added Open questions (14 items) and Review resolution table.
| ~ | Revised gRPC/Connect transport design doc in place | docs/superpowers/specs/2026-10-21-grpc-connect-transport-design.md | ~45 |
| 2026-11-19 | Created gRPC/Connect transport implementation plan (3 PRs, ~140 tasks) | docs/superpowers/plans/2026-11-19-grpc-connect-transport.md | Complete | ~13k |
| ~ | Final doc patches: renamed StreamMeshâ†’StreamResult, fixed HTTP/2 dev (nginx in front), added UDS permissions/mTLS rotation to Section H, clarified gRPC internal-only, set O5 dedupe cap to 10k entries | docs/superpowers/specs/2026-10-21-grpc-connect-transport-design.md | ~15 |
| 06:20 | Session end: 9 writes across 5 files (TestBridge.ts, bridge.ts, commands.spec.ts, uat.spec.ts, README.md) | 2 reads | ~2088 tok |
| 06:20 | Session end: 9 writes across 5 files (TestBridge.ts, bridge.ts, commands.spec.ts, uat.spec.ts, README.md) | 2 reads | ~2088 tok |

## Session: 2026-07-26 06:24

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 06:26 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/plane_api.py | â€” | ~477 |
| 06:26 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/probe_render.py | â€” | ~202 |
| 06:29 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/create_webgpu_backlog.py | â€” | ~8794 |
| 06:30 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/verify_webgpu.py | â€” | ~184 |
| 06:31 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/link_webgpu_deps.py | â€” | ~217 |
| 06:31 | created Plane epic #158 WebGL->WebGPU migration + 15 phased children (A1-E2), module, cross-linked #50/#52/#56 | plans/rendering_roadmap.md (read) | 16 issues created, verified via API | ~9k |
| 06:32 | Session end: 5 writes across 5 files (plane_api.py, probe_render.py, create_webgpu_backlog.py, verify_webgpu.py, link_webgpu_deps.py) | 3 reads | ~11682 tok |
| 06:38 | Created src/render/RendererBackend.ts | â€” | ~1370 |
| 06:38 | Edited src/render/Viewer.ts | added 1 import(s) | ~48 |
| 06:39 | Edited src/render/Viewer.ts | 2â†’6 lines | ~56 |
| 06:39 | Edited src/render/Viewer.ts | modified constructor() | ~146 |
| 06:39 | Edited src/render/Viewer.ts | added nullish coalescing | ~140 |
| 06:39 | Edited src/render/Viewer.ts | modified requestRender() | ~565 |

## Session: Parity Harness (WC-EC-12) chunks 4-7 complete

Implemented full parity harness: kernel-adapter.ts (added optional init/cleanup), wasm-kernel-adapter.ts (Playwright-based), native-kernel-adapter.ts (gRPC via @grpc/grpc-js), parity-harness.ts (orchestrator), parity-report.ts, script-parser.ts, metric-extractor.ts, comparator.ts. All 22 harness tests pass (7 test files). Typecheck passes for new files (only pre-existing errors in src/compat/protobuf-v1-compat.ts remain). ESLint clean on new files. buf not installed (not related to changes - no proto modifications).
| ~ | Created src/core/harness/native-kernel-adapter.ts | src/core/harness/native-kernel-adapter.ts | Complete | ~2k |
| ~ | Created src/core/harness/parity-harness.ts | src/core/harness/parity-harness.ts | Complete | ~2k |
| ~ | Created tests/harness/native-kernel-adapter.integration.test.ts | tests/harness/native-kernel-adapter.integration.test.ts | Complete | ~1k |
| ~ | Created tests/harness/parity-harness.integration.test.ts | tests/harness/parity-harness.integration.test.ts | Complete | ~1k |
| ~ | Created tests/e2e/harness/parity-harness.e2e.spec.ts | tests/e2e/harness/parity-harness.e2e.spec.ts | Complete | ~1k |
| ~ | Modified src/core/harness/kernel-adapter.ts | src/core/harness/kernel-adapter.ts | Complete | ~200 |
| ~ | Created docs/superpowers/plans/2026-11-19-parity-harness.md | docs/superpowers/plans/2026-11-19-parity-harness.md | Complete | ~8k |
| ~ | Created docs/superpowers/specs/2026-11-19-parity-harness-design.md | docs/superpowers/specs/2026-11-19-parity-harness-design.md | Complete | ~6k |
| ~ | Session end: verify ran - typecheck âœ“ (new files), lint âœ“ (new files), test âœ“ (22 harness tests), buf N/A | â€” | Complete | ~500 |
| 06:39 | Edited src/app.ts | inline fix | ~16 |
| 06:39 | Edited src/ui/FileToolWindow.ts | inline fix | ~17 |
| 06:40 | Edited src/core/engine/handlers/PlotHandler.ts | 2â†’4 lines | ~79 |
| 06:40 | Edited src/render/Viewer.ts | inline fix | ~26 |
| 06:40 | Edited src/render/Viewer.ts | 2â†’7 lines | ~82 |
| 06:40 | Edited src/render/Viewer.ts | modified constructor() | ~230 |
| 06:40 | Edited src/render/Viewer.ts | added optional chaining | ~20 |
| 06:40 | Edited src/testing/TestBridge.ts | modified getCanvasRect() | ~233 |
| 06:41 | Edited tests/e2e/bridge.ts | modified expectRenderer() | ~268 |
| 06:41 | Edited src/testing/TestBridge.ts | modified getRendererInfo() | ~24 |
| 06:41 | Edited src/testing/TestBridge.ts | expanded (+9 lines) | ~95 |
| 06:41 | Edited tests/e2e/bridge.ts | 2â†’3 lines | ~13 |
| 06:42 | Created src/render/RendererBackend.test.ts | â€” | ~978 |
| 06:42 | Edited src/render/RendererBackend.ts | modified chooseRenderer() | ~678 |
| 06:43 | Edited src/render/Viewer.ts | added 1 condition(s) | ~309 |
| 06:43 | Edited src/render/Viewer.ts | added optional chaining | ~246 |
| 06:43 | Edited src/render/Viewer.ts | inline fix | ~33 |
| 06:43 | Edited src/main.ts | expanded (+12 lines) | ~175 |
| 06:43 | Edited src/main.ts | added 1 import(s) | ~33 |
| 06:44 | Created tests/e2e/renderer.spec.ts | â€” | ~537 |
| 06:44 | Edited tests/e2e/renderer.spec.ts | "?renderer=webgpu" â†’ "/?renderer=webgpu" | ~19 |
| 06:51 | Edited tests/e2e/helpers.ts | 3â†’8 lines | ~154 |
| 06:57 | Edited src/app.ts | 6â†’2 lines | ~12 |
| 06:58 | Created src/webgpu-env.d.ts | â€” | ~112 |
| 07:06 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/close_webgpu_phase_ab.py | â€” | ~2451 |
| 07:06 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/create_outline_issue.py | â€” | ~889 |
| 07:08 | phases A+B of Plane #158: renderer seam, scheduleRender coalescing, capture fix, three r160->r185, POC/shim removal, backend exposed to bridge | src/render/RendererBackend.ts, Viewer.ts, main.ts, app.ts | committed cf6b6a3, pushed feat/webgpu-migration-phase-a-b; 332 unit + 69 e2e green | ~45k |
| 07:09 | Session end: 37 writes across 19 files (plane_api.py, probe_render.py, create_webgpu_backlog.py, verify_webgpu.py, link_webgpu_deps.py) | 14 reads | ~132543 tok |
| 07:14 | Edited README.md | expanded (+6 lines) | ~251 |
| 07:14 | Edited README.md | expanded (+15 lines) | ~423 |
| 07:14 | Edited README.md | 1â†’3 lines | ~185 |
| 07:15 | Edited tests/e2e/README.md | 1â†’2 lines | ~31 |
| 07:15 | Edited tests/e2e/README.md | expanded (+19 lines) | ~215 |
| 07:15 | Edited tests/e2e/README.md | 1â†’2 lines | ~43 |
| 07:15 | Edited plans/rendering_roadmap.md | expanded (+16 lines) | ~497 |
| 07:16 | Session end: 44 writes across 21 files (plane_api.py, probe_render.py, create_webgpu_backlog.py, verify_webgpu.py, link_webgpu_deps.py) | 16 reads | ~138350 tok |

## Session: 2026-07-27 07:19

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 07:16 | landed docs commit on main: fetch showed user had merged PR #2, so reset --keep to origin/main and cherry-picked 9a89a58 -> 1429e6e, pushed | README.md, tests/e2e/README.md, plans/rendering_roadmap.md | pushed 519c55d..1429e6e | ~4k |
| 07:32 | Plane: renamed module "OpenSCAD Interpreter" -> "OPENSCAD" (aa260d03) and added #9, #22, #36, #37; now 15 issues | Plane API | done; noted #101-#104 backlog vs built src/scad | ~6k |
| 07:39 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/catia_defs.py | â€” | ~7262 |
| 07:39 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/catia_create.py | â€” | ~372 |
| 07:40 | Created ../../Users/HP/AppData/Local/Temp/claude/C--Dev-webcad/2ba9f360-7e19-4074-9d7b-5b9267b68f6a/scratchpad/catia_comment.py | â€” | ~923 |
| 07:58 | Plane: created Road to CATIA backlog from Documents/3d/road_to_catia.md - 17 issues #175-#191 under epic #13, new module 19e06d87, mapping comment posted | Plane API | done; flagged #139/#141/#92 as stale | ~25k |
| 07:41 | Session end: 3 writes across 3 files (catia_defs.py, catia_create.py, catia_comment.py) | 3 reads | ~12695 tok |

## Session summary â€” 2026-07-27
Landed the WebGPU phase A/B docs on `main` (1429e6e) after recovering from a bad
`--ff-only` that had rewritten past the user's GitHub PR merge commit.
Plane: renamed module "OpenSCAD Interpreter" -> OPENSCAD (15 issues) and built the
Road to CATIA backlog â€” 17 issues #175-#191 under epic #13, new module 19e06d87.
Verified every roadmap item against source first; filed only gaps, flagged #139/#141/#92
as stale. Cerebrum updated: rtk grep false-zeroes, PR-merge git workflow.
Dev servers stopped (5173, 4173). Uncommitted: .wolf/, .claude/, CLAUDE.md, planning md files.
| 07:44 | Session end: 3 writes across 3 files (catia_defs.py, catia_create.py, catia_comment.py) | 3 reads | ~12695 tok |

## Session: 2026-07-27 08:04

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 10:58 | Project health check: typecheck, unit tests, lint, build | - | typecheck clean; 332/332 tests pass (63 files); lint 0 errors/904 warnings; build OK (4.56 MB main chunk, 65 MB OCCT wasm) | ~8k |
| 11:12 | Reconciled docs consolidation: added docs/** and vendors/** to vitest + eslint ignores, fixed Scad.test.ts fixture path and README roadmap link | vitest.config.ts, eslint.config.js, src/scad/Scad.test.ts, README.md, .gitignore, .wolf/anatomy.md | npm test 332/332 pass, lint 0 errors (904 baseline warnings), typecheck clean | ~12k |
| 11:12 | Moved vendored third-party trees out of docs/ into vendors/ (replicad-main 24.4MB, chili3d 16.9MB, BOSL-master) and gitignored vendors/ | vendors/, .gitignore | 41.4 MB of reference code relocated; not tracked by git | ~3k |
| 11:20 | Created dev branch from main, committed docs reorg (147 files) and pushed to origin | docs/, vendors/, .gitignore, eslint.config.js, vitest.config.ts, src/scad/Scad.test.ts, README.md | commit 62feeb6 on origin/dev; main untouched at 1429e6e | ~5k |
| 10:44 | Project health check (typecheck/tests/lint) | src/**, tests/ | typecheck 0 errors; vitest 369/369 pass (69 files); eslint 0 errors / 900 pre-existing any-warnings | ~2k |
| 15:29 | Populated Plane with WC-EC epic (0b48edcf-...) + 53 tickets (WC-EC-01..53), all parented to epic, state=backlog | populate_plane.py, plane-secret-key.csv | All 54 issues created and verified via Plane API | ~4k |

| 2026-11-19 15:41 | Updated 11 WC-EC Plane tickets for gRPC/Connect transport replacement | *.wolf/*, C:\tmp\* | 11/11 success (200 OK) | ~300 |
|   1 6 : 3 3   |   C o m m i t t e d   P R   2 a :   g R P C / C o n n e c t   g a t e w a y   w i t h   m o c k   k e r n e l   ( 7   f i l e s ,   1 0 5 8   l i n e s )   |   s r c / c o r e / g a t e w a y / * . t s   |   t s c   p a s s e s ,   c o m m i t t e d   o n   d e v   |   ~ 2 0 0 0   |  
 
| 16:39 | Fixed SessionOrderer.processBuffered() not resolving buffered entry promises; fixed dedupe/ordering test fake timer issues; tsc clean, all 57 gateway tests pass | src/core/gateway/ordering.ts, ordering.test.ts, dedupe.test.ts | committed on dev | ~150 |
|   1 7 : 5 7   |   C o m p l e t e d   P R   3 :   R e m o t e G r p c T r a n s p o r t ,   n g i n x . c o n f ,   d o c k e r - c o m p o s e . y m l ,   A G E N T S . m d ,   R E A D M E . m d ,   A D R - 0 0 1 ;   a l l   1 3   t r a n s p o r t   t e s t s   p a s s ,   t s c   c l e a n   |   s r c / c o r e / i o / R e m o t e G r p c T r a n s p o r t . t s ,   n g i n x . c o n f ,   d o c k e r - c o m p o s e . y m l ,   A G E N T S . m d ,   R E A D M E . m d ,   d o c s / a d r / 0 0 1 - g r p c - c o n n e c t - t r a n s p o r t . m d   |   ~ 5 0 0 0   |  
 |   1 8 : 0 0   |   C o m m i t t e d   r e m a i n i n g   P R   3   c h a n g e s :   f i r e - a n d - f o r g e t   f i x e s   ( D o c u m e n t / H i s t o r y M a n a g e r / S y s t e m H a n d l e r / S k e t c h T o o l W i n d o w ) ,   g a t e w a y   s e s s i o n - m a n a g e r   t e s t s ,   v i t e s t   s e t u p   |   7   f i l e s   +   2   t e s t   f i l e s   |   ~ 2 0 0 0   |  
  
 |   1 8 : 0 2   |   W C - E C - 0 1   f i x e d   d o u b l e   B u i l d ( )   i n   b o o l e a n   o p s   |   s r c / c o r e / i o / O C C W o r k e r . t s   |   m a k e B o o l e a n B u i l d e r   n o w   u s e s   d e f a u l t   c o n s t r u c t o r s   ( _ 1   v a r i a n t s )   o n l y ;   b u i l d B o o l e a n O p   c a l l s   B u i l d ( )   o n c e   |   ~ 4 0 0   |  
 | 18:45 | WC-EC-02 Ticket 1 Command Registry complete: BoxCommand + wiring | src/core/gateway/command-registry.ts, command-registry.test.ts, commands/box.ts, commands/box.test.ts, connect-server.ts | committed, all gateway tests pass | ~2200 |
| 18:50 | Fix browser errors: protobuf compat shim + rxjs install | src/compat/protobuf-v1-compat.ts, vite.config.ts, package.json, package-lock.json | committed, dev server starts clean | ~1200 |
| 18:55 | Fix protobuf compat shim circular alias + missing exports | src/compat/protobuf-v1-compat.ts, vite.config.ts | committed as 95412e5 | ~400 |
| 18:58 | Complete protobuf compat shim â€” wire/wkt/codegenv2 subpaths | src/compat/protobuf-v1-compat-*.ts, vite.config.ts | committed as 776ef11, dev server clean | ~600 |
| 19:00 | Fix protobuf compat shim runtime: instance methods + MethodKind | src/compat/protobuf-v1-compat.ts | committed as 3d8245a, dev server clean | ~500 |

| 19:18 | Fix protobuf TDZ errors: proto3 before Message, lazy newFieldList via Proxy, file_google_protobuf_any from v2.x wkt, codegenv2 direct alias | src/compat/protobuf-v1-compat.ts, src/compat/protobuf-v1-compat-wkt.ts, src/compat/protobuf-v1-compat-codegenv2.ts, vite.config.ts, tests/e2e/check-console.spec.ts | committed as 9871da8, Playwright 0 console errors | ~600 |
| 19:31 | Write WC-EC-12 parity harness design spec | docs/superpowers/specs/2026-11-19-parity-harness-design.md | design written, awaiting user review | ~1000 |
 
 |   1 9 : 3 6   |   W r i t e   W C - E C - 1 2   p a r i t y   h a r n e s s   i m p l e m e n t a t i o n   p l a n   |   d o c s / s u p e r p o w e r s / p l a n s / 2 0 2 6 - 1 1 - 1 9 - p a r i t y - h a r n e s s . m d   |   p l a n   s a v e d ,   r e a d y   f o r   e x e c u t i o n   |   ~ 4 k   |  
 | 09:22 | Fixed pre-existing lint parsing error in native-kernel-adapter.integration.test.ts; full lint passes with 0 errors; WC-EC-04 snapshot renderer validated (typecheck + determinism tests pass) | tests/harness/native-kernel-adapter.integration.test.ts, .wolf/memory.md | success | ~100 |

| 10:05 | Revised vitest protobuf alias fix design spec (revisions 0-6): added Step 0 spike results (module-load failure at common_pb.ts:77), vite.aliases.ts at repo root with fileURLToPath root pattern, Section 7 rewrite (Connect runtime v2, blocker is v1 service descriptors), Section 4 failure mode correction (runtime descriptor mismatch not module-load), codegenv2 shim file deletion, added npm run build + dev-server smoke check to acceptance, clarified 65/18 counts suites not tests, shim exit milestone tied to bug-087 | docs/superpowers/specs/2026-11-20-vitest-protobuf-alias-fix-design.md | spec revised, awaiting user approval | ~2k |

| 09:47 | Completed Step 0 spike: confirmed v1 ServiceType descriptor mismatch at runtime (TypeError: Cannot read properties of undefined reading 'toString' at create-method-url.js:31). Sized regeneration: 3 generated files, 3 source call sites (type-only), 1 test mock file. Wrote regeneration spec 'Regenerate protobuf with protoc-gen-es v2' that supersedes alias-fix spec | docs/superpowers/specs/2026-11-20-regenerate-protobuf-es-v2-design.md, docs/superpowers/specs/2026-11-20-vitest-protobuf-alias-fix-design.md | spec written, awaiting user approval | ~2k |
## Session: 2026-11-20 10:19

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 10:19 | Wrote kernel dependency triage & reuse spec using materializr as reference: adopt OCCT in kernel (LGPL-2.1 + exception), zlib in gateway (Node built-in), skip ImGui/SDL3/GLEW/pfd/libcurl/GLM, keep nanosvg/fonts in browser; OCCT minimal toolkit set, build flags, export analysis (STEP/STL/glTF/OBJ/3MF), OCCT license text (LICENSE_LGPL_21.txt + OCCT_LGPL_EXCEPTION.txt), 8 open questions, affected ticket edits | docs/superpowers/specs/2026-11-20-kernel-dependency-triage-spec.md | spec written, pending review | ~27k |
| 11:00 | Created WC-EC-05 kernel skeleton implementation plan (7 chunks: protocol spec, OCCT build image, kernel worker skeleton, gateway supervisor, transport integration, E2E verification, acceptance) | docs/superpowers/plans/2026-11-20-wc-ec-05-kernel-skeleton.md | plan complete, spec-only (no code), awaiting user approval | ~19k |
| 11:00 | Updated OpenWolf protocol files: anatomy.md (added new plan entry), memory.md (session entries) | .wolf/anatomy.md, .wolf/memory.md | OpenWolf protocol satisfied | ~500 |
| 11:15 | Created CMakeLists.txt for kernel build: OCCT 7.9.3 explicit toolkit set, protobuf, gRPC, platform-specific flags (MSVC/GNU) | CMakeLists.txt | Chunk 2 step 1 complete | ~1300 |
| 11:15 | Created Dockerfile.kernel: multi-stage Ubuntu 22.04 + OCCT 7.9.3 build + kernel worker; OCCT_VERSION build arg | Dockerfile.kernel | Chunk 2 step 1 complete | ~1300 |
| 11:20 | Created kernel-worker.cpp: C++ gRPC server skeleton with Kernel.Execute, OCCT 7.9.3 BRepPrimAPI_MakeBox + BRepMesh_IncrementalMesh, B-rep pre-validation, in-band ExecuteFailure codes (fixed to match actual proto: ExecutionFailureCode enum, op_case dispatch, header.session_id) | src/core/gateway/kernel-worker.cpp | Chunk 3 complete | ~7500 |
| 11:30 | Creating kernel-supervisor.ts: Node process pool with spawn/pool/respawn/crash recovery, one kernel per session | src/core/gateway/kernel-supervisor.ts | In progress | ~ |
| 11:40 | Created kernel-supervisor.ts: spawn kernel_worker per session, spare pool, health check, crash recovery (REHYDRATING → Restore → replay), gRPC UDS client integration | src/core/gateway/kernel-supervisor.ts | Chunk 4 complete | ~8300 |
| 12:00 | Created KernelGrpcTransport.ts stub: OCCTransport implementation routing to native OCCT kernel via gRPC/UDS through KernelSupervisor; all methods throw "not yet implemented" pending Chunk 6 wiring | src/core/io/KernelGrpcTransport.ts | Chunk 5 start | ~2560 |
| 12:05 | Modified OpenCascadeService.ts: added 'kernel' transport option, KernelGrpcTransport import, init() branch for kernel transport with sessionId requirement | src/core/io/OpenCascadeService.ts | Chunk 5 complete | ~500 |
| 12:10 | Fixed kernel-supervisor.ts: replaced invalid 'dead' SessionState with 'rehydrating' (2 occurrences); TypeScript now compiles with 0 errors | src/core/gateway/kernel-supervisor.ts | Chunk 5 fix | ~200 |
| 12:15 | Verified TypeScript compiles clean (0 errors); lint shows only expected stub warnings; ready for Chunk 7 build check | src/core/io/KernelGrpcTransport.ts, src/core/io/OpenCascadeService.ts, src/core/gateway/kernel-supervisor.ts | Verified | ~300 |



 
 |   1 2 : 3 0   |   F i x e d   v i t e . c o n f i g . t s :   a d d e d   r o l l u p O p t i o n s . e x t e r n a l   f u n c t i o n   t o   e x t e r n a l i z e   k e r n e l - s u p e r v i s o r . t s   ( s e r v e r - o n l y ,   N o d e . j s   b u i l t - i n s )   f r o m   b r o w s e r   b u n d l e   |   v i t e . c o n f i g . t s   |   B u i l d   b l o c k e r   r e s o l v e d   |   ~ 3 0 0   |  
 |   1 2 : 3 5   |   n p m   r u n   b u i l d   p a s s e s   ( 0   e r r o r s ,   ~ 4 8 s ) ;   K e r n e l G r p c T r a n s p o r t . t s   c o d e - s p l i t   a s   s e p a r a t e   c h u n k ,   n e v e r   l o a d e d   i n   b r o w s e r   d e f a u l t   t r a n s p o r t   |   v i t e . c o n f i g . t s ,   s r c / c o r e / i o / K e r n e l G r p c T r a n s p o r t . t s   |   C h u n k   7   b u i l d   c h e c k   p a s s e d   |   ~ 2 0 0   |  
 |   1 2 : 4 0   |   C r e a t e d   t e s t s / e 2 e / k e r n e l - r o u n d t r i p . s p e c . t s :   E 2 E   t e s t   s t u b   f o r   k e r n e l   r o u n d - t r i p   v i a   C o n n e c t ,   c r a s h   r e c o v e r y   ( s k i p p e d   u n t i l   n a t i v e   k e r n e l   b i n a r y   b u i l t )   |   t e s t s / e 2 e / k e r n e l - r o u n d t r i p . s p e c . t s   |   C h u n k   6   s t e p   1   |   ~ 3 0 0   |  
 |   1 0 : 4 6   |   R e s o l v e d   A D R   o p e n   q u e s t i o n s :   Q 2   S o l i d C r a f t = i n s p i r a t i o n   o n l y   ( n o   w a i v e r / a p p r o v e r ) ,   Q 3   L G P L = h o s t e d   ( s e r v e r - s i d e   k e r n e l ,   m i n i m a l   o b l i g a t i o n ) .   U p d a t e d   A D R   s p e c   s e c t i o n s   8 ,   1 1 - 1 3   a n d   p l a n   o p e n   q u e s t i o n s   t a b l e   |   d o c s / s u p e r p o w e r s / s p e c s / 2 0 2 6 - 1 1 - 2 0 - k e r n e l - s t r a t e g y - a d r - d e s i g n . m d ,   d o c s / s u p e r p o w e r s / p l a n s / 2 0 2 6 - 1 1 - 2 0 - w c - e c - 0 5 - k e r n e l - s k e l e t o n . m d   |   O p e n   q u e s t i o n s   r e s o l v e d   |   ~ 1 5 0 0   |  
 |   1 0 : 4 9   |   A d d e d   O n s h a p e   g e o m e t r y   e n g i n e   s e r v e r   a s   a r c h i t e c t u r a l   i n s p i r a t i o n   ( b r o w s e r   U I   �!  g a t e w a y   �!  k e r n e l   w o r k e r s   �!  p e r s i s t e n t   s t o r a g e ,   s a m e   s p l i t   a s   O n s h a p e ' s   P a r a s o l i d - b a s e d   c l o u d   C A D ) .   R e m o v e d   S o l i d C r a f t   f r o m   o p t i o n s   t a b l e ,   c o n s e q u e n c e s ,   r i s k s ,   a n d   r e l a t e d   t i c k e t s   s i n c e   i t ' s   i n s p i r a t i o n   o n l y .   A D R   s p e c   f u l l y   c o n s i s t e n t   |   d o c s / s u p e r p o w e r s / s p e c s / 2 0 2 6 - 1 1 - 2 0 - k e r n e l - s t r a t e g y - a d r - d e s i g n . m d   |   A D R   s p e c   u p d a t e d   |   ~ 1 0 0 0   |  
 
| 10:52 | Addressed WC-EC-05 open questions Q1/Q4; fixed Document.test.ts redo B-rep restore race (un-awaited async undo/redo); all 477 unit tests pass; updated ADR spec Sections 12-13 and plan open questions table | src/core/model/Document.test.ts, docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md, docs/superpowers/plans/2026-11-20-wc-ec-05-kernel-skeleton.md | ~200 |

| 13:37 | Created assets/fonts/FONT-CREDITS.md (font license/attribution doc for public/fonts/); added anatomy.md entry; Chunk 1 of kernel-dependency-implementation-plan.md started | assets/fonts/FONT-CREDITS.md, .wolf/anatomy.md | Chunk 1 complete | ~800 |
