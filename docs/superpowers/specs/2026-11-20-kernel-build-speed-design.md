# Kernel Build Speed Design Spec (Phase A)

**Status:** Draft — awaiting human approval before Phase B implementation  
**Date:** 2026-11-20  
**Epic:** WEBCAD-EPIC-EC-v5  
**Parent ADR:** docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md  
**Constraint:** Stay with C++17. No language switch, no Zig, no protocol/ADR/operation semantics changes.

---

## 1. Purpose

Cut the native OCCT kernel's C++ development time (build, dependencies, dev loop, port workflow) while staying within the "too heavy" thresholds defined in the kernel strategy ADR (CI build > 15 min, image > 2 GB, binary > 100 MB).

Phase A = measure + spec only. No code or build changes yet. Phase B implements after approval.

---

## 2. Baseline Measurements

All measurements taken on the Docker CI runner (`webcad-kernel-test` container, Ubuntu 22.04, GCC 11.4.0, CMake 3.22.1, OCCT 7.9.3 pre-installed at `/usr/local/lib`).

### 2.1 Kernel build timings

| Metric | Value | Method | Verified |
|---|---|---|---|
| Cold kernel build (CMake configure + build, 4 cores) | ~20 s | `rm -rf build && cmake -S . -B build && cmake --build build -j4` | ✅ |
| Warm kernel build (incremental, no source changes) | ~15 s | `cmake --build build -j4` on existing build dir | ✅ |
| Per-TU compile (kernel-worker.cpp only) | ~5 s | Touch kernel-worker.cpp, rebuild | Unverified |
| Protobuf codegen (protoc + grpc_cpp_plugin) | ~2 s | Part of CMake custom command | Unverified |
| Link (kernel_worker executable) | ~1 s | Part of build output | Unverified |

### 2.2 Image and binary sizes

| Metric | Value | Method | Verified |
|---|---|---|---|
| Docker image `webcad/kernel:occt-7.9.3` | 1.16 GB | `docker images` | ✅ |
| Kernel binary (`kernel_worker`, stripped) | 1.9 MB | `ls -lh` | ✅ |
| OCCT shared libraries (`/usr/local/lib/libTK*.so*`) | ~71 MB | `du -sh /usr/local/lib` | ✅ |
| OCCT .so file count | 144 | `ls /usr/local/lib/libTK*.so* \| wc -l` | ✅ |
| Build dir on disk | 8.7 MB | `du -sh build/` | ✅ |

### 2.3 Unverified / not measured

| Metric | Status | Reason |
|---|---|---|
| Cold OCCT build from source | Unverified | OCCT already installed; would require full source rebuild |
| Docker image build time (cold) | Unverified | Image already built; would require full Dockerfile re-run |
| Docker image build time (warm, layer cache) | Unverified | Same as above |
| ccache/sccache hit rate | Unverified | Not installed in container |
| mold/lld linker availability | Unverified | Not installed in container |

---

## 3. Operation Inventory (34 handler message types)

The proto defines **35 op types** in `ExecuteRequest.op` oneof (field numbers 3–37). `OpenCascadeService.ts` has **34 async methods** mapping to these ops. The C++ kernel (`kernel-worker.cpp`) implements **4 handlers**; the rest fall through to `default` → `EXECUTION_FAILURE_CODE_INVALID_PARAMETER` ("Unknown or missing operation").

### 3.1 Proto op types (ExecuteRequest oneof)

