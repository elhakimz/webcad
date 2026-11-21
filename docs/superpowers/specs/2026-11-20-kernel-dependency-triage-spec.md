# WebCad Native Kernel — Dependency Triage & Reuse Plan

**Status:** Draft (design/spec only — no code, no dependency installs)
**Date:** 2026-11-20
**Epic:** WEBCAD-EPIC-EC-v5
**Reference:** elhakimz/materializr (cloned to C:\Dev\research\materializr for inspection)

---

## 1. Purpose

Triage every third-party dependency listed in materializr's README and decide whether WebCad's native OCCT kernel (C++17) should **adopt in kernel**, **adopt in gateway**, **keep in browser**, or **skip**. The output is a reuse plan that feeds the OCCT build image (WC-EC-08), kernel worker skeleton (WC-EC-10), and export tickets (WC-EC-24, WC-EC-25).

**Constraint:** Do NOT copy materializr source code into WebCad. materializr is GPLv3; WebCad is not GPL. Use upstream libraries directly under their own licenses. Any code reuse needs a license decision from the materializr evaluation spike (WC-EC-07).

**Architecture inspiration:** Onshape geometry engine server (browser UI + application services + server-side geometry engine + persistent cloud storage). WebCad follows this pattern: TypeScript/Three.js UI → Connect gateway → native OCCT kernel → persistent storage. SolidCraft/solidcore is reference only (inspiration, no code copying).

---

## 2. Conflict Check — Approved gRPC Design & Kernel Strategy ADR

Before triage, confirm this plan does not conflict with the approved architecture in `docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md` and the gRPC/Connect transport design:

| ADR / gRPC design rule | Impact on this triage |
|---|---|
| Native gRPC over UDS (TCP+mTLS cross-host), no WebSocket, no stdio | Confirms: kernel is headless C++ compute; no SDL3/GLEW/ImGui needed in kernel or gateway |
| Browser ↔ gateway via Connect (RemoteGrpcTransport, unchanged) | Confirms: browser keeps its own UI/rendering stack; kernel has no direct browser dependency |
| One kernel process per session; pool = warm spares | Confirms: kernel is stateless compute per session; no persistent native UI state |
| Stage 1 authority: client holds brepSnapshot; kernel = rebuildable per-session cache | Confirms: kernel needs no file dialogs, no update checks, no native OS plumbing |
| B-rep pre-validation only on importBRep/Restore | Confirms: kernel needs no nanosvg for headless SVG (browser parses SVG) |
| No silent WASM fallback; explicit "update required" banner default | Confirms: kernel has no user-facing UI; libcurl "check for updates" is unnecessary |
| OCCT exceptions → in-band ExecuteFailureCode | Confirms: kernel error handling is in-band; no native crash dialogs (portable-file-dialogs unnecessary) |
| OCCT LGPL-2.1; dynamic linking default; hosted-vs-distributed open question | Confirms: zlib (system) and OCCT (shared lib) linking decisions matter for LGPL compliance |

**No conflicts found.** Proceed with triage.

---

## 3. Dependency Triage Table

Source: materializr `README.md:221-252` (full dependency list), `CMakeLists.txt` (build usage).