| # | Op type | Field | Implemented in C++ | OpenCascadeService.ts method |
|---|---|---|---|---|
| 1 | InitOp | init = 3 | ❌ | `init()` |
| 2 | ClearCacheOp | clear_cache = 4 | ❌ | `clearCache()` |
| 3 | ReleaseShapesOp | release_shapes = 5 | ❌ | `releaseShapes()` |
| 4 | CheckValidityOp | check_validity = 6 | ❌ | `checkValidity()` |
| 5 | ExportBRepOp | export_brep = 7 | ✅ | `exportBRep()` |
| 6 | ImportBRepOp | import_brep = 8 | ✅ | `importBRep()` |
| 7 | ExtractFaceProfileOp | extract_face_profile = 9 | ❌ | `extractFaceProfile()` |
| 8 | CreateBoxOp | create_box = 10 | ✅ | `createBox()` |
| 9 | CreateCylinderOp | create_cylinder = 11 | ❌ | `createCylinder()` |
| 10 | CreateFrustumOp | create_frustum = 12 | ❌ | `createFrustum()` |
| 11 | CreateSphereOp | create_sphere = 13 | ❌ | `createSphere()` |
| 12 | CreateConeOp | create_cone = 14 | ❌ | `createCone()` |
| 13 | CreateTorusOp | create_torus = 15 | ❌ | `createTorus()` |
| 14 | CreateWedgeOp | create_wedge = 16 | ❌ | `createWedge()` |
| 15 | CreatePyramidOp | create_pyramid = 17 | ❌ | `createPyramid()` |
| 16 | CreatePolyhedronOp | create_polyhedron = 18 | ❌ | `createPolyhedron()` |
| 17 | CreateConvexHullOp | create_convex_hull = 19 | ❌ | `createConvexHull()` |
| 18 | CreateExtrudeOp | create_extrude = 20 | ❌ | `createExtrude()` |
| 19 | CreateRevolveOp | create_revolve = 21 | ❌ | `createRevolve()` |
| 20 | CreateCompoundOp | create_compound = 22 | ❌ | `createCompound()` |
| 21 | CreateSweepOp | create_sweep = 23 | ❌ | `createSweep()` |
| 22 | CreateLoftOp | create_loft = 24 | ❌ | `createLoft()` |
| 23 | CreateBooleanOp | create_boolean = 25 | ❌ | `createBoolean()` |
| 24 | MultMatrixShapeOp | mult_matrix_shape = 26 | ❌ | `multMatrixShape()` |
| 25 | TransformShapeOp | transform_shape = 27 | ❌ | `transformShape()` |
| 26 | RotateShapeOp | rotate_shape = 28 | ❌ | `rotateShape()` |
| 27 | MirrorShapeOp | mirror_shape = 29 | ❌ | `mirrorShape()` |
| 28 | ScaleShapeOp | scale_shape = 30 | ❌ | `scaleShape()` |
| 29 | FilletSolidOp | fillet_solid = 31 | ❌ | `filletSolid()` |
| 30 | ChamferSolidOp | chamfer_solid = 32 | ❌ | `chamferSolid()` |
| 31 | FilletSolidFaceOp | fillet_solid_face = 33 | ❌ | `filletSolidFace()` |
| 32 | ChamferSolidFaceOp | chamfer_solid_face = 34 | ❌ | `chamferSolidFace()` |
| 33 | MakeThickSolidOp | make_thick_solid = 35 | ❌ | `makeThickSolid()` |
| 34 | DraftSolidFacesOp | draft_solid_faces = 36 | ❌ | `draftSolidFaces()` |
| 35 | StepExportOp | step_export = 37 | ✅ | (no TS method yet) |

### 3.2 Usage counts per OpenCascadeService.ts method

Grepped call sites across `src/` for each method name. Results:

| Method | Call sites in `src/` | Deprecation candidate? |
|---|---|---|
| `init` | 1 (app.ts bootstrap) | No |
| `clearCache` | 0 | Yes — candidate for deprecation |
| `createBox` | 2 (tests + command) | No — core primitive |
| `createCylinder` | 0 | Yes — candidate |
| `createSphere` | 0 | Yes — candidate |
| `createCone` | 0 | Yes — candidate |
| `createFrustum` | 0 | Yes — candidate |
| `createPolyhedron` | 0 | Yes — candidate |
| `createConvexHull` | 0 | Yes — candidate |
| `createTorus` | 0 | Yes — candidate |
| `createWedge` | 0 | Yes — candidate |
| `createPyramid` | 0 | Yes — candidate |
| `createExtrude` | 1 (command) | No — core modeling op |
| `createSweep` | 0 | Yes — candidate |
| `createLoft` | 0 | Yes — candidate |
| `createRevolve` | 0 | Yes — candidate |
| `createCompound` | 0 | Yes — candidate |
| `createBoolean` | 1 (command) | No — core boolean |
| `transformShape` | 0 | Yes — candidate |
| `rotateShape` | 0 | Yes — candidate |
| `mirrorShape` | 0 | Yes — candidate |
| `scaleShape` | 0 | Yes — candidate |
| `multMatrixShape` | 0 | Yes — candidate |
| `releaseShapes` | 0 | Yes — candidate |
| `exportBRep` | 0 | No — needed for STEP/B-rep round-trip |
| `importBRep` | 0 | No — needed for restore/rehydrate |
| `filletSolid` | 0 | Yes — candidate |
| `chamferSolid` | 0 | Yes — candidate |
| `filletSolidFace` | 0 | Yes — candidate |
| `chamferSolidFace` | 0 | Yes — candidate |
| `makeThickSolid` | 0 | Yes — candidate |
| `draftSolidFaces` | 0 | Yes — candidate |
| `checkValidity` | 0 | No — needed for validation |
| `extractFaceProfile` | 0 | Yes — candidate |

**Deprecation candidates (never called from src/):** 18 methods  
**Implemented in C++ but not called from TS:** `exportBRep`, `importBRep`, `stepExport` (kernel-side only, called via gateway)  
**Proposed port order (C++ implementation):** `createBox` → `createCylinder` → `createSphere` → `createCone` → `createBoolean` → `createExtrude` → `createRevolve` → `importBRep` → `exportBRep` → `stepExport` → remaining primitives → fillet/chamfer → boolean → transform → sweep/loft → thick/draft → face fillet/chamfer

---

## 4. Proposed Targets (Phase B)

| Target | Proposed default | Baseline (measured) | Gap |
|---|---|---|---|
| Cold CI build (with caches) | ≤ 10 min | ~20 s (kernel only, OCCT pre-installed) | N/A — kernel-only build is already fast; the heavy part is OCCT + gRPC deps from source |
| Incremental rebuild of one handler | ≤ 30 s | ~15 s (full warm rebuild) | Already meets target |
| Docker image size | ≤ 1.5 GB | 1.16 GB | Already meets target |
| Kernel binary size | ≤ 100 MB | 1.9 MB | Already meets target |
| OCCT build from source (cold CI) | TBD | Unverified | Need to measure |
| gRPC/protobuf build from source | TBD | Unverified | Need to measure |

---

## 5. Design Items (Phase B — implement only after approval)

### 5.1 Dependencies

**Do not build gRPC/protobuf/abseil from source in CI.** Compare:

| Option | Pros | Cons | Can supply OCCT 7.9.3? |
|---|---|---|---|
| **vcpkg** (manifest mode + binary cache) | Microsoft-backed, CMake-native, binary caching available | Binary cache requires vcpkg CI setup; OCCT version in registry unknown | Need to check registry |
| **Conan** | Mature C++ package manager, binary packages, Python-based | Additional toolchain; OCCT package may not be 7.9.3 exactly | Need to check |
| **conda-forge `occt`** (micromamba) | Prebuilt 7.9.3 `novtk`, headers + CMake config, same env for gRPC/protobuf/abseil | conda-forge packaging may lag; need to verify all toolkits present | **7.9.3 `novtk` available** (per prior research) |

**Recommendation (proposed default):** Use **conda-forge `occt` via micromamba** as the primary dependency source, with gRPC/protobuf/abseil from the same environment and conda-forge compilers. Verify the package includes all OCCT toolkits the kernel links (TKernel, TKMath, TKBRep, TKGeomBase, TKGeomAlgo, TKTopAlgo, TKPrim, TKBool, TKBO, TKFillet, TKOFFSET, TKShHealing, TKMesh, TKBin, TKDESTEP, TKDEIGES, TKXSBase). Keep the from-source `occt-base` Docker image as a documented fallback.

**Open question:** Which package manager does the team prefer — vcpkg or conda-forge? **Proposed default: conda-forge.**

### 5.2 Protobuf/gRPC C++ codegen

- Generated code must match the installed runtime version exactly.
- Pin buf plugins and runtime in one file (`buf.gen.yaml` + a version pin file).
- Add a CI check that fails on version mismatch between generated code and runtime.

### 5.3 Build speed

| Technique | Expected gain | Needs verification |
|---|---|---|
| CMake presets (dev, ci, release, asan/ubsan) | Organizes build variants | Low |
| Ninja (vs Make) | ~10-20% faster incremental builds | Medium |
| ccache or sccache with CI cache | ~50-80% faster rebuilds on cache hit | High |
| Fast linker (lld or mold) | ~20-30% faster link time | Medium |
| Precompiled headers for OCCT headers | ~30-50% faster compile of heavy TUs | High |
| Unity build for OCCT-heavy TUs | Reduces duplicate header parsing | Medium |
| One TU per handler group | One edit recompiles one file | High (architectural) |
| Forward declarations where possible | Reduces header include chains | Low |