| # | Dependency | materializr license | WebCad verdict | Rationale | WebCad feature / ticket affected |
|---|---|---|---|---|---|
| 1 | OpenCASCADE Technology (OCCT) | LGPL-2.1 + Open CASCADE Exception | **Adopt in kernel** | Core geometry kernel. WebCad's native kernel is OCCT 7.9.3 (baseline), 8.0.x gated. | WC-EC-08 (build image), WC-EC-10 (worker skeleton), WC-EC-14–25 (OCCT ports) |
| 2 | GLM | MIT | **Skip** | materializr uses GLM for OpenGL-friendly C++ math (matrices/vectors for UI/graphics). WebCad kernel uses OCCT's `gp_Pnt`, `gp_Dir`, `gp_Ax2`, `gp_GTrsf` for geometry math (see `OCCWorker.ts` OCCT class usage). Three.js handles browser-side math. No concrete kernel need identified. | None — skip unless a kernel math need emerges |
| 3 | Dear ImGui | MIT | **Skip** | materializr uses ImGui for immediate-mode native desktop GUI. WebCad UI is browser-based (Three.js + DOS-style HTML: MainMenuScreen, Menu, CommandLine, StatusBar). Kernel is headless compute; gateway is headless Node.js. No native desktop UI in scope. | None |
| 4 | SDL3 | zlib | **Skip** | materializr uses SDL3 for window, input, and OpenGL context creation on desktop + mobile. WebCad runs in the browser (browser provides window/input context); gateway is headless Node.js; kernel is compute-only (no rendering). | None |
| 5 | GLEW | Various | **Skip** | materializr uses GLEW for OpenGL extension loading on Windows desktop. WebCad uses WebGL/WebGPU via Three.js in browser; kernel is headless (no OpenGL context); gateway is headless Node.js. | None |
| 6 | nanosvg | zlib | **Keep in browser** (default) | materializr uses nanosvg for the sketch SVG-import tool (`README.md:236-237`). WebCad default: browser parses SVG into profile geometry (point arrays) and sends profiles to the kernel via existing `OCCTransport` createExtrude/createRevolve/createLoft ops. Kernel-side nanosvg only if headless/scripted SVG import is required (future ticket). | SVG import (existing browser path); kernel-side only if headless SVG ticket added |
| 7 | libcurl | MIT/X derivative | **Skip** | materializr uses libcurl for HTTPS GET "Help → Check for updates" (`README.md:238-239`). WebCad is a web app; browser handles HTTPS. Gateway is Node.js (built-in `https`/`fetch`). No update-check binary needed in kernel or gateway. | None |
| 8 | zlib | zlib license | **Adopt in gateway** (Node built-in) | materializr uses zlib for gzip stream in `.materializr` project format (`README.md:240-241`) and `crc32` in 3MF export. WebCad: compression happens at the **gateway** via Node's built-in `zlib` module — no separate dependency. Tie to the gzip-for-B-rep-text rule: B-rep text (STEP, IGES) compressed at gateway before browser delivery; browser request-compression limits apply per the gRPC design. Kernel does not need zlib — OCCT handles binary B-rep via `BinTools`. | Gateway compression (B-rep text gzip); 3MF export if adopted |
| 9 | portable-file-dialogs | MIT | **Skip** | materializr uses pfd for native file dialogs on desktop. WebCad uses browser `<input type=file>` / File System Access API. Gateway is headless; kernel has no UI. | None |
| 10 | 10 text fonts (JetBrains Mono, DejaVu, Liberation, Ubuntu, Comic Neue, Black Ops One, Anton, Pacifico, Noto Sans SC) | Various (SIL OFL, Apache 2.0, etc.) | **Keep in browser** (default) | materializr ships 10 fonts for the sketch Text tool (`README.md:249-252`, `assets/fonts/FONT-CREDITS.md`). WebCad default: text-to-outline via `opentype.js` (already a dev dependency `^1.3.5`) in the browser; fonts served from `public/fonts/`. Currently only `public/fonts/osifont.ttf` exists; Arimo (Apache 2.0) planned per `docs/base/fix_svg2pdf_fonts_agent.md`. No font bundling yet — see font section below. | SVG text-to-path (opentype.js); PDF export via svg2pdf.js |
| 11 | Iconoir icon font | MIT | **Keep in browser** | materializr uses Iconoir for UI icons. WebCad UI is browser-based; icons served as font/CSS from browser assets. No kernel or gateway impact. | Browser UI icons |

**Triage summary:** 1 adopt in kernel (OCCT), 1 adopt in gateway (zlib via Node built-in), rest keep in browser or skip. No new kernel dependencies beyond OCCT and its transitive system libs.

---

## 4. Fonts — License & Attribution Analysis

### 4.1 Where text-to-outline lives

**Decision:** Browser (default). `opentype.js` (`^1.3.5`, already a dev dependency) loads TTF files at runtime in the browser to convert SVG `<text>` to `<path>` before svg2pdf.js PDF conversion. Kernel-side text-to-B-rep would require OCCT's `Font_BRepFont` / `Font_BRepTextBuilder` (materializr links `TKService` + `TKV3d` for this — `CMakeLists.txt:508-510`), which adds OCCT viewer toolkits to a headless kernel. Not needed for Phase 1.

### 4.2 Font inventory in WebCad

| Font | File | License | Attribution / redistribution requirement |
|---|---|---|---|
| OSIFont | `public/fonts/osifont.ttf` | (in repo) | Verify license; file present |
| Arimo (Regular/Bold/Italic) | `public/fonts/Arimo-*.ttf` (planned, not present) | Apache 2.0 | Copyright notice + license copy; state changes if modified |
| (10 materializr fonts) | N/A (not in WebCad) | Various | Not adopted; materializr `assets/fonts/FONT-CREDITS.md` is reference only |

**Open question (human decision):** Author `assets/fonts/FONT-CREDITS.md` for WebCad fonts served to browsers? **Proposed default: yes** — create when Arimo fonts are added to `public/fonts/`, listing each font, copyright, license, and attribution text.

**Open question (human decision):** Bundle any materializr fonts into WebCad? **Proposed default: no** — use upstream fonts directly under their own licenses; no copying of materializr font files.

---

## 5. materializr Build Setup for OCCT — Analysis & Recommendation

Source: materializr `CMakeLists.txt` (full build), `Dockerfile`, `vcpkg.json`, `docs/ipad-port-plan.md`.

### 5.1 OCCT version pinning

| File | How specified | Lines |
|---|---|---|
| `Dockerfile` | `ARG OCCT_TAG=V7_9_3` (source build from tag `V7_9_3`), SHA256 pinned, Ubuntu 24.04 builder | — |
| `vcpkg.json` | pins `opencascade` version `7.9.3` (to avoid OCCT 8.0 which hangs long-rod thread generation) | — |
| `CMakeLists.txt` | `OpenCASCADE_VERSION` used for toolkit rename gate: `VERSION_GREATER_EQUAL 7.8` → `TKDESTEP`/`TKDEIGES`/`TKDESTL`, else `TKSTEP`/`TKIGES`/`TKSTL` | `:491` |
| `docs/architecture.md` | OCCT 7.9.3 | — |
| `CHANGELOG.md` | OCCT 7.9.3 | — |

### 5.2 OCCT toolkits linked (Linux/macOS — explicit set, NOT umbrella)

Source: `CMakeLists.txt:491-523`. materializr deliberately avoids `OpenCASCADE_LIBRARIES` on Linux/macOS because the umbrella pulls in Draw/test harnesses (TKDraw, TKViewerTest, TKQADraw, ...) that bloat the macOS .dmg.

| Toolkit | Purpose in materializr | Needed for WebCad headless kernel? |
|---|---|---|
| TKernel | Root OCCT kernel | Yes |
| TKMath | Math base | Yes |
| TKG3d | 3D viewer geometry | No (headless, no rendering) |
| TKBRep | B-rep data structures | Yes |
| TKGeomBase | Geometry base | Yes |
| TKGeomAlgo | Geometry algorithms | Yes |
| TKTopAlgo | Topological algorithms | Yes |
| TKPrim | Primitive construction (box, cylinder, etc.) | Yes |
| TKBool | Boolean operations | Yes |
| TKBO | Boolean operations (7.8+) | Yes |
| TKFillet | Fillet/chamfer | Yes |
| TKOffset | Offset/draft/shell | Yes |
| TKShHealing | Shape healing | Yes (import validation) |
| TKMesh | Mesh/tessellation | Yes (for MeshData export) |
| TKXSBase | XML base | No (unless STEP XML needed) |
| TKDESTEP / TKSTEP | STEP data exchange | Yes (STEP import/export, WC-EC-25) |
| TKDEIGES / TKIGES | IGES data exchange | Maybe (future) |
| TKDESTL / TKSTL | STL data exchange | Maybe (custom STL preferred per materializr) |
| TKBin | Binary B-rep read/write (BinTools) | Yes (B-rep import/export, WC-EC-24) |
| TKService | Font_BRepFont / Font_BRepTextBuilder | No (browser handles text-to-outline) |
| TKV3d | Viewer + Font_BRepFont | No (headless, no rendering) |