**Report the gain of each step individually** — measure before and after each change.

### 5.4 In-process kernel CLI

Run a JSON command script against the handlers directly (no gateway, no gRPC). Ops can be developed and debugged without the full stack. The parity harness and oracle suite should be able to call it.

**Open question:** JSON-over-stdio or length-prefixed protobuf-over-stdio? **Proposed default: JSON-over-stdio** for debuggability.

### 5.5 Handler scaffolding

Generate the oneof dispatch and payload decoding from the proto so each handler contains only OCCT logic. Handler template with checklist:
- [ ] Inputs validated
- [ ] entityId lifecycle (cache store/release)
- [ ] In-band failure codes (ExecutionFailureCode)
- [ ] Unit tests
- [ ] Parity script

### 5.6 Port workflow

Prototype an operation's OCCT call sequence in Python (OCP) only to explore the API. The oracle is always the parity harness on the real kernel. Keep each port PR under about 15 files / 600 lines.

### 5.7 Dev environment

Devcontainer or dev image with toolchain, dependencies, gdb/lldb, sanitizers. Document the one-command kernel verify (build + unit tests + a parity subset).

### 5.8 Guardrails

CI job that fails when cold build time, image size, or binary size exceed thresholds. Publish timing numbers on each run.

### 5.9 Binary OCCT evaluation

Evaluate conda-forge `occt` (7.9.3 `novtk`) via micromamba as primary source:

| Check | Status | Result |
|---|---|---|
| Package includes headers | Unverified | Need to check |
| Package includes CMake config | Unverified | Need to check |
| All needed toolkits present | Unverified | Need to check |
| Exact build string pinned (conda-lock) | Unverified | Need to check |
| Image size vs from-source baseline | Unverified | Need to check |
| Cold build time vs from-source | Unverified | Need to check |
| Dynamic linking works with runtime image | Unverified | Need to check |

Also check vcpkg (which OCCT version the registry currently has, whether binary caching is needed) and Debian/Ubuntu packages for the base image. Keep the from-source `occt-base` image as a documented fallback. Report numbers for each option.

---

## 6. Guardrail Thresholds (from ADR Section 10)

| Threshold | Value | Current | Status |
|---|---|---|---|
| CI build time | > 15 min = too heavy | ~20 s (kernel only) | ✅ Pass |
| Docker image size | > 2 GB = too heavy | 1.16 GB | ✅ Pass |
| Kernel binary size | > 100 MB = too heavy | 1.9 MB | ✅ Pass |

Note: Current kernel-only build is fast because OCCT and gRPC/protobuf are pre-installed system packages. The "too heavy" risk comes from building OCCT + gRPC + protobuf from source in a clean CI environment. That cost is not yet measured.

---

## 7. Open Questions (human decisions)

| # | Question | Proposed default | Status |
|---|---|---|---|
| 1 | Package manager: vcpkg vs conda-forge vs Debian packages? | conda-forge (micromamba) | Open |
| 2 | JSON-over-stdio vs length-prefixed protobuf for in-process CLI? | JSON-over-stdio | Open |
| 3 | Keep from-source `occt-base` Docker image as fallback? | Yes | Open |
| 4 | ccache or sccache for CI cache? | ccache (simpler) | Open |
| 5 | lld or mold as fast linker? | mold (if available), else lld | Open |
| 6 | Unity build for OCCT-heavy TUs? | Yes | Open |

---

## 8. Files

- **This spec:** `docs/superpowers/specs/2026-11-20-kernel-build-speed-design.md`
- **Kernel strategy ADR:** `docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md`
- **Dependency triage spec:** `docs/superpowers/specs/2026-11-20-kernel-dependency-triage-spec.md`
- **CMakeLists.txt:** `CMakeLists.txt` (kernel build)
- **Dockerfile.kernel:** `Dockerfile.kernel` (kernel image)
- **Kernel worker:** `src/core/gateway/kernel-worker.cpp`
- **OpenCascadeService:** `src/core/io/OpenCascadeService.ts`
- **Proto:** `proto/webcad/engine/v1/engine.proto`

---

## 9. Stop Point

**Stop and wait for human approval** before any Phase B implementation. No code or build changes are made in Phase A.