**Recommended minimal module set for WebCad kernel:**

```
TKernel TKMath TKBRep TKGeomBase TKGeomAlgo TKTopAlgo TKPrim TKBool TKBO
TKFillet TKOffset TKShHealing TKMesh TKBin TKDESTEP TKDEIGES
```

(Skip TKG3d, TKService, TKV3d, TKXSBase, TKDESTL/TKSTL unless specific needs arise.)

### 5.3 Build flags (from materializr CMakeLists.txt)

| Setting | Value | Lines | WebCad recommendation |
|---|---|---|---|
| CMake minimum | 3.20 | :1 | Keep |
| C++ standard | C++17 REQUIRED | :27-28 | Keep |
| MSVC flags | `/EHa` + `/utf-8` globally; `/bigobj` | summary | Keep for Windows builds |
| GNU/Clang flags | `-Wswitch` only (not `-Wall`) | summary | Keep — deliberate, catches missing enum cases |
| non-Windows define | `OCC_CONVERT_SIGNALS` | summary | Keep |
| Apple define | `GL_SILENCE_DEPRECATION` | summary | N/A (headless, no OpenGL) |
| OCCT version gate | `OpenCASCADE_VERSION VERSION_GREATER_EQUAL 7.8` | :491 | Keep for 7.8+ toolkit rename |
| Build type | Release | — | `-O2 -DNDEBUG` |
| Strip/LTO | `-dead_strip` + LTO on macOS | `docs/ipad-port-plan.md:135` | Enable LTO + dead-strip in Release for all platforms |

### 5.4 Third-party dependency handling

| Dep | Mechanism | WebCad approach |
|---|---|---|
| OpenCASCADE | `find_package(CONFIG REQUIRED)` — system apt/Homebrew, source-built prefix, or vcpkg (Windows). Not vendored, not FetchContent. | Same — system OCCT or source-built via Docker |
| SDL3/GLM/nlohmann_json/ImGui | FetchContent | N/A (skipped) |
| ZLIB | `find_package(REQUIRED)` (system) | Node built-in zlib in gateway; kernel uses OCCT BinTools |
| GLEW | Windows: `find_package(REQUIRED)` via vcpkg | N/A (skipped) |
| CURL | `find_package(REQUIRED)` | N/A (skipped) |
| Threads | `find_package(REQUIRED)` | Keep (kernel threading) |

### 5.5 Target platforms (materializr)

| Platform | Artifact | OCCT linkage |
|---|---|---|
| Linux | AppImage, glibc 2.38+ | Source-built OCCT 7.9.3 shared |
| Windows | Setup.exe installer + portable zip, static SDL | vcpkg OCCT 7.9.3 |
| macOS | Apple Silicon, Homebrew OCCT, ad-hoc signed .dmg | Homebrew OCCT |
| Android | arm64-v8a APK/AAB | Cross-built OCCT 7.9.3 shared |
| iPad/iOS | App Store | Static OCCT 7.9.3 |

**WebCad kernel build image:** Linux only (server-side). Docker image with OCCT 7.9.3 built from source (or apt package), C++17 compiler, CMake 3.20+, protobuf C++ for gRPC.

**System packages needed to compile the server (kernel_worker)** — from `Dockerfile.kernel`, verified by successful build:

| Package category | Packages | Purpose |
|---|---|---|
| Build essentials | `build-essential cmake git` | Compiler, CMake, source control |
| OCCT GUI/toolkit deps (needed at OCCT build time even for headless) | `freeglut3-dev libx11-dev libxext-dev libxft-dev libxmu-dev libxpm-dev libxrandr-dev libglew-dev libfreetype6-dev libfontconfig1-dev libglu1-mesa-dev libxcursor-dev libxi-dev libxt-dev` | OCCT requires these X11/OpenGL dev headers during configure/make even when modules are OFF |
| Protobuf/gRPC C++ | `protobuf-compiler libprotobuf-dev libgrpc-dev libgrpc++-dev protobuf-compiler-grpc` | Kernel gRPC server code generation |
| Runtime | `ldconfig` (post-install) | Shared library cache so `libTK*.so.7.9` resolve at runtime |

**CI matrix:** OCCT_VERSION build arg with 7.9.3 (baseline) + 8.0.x (gated, per ADR version decision).

### 5.6 Resulting size

| Source | Estimate | Verified? |
|---|---|---|
| `docs/ipad-port-plan.md:135` | ~60–120 MB before dead-strip (iOS static OCCT) | Unverified (estimate only, iOS-specific) |
| WebCad kernel (Linux shared OCCT, headless) | Not estimated | Unverified — measure in WC-EC-08 |

**Image size optimization:** The 2 GB Docker image estimate includes build cache and intermediate stages. Multi-stage Docker builds discard build stages (OCCT source, CMake cache, object files) in the final runtime image. The actual kernel runtime image can be substantially smaller — measure in WC-EC-08 before treating 2 GB as a hard blocker.

**Open question (human decision):** What size threshold triggers "too heavy" for the kernel binary? **Proposed default: >100 MB** (matches ADR threshold). CI build time >15 min, image >2 GB also from ADR — but image size can be reduced by cleaning build residue in multi-stage Docker builds.

---

## 6. Export Implementation — STEP / STL / glTF / OBJ / 3MF

Source: materializr `src/io/` and `src/plugins/` (export plugins). materializr does NOT copy OCCT source; it calls OCCT APIs and writes custom format code.

### 6.1 Format-by-format breakdown

| Format | IO file (lines) | Plugin file (lines) | OCCT classes used | Custom code |
|---|---|---|---|---|
| STEP | `src/io/StepIO.cpp:453` | `src/plugins/StepIOPlugin.cpp:270` | `STEPControl_Writer`, `STEPControl_Reader`, `Interface_Static` (schema AP214 via `SetCVal("write.step.schema", "AP214")`), `BRepBuilderAPI_Transform` (Y-up→Z-up rotation) | Schema setup, Y-up→Z-up rotation |
| STL | `src/io/StlExport.cpp:8,458` | `src/plugins/StlExportPlugin.cpp:273` | `StlAPI_Writer` (include only at :8 — NOT called for final output), `BRepMesh_IncrementalMesh` (tessellation) | Custom vertex welding (1e-3 mm), non-manifold edge detection, pinhole fan-fill, manual binary + ASCII STL writer (~line 430+) |
| glTF | `src/io/GltfExport.cpp:460` | `src/plugins/GltfExportPlugin.cpp:274` | None (OCCT has no glTF writer) | Full binary GLB writer, JSON scene graph, buffer encoding (base64 or binary bin chunk) |
| OBJ | `src/io/ObjExport.cpp:456` | `src/plugins/ObjExportPlugin.cpp:276` | None | Full indexed OBJ writer, vertex deduplication, Z-up rotation |
| 3MF | `src/io/ThreeMfExport.cpp:459` | `src/plugins/ThreeMfExportPlugin.cpp:277` | None | Custom ZIP writer (STORED entries, zlib `crc32` checksums), XML model part (`3D.model`, mesh resources), Z-up rotation |

### 6.2 Mesh tessellation

`meshWithFallback` in `src/core/MeshParams.h:637` — tries Delabella via `BRepMesh_IncrementalMesh`, falls back to Watson, then escalating deflection for bare faces. WebCad should adopt this pattern for export tessellation.

### 6.3 Recommendation for WebCad export ticket (WC-EC-25)

| Format | Recommendation | Rationale |
|---|---|---|
| STEP | **Use OCCT `STEPControl_Writer`/`Reader` directly** (like materializr `StepIO.cpp`) | OCCT has a mature STEP implementation; AP214 schema for mechanical design with color/layer |
| STL | **Custom tessellation + writer** (like materializr `StlExport.cpp`) | `StlAPI_Writer` is included but not used for final output; materializr's custom weld + writer gives better control |
| glTF | **Pure custom** (no OCCT writer) | OCCT has no glTF writer; materializr writes custom binary GLB |
| OBJ | **Pure custom** | OCCT has no OBJ writer |
| 3MF | **Pure custom** | OCCT has no 3MF writer; custom ZIP + XML |

### 6.4 Large-export delivery through the gateway

Per the gRPC design (`proto/webcad/engine/v1/engine.proto`):

- **StreamResult RPC** (server-streaming) — for exports too large for a single unary response. Kernel streams result chunks (`ResultChunk` in `common.proto`) to gateway, gateway forwards to browser via Connect server-streaming.
- **BlobRef + object-store link** — for very large exports, kernel writes to object store, returns `BlobRef` pointer; browser downloads via HTTP.

**Recommendation:** Use `StreamResult` for exports up to ~100 MB; `BlobRef`/object-store link for larger. Kernel does not need to know about object store — gateway handles delivery.

---

## 7. OCCT License — Exact Text & Implications

### 7.1 License files (OCCT repo: https://github.com/Open-Cascade-SAS/OCCT)

The OCCT repo does **not** have a top-level `LICENSE` file (404 on both `master` and `main` branches — confirmed via GitHub API contents listing). Instead it ships two license files:

| File | URL | Size | Content |
|---|---|---|---|
| `LICENSE_LGPL_21.txt` | `https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/master/LICENSE_LGPL_21.txt` | 26,434 bytes | GNU Lesser General Public License version 2.1 (February 1999) |
| `OCCT_LGPL_EXCEPTION.txt` | `https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/master/OCCT_LGPL_EXCEPTION.txt` | 663 bytes | Open CASCADE exception v1.0 to GNU LGPL v2.1 |

**Exact OCCT exception text** (`OCCT_LGPL_EXCEPTION.txt`, verified via fetch):

```
Open CASCADE exception (version 1.0) to GNU LGPL version 2.1.

The object code (i.e. not a source) form of a "work that uses the Library"
can incorporate material from a header file that is part of the Library.
As a special exception to the GNU Lesser General Public License version 2.1,
you may distribute such object code incorporating material from header files
provided with the Open CASCADE Technology libraries (including code of CDL
generic classes) under terms of your choice, provided that you give
prominent notice in supporting documentation to this code that it makes use
of or is based on facilities provided by the Open CASCADE Technology software.
```

### 7.2 LGPL-2.1 dynamic-linking implications

OCCT is LGPL-2.1. WebCad links dynamically (shared library) — this is the **default and recommended approach** per the ADR. Dynamic linking implications:

- WebCad's own code remains under its own license (not LGPL).
- If WebCad distributes OCCT (shares `.so`/`.dll` with users), it must:
  - Provide OCCT source code or offer to provide it (LGPL §6/§?),
  - Give prominent notice that OCCT is used,
  - Allow users to modify/replace OCCT (dynamic linking satisfies this if the shared library can be swapped).
- If WebCad is **hosted only** (SaaS, kernel runs on server, users access via browser), LGPL distribution obligations may not be triggered — but this is a legal question.

**Open question (human decision):** OCCT delivery model — hosted (kernel on server, users via browser) vs distributed (kernel shipped to users)? **Proposed default: hosted** (minimizes LGPL obligation; matches the ADR's server-only kernel deployment). Flag for legal review before shipping.

### 7.3 Open CASCADE Exception relevance

The exception allows object code incorporating OCCT header material to be distributed under terms of your choice, with prominent notice in supporting documentation. This is relevant if WebCad distributes OCCT headers alongside its code — but with dynamic linking, the exception's header-incorporation clause is less central than LGPL's library-linking terms.

**Flag for legal review:** Confirm exact LGPL obligations for dynamic linking of OCCT in a hosted (SaaS) deployment vs distributed deployment.

---

## 8. Open Questions (Human Decisions)

| # | Question | Decision | Needs human? |
|---|---|---|---|
| 1 | Is the C++ gRPC build "too heavy" for the kernel? | **Resolved.** Try full gRPC first; fall back to length-prefixed protobuf over UDS only if thresholds exceeded (CI >15 min, image >2 GB, binary >100 MB, gRPC dep unavailable). Image size can be reduced via multi-stage Docker build residue cleanup. | No |
| 2 | SolidCraft waiver needed? | **Resolved — not needed.** SolidCraft/solidcore is inspiration only (per user). WebCad uses upstream OCCT directly; no materializr source code copying. | No |
| 3 | OCCT delivery model: hosted vs distributed? | **Resolved — hosted.** Serverside kernel confirmed. Kernel runs on server; users access via browser. Flag for legal review before shipping. | Yes (legal) |
| 4 | Author `assets/fonts/FONT-CREDITS.md` for WebCad browser fonts? | **Resolved — yes.** Create when Arimo fonts are added to `public/fonts/`. | No |
| 5 | Bundle any materializr fonts into WebCad? | **Resolved — no.** Use upstream fonts directly under their own licenses; no copying of materializr font files. | No |
| 6 | Document.test.ts investigation time-box (pre-existing B-rep restore failure)? | **Resolved — prefer lesser time (few hours, not a full day).** Record as ADR risk. | No |
| 7 | Kernel binary size threshold for "too heavy"? | **Default: >100 MB** (matches ADR threshold). | Yes |
| 8 | glTF/OBJ/3MF export priority order? | **Resolved — yes.** STEP first (WC-EC-25), then STL, glTF, OBJ, 3MF. | No |

---

## 9. Affected Epic Tickets & Required Edits

| Ticket ID | One-line change needed |
|---|---|
| WC-EC-08 (OCCT build image) | Add OCCT_VERSION build arg (7.9.3 default, 8.0.x CI matrix); use minimal toolkit set from Section 5.2; C++17, Release, LTO + dead-strip |
| WC-EC-10 (kernel worker skeleton) | CMakeLists.txt with explicit OCCT toolkit linking (Section 5.2), no SDL3/GLEW/ImGui, no portable-file-dialogs, no libcurl |
| WC-EC-14 (primitives port) | Map OCCT classes from `OCCWorker.ts` (BRepPrimAPI_Make*) to C++ calls; use `Message_ProgressRange` instead of `_1`/`_2` overload suffixes |
| WC-EC-18 (booleans port) | Port BRepAlgoAPI_Fuse/Cut/Common; handle TKBool/TKBO toolkits |
| WC-EC-19 (fillet/chamfer port) | Port TKFillet/TKOffset operations |
| WC-EC-23 (tessellation port) | Port BRepMesh_IncrementalMesh + meshWithFallback pattern (MeshParams.h:637) |
| WC-EC-24 (B-rep import/export) | Use TKBin (BinTools) for binary B-rep; pre-validation on importBRep/Restore per ADR |
| WC-EC-25 (server-side STEP/STL/glTF export) | STEP via STEPControl_Writer/Reader (AP214); STL via custom tessellation+writer; glTF/OBJ/3MF pure custom; StreamResult for large exports |
| WC-EC-33 (density/benchmark) | Measure kernel process density per session; binary size against >100 MB threshold |
| WC-EC-40 (OCCT upgrade policy) | Document 7.9.3 baseline, 8.0.x gated; materializr reverted from 8.0.0 (thread hang), pythonocc-core failed on 8.0.1 |

No font-specific tickets exist in the epic; font handling is addressed via `docs/base/fix_svg2pdf_fonts_agent.md` (opentype.js + Arimo, Apache 2.0).

---

## 10. Unverified

| Item | Why unverified |
|---|---|
| Exact kernel binary/image size for Linux headless OCCT 7.9.3 | materializr only reports ~60–120 MB iOS estimate (`docs/ipad-port-plan.md:135`); WebCad kernel not yet built |
| Whether `TKService`+`TKV3d` (Font_BRepFont) needed for future kernel-side text-to-B-rep | Not investigated; default is browser opentype.js |
| Whether 3MF custom ZIP writer needs zlib as a separate kernel dependency | materializr uses zlib `crc32`; WebCad gateway uses Node built-in zlib; kernel doesn't need it |
| OCCT LGPL exact obligations for hosted vs distributed deployment | Legal question; not verified |
| `StlAPI_Writer::Write` not called in materializr — confirmed only by summary | Line 8 include confirmed; final output written manually |
| FONT-CREDITS.md line ranges in materializr | Structure confirmed but not re-read line-by-line in this session |
| materializr `LICENSE` full GPLv3 text | Header only captured (:1-40); full text present but not re-read |

---

## 11. Appendix — Key File Reference Index (materializr)

| File | Path | Relevance |
|---|---|---|
| README | `README.md:221-252` | Full dependency list |
| Root CMake | `CMakeLists.txt:1-619` | Build setup, OCCT toolkits, flags, platform branches |
| STEP export | `src/io/StepIO.cpp:453` | STEPControl_Writer/Reader, AP214 |
| STL export | `src/io/StlExport.cpp:8,430+` | StlAPI_Writer include, custom weld + binary/ASCII writer |
| glTF export | `src/io/GltfExport.cpp` | Custom binary GLB writer |
| OBJ export | `src/io/ObjExport.cpp` | Custom indexed OBJ writer |
| 3MF export | `src/io/ThreeMfExport.cpp` | Custom ZIP + XML 3MF writer |
| Mesh fallback | `src/core/MeshParams.h:637` | meshWithFallback tessellation |
| Font credits | `assets/fonts/FONT-CREDITS.md` | 10 fonts + Iconoir attributions |
| Font licenses | `assets/fonts/licenses/` | Per-font license texts |
| Binary size estimate | `docs/ipad-port-plan.md:135` | ~60–120 MB before dead-strip |
| Dockerfile | `Dockerfile` | OCCT 7.9.3 source build (ARG OCCT_TAG=V7_9_3) |
| vcpkg.json | `vcpkg.json` | pins opencascade 7.9.3 |
| LICENSE | `LICENSE` | GPLv3 (materializr — NOT adopted) |
| LICENSE-EXCEPTIONS | `LICENSE-EXCEPTIONS.md` | GPLv3 §7 additional permissions |
| OCCT LGPL | `https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/master/LICENSE_LGPL_21.txt` | LGPL 2.1 (26,434 bytes) |
| OCCT exception | `https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/master/OCCT_LGPL_EXCEPTION.txt` | Open CASCADE exception v1.0 (663 bytes) |

---

## 12. Appendix — Key File Reference Index (WebCad)

| File | Path | Relevance |
|---|---|---|
| Kernel strategy ADR | `docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md` | Approved architecture, authority model, error handling, LGPL section, "too heavy" thresholds |
| Epic | `docs/epics/WEBCAD-EPIC-EC-v5.md` | WC-EC-05 through WC-EC-40 ticket definitions |
| Font strategy | `docs/base/fix_svg2pdf_fonts_agent.md` | Arimo Apache 2.0, opentype.js SVG text-to-path |
| package.json | `package.json` | @bufbuild/protobuf ^2.17.0, @connectrpc/* ^2.3.0, @grpc/grpc-js ^1.14.7, opentype.js ^1.3.5, opencascade.js ^1.1.4 |
| Transport interface | `src/core/io/OCCTransport.ts` | Kernel transport contract (36+ ops) |
| RemoteGrpcTransport | `src/core/io/RemoteGrpcTransport.ts` | Browser→gateway Connect transport (unchanged) |
| Kernel client | `src/core/gateway/kernel-client.ts` | gRPC client for gateway→kernel |
| Mock kernel | `src/core/gateway/mock-kernel.ts` | Dev mock gRPC server |
| Proto | `proto/webcad/engine/v1/engine.proto`, `common.proto` | EngineGatewayService, KernelService, ExecuteRequest/Response, MeshData, BrepReference, ExecuteFailureCode |
| WASM worker | `src/core/io/OCCWorker.ts` | 250 OCCT-class matches; current OCCT API usage reference |

---

*End of spec. No code changes until this spec is approved.*