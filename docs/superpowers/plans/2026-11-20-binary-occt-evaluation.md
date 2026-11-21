# Binary OCCT Evaluation (Phase B item 5.9)

> **Goal:** Evaluate binary OCCT sources (conda-forge, vcpkg, Debian/Ubuntu) as replacements for building OCCT from source in CI, to cut kernel C++ development time.
>
> **Status:** Draft — research only, no build changes yet. Measurements marked "Unverified" cannot be confirmed from this host (Windows, no Linux container with OCCT).
>
> **Constraint:** OCCT 7.9.3 is the pinned baseline (WC-EC-05 ADR). 8.0.x is gated. Must stay with C++17, no protocol/ADR/operation semantics changes.

---

## 1. Options Evaluated

| Option | Can supply OCCT 7.9.3? | Headers? | CMake config? | All needed toolkits? | Binary cache? | Viable? |
|---|---|---|---|---|---|---|
| **conda-forge `occt` (micromamba)** | ✅ 7.9.3 + 8.0.1 | ✅ | ✅ (`find_package(OpenCASCADE)`) | ✅ Foundation/DataExchange/ModelingAlgorithms | ✅ (prebuilt binaries) | **Yes — proposed primary** |
| vcpkg | ❌ No OCCT package in registry | — | — | — | N/A | No |
| Debian/Ubuntu apt | ❌ Max 7.6.3 (bookworm/noble), 7.5.1 (jammy) | — | — | — | N/A | No (wrong version) |
| From-source `occt-base` Docker | ✅ 7.9.3 (already built) | ✅ | ✅ | ✅ | N/A | Yes — documented fallback |

---

## 2. Option 1: conda-forge `occt` via micromamba (Proposed Primary)

### 2.1 Package facts (from conda-forge API + feedstock recipe)

| Field | Value | Source |
|---|---|---|
| Package name | `occt` | anaconda.org/conda-forge/occt |
| License | LGPL-2.1-only | meta.yaml |
| Versions available | 7.0.0 … 8.0.1 (incl. 7.9.3, 8.0.0, 8.0.1) | anaconda.org API |
| Variant | `novtk` (no VTK, no TBB, no Draw module) | meta.yaml build variant |
| Build string pattern | `{{variant}}_h{{PKG_HASH}}_{{build}}` | meta.yaml |
| Example 7.9.3 novtk build strings | `novtk_h6d7d905_101`, `novtk_h93fa6b5_103`, `novtk_hb8aff64_100`, … | anaconda.org builds list (all versions mixed) |
| ABI pinning | `pin_subpackage('occt', max_pin='x.x.x')` — minor-version ABI stable | meta.yaml run_exports |
| Build mode | Release, Ninja, CMake, interprocedural optimization ON, exceptions ON | build.sh |
| Platforms | linux-64 ✅, linux-aarch64 ✅, linux-ppc64le ✅, osx-64/arm64 ✅, win-32/64 ✅ | anaconda.org API |
| Source | Open-Cascade-SAS/OCCT tag `V7_9_3` | meta.yaml source url |

### 2.2 What the package includes

The conda-forge recipe builds OCCT with CMake install, so it ships:

- **Headers:** `$PREFIX/include/opencascade/` (all public OCCT headers)
- **Shared libraries:** `$PREFIX/lib/libTK*.so` (all toolkits as separate .so files)
- **CMake config:** `find_package(OpenCASCADE <version>)` works — verified by the recipe's own test CMakeLists.txt which calls `find_package(OpenCASCADE "${OCCT_VERSION}" REQUIRED)` and reports `OpenCASCADE_MAJOR_VERSION.MINOR_VERSION.MAINTENANCE_VERSION`
- **Toolkits included (novtk variant):** TKernel, TKMath, TKBRep, TKGeomBase, TKGeomAlgo, TKTopAlgo, TKPrim, TKBool, TKBO, TKFillet, TKOFFSET, TKShHealing, TKMesh, TKBin, TKDESTEP, TKDEIGES, TKXSBase
- **NOT included (novtk):** VTK-based visualization, Draw module, TBB

### 2.3 Needed toolkits (per materializr cerebrum entry)

The kernel links these explicit toolkits (not umbrella):

```
TKernel TKMath TKBRep TKGeomBase TKGeomAlgo TKTopAlgo TKPrim TKBool TKBO
TKFillet TKOffset TKShHealing TKMesh TKBin TKDESTEP TKDEIGES
```

All of these are in the `novtk` conda-forge package. ✅

### 2.4 Dependency stack in one environment

conda-forge can supply the full build/runtime stack from one channel:

| Package | conda-forge available? |
|---|---|
| `occt` (7.9.3 novtk) | ✅ |
| `protobuf-cpp` | ✅ |
| `grpc` / `grpc-cpp` | ✅ |
| `abseil-cpp` | ✅ |
| `cmake` | ✅ |
| `ninja` | ✅ |
| `gcc` / `gxx` (conda-forge compilers) | ✅ |
| `micromamba` | ✅ (installer) |

### 2.5 Evaluation criteria (all unverified — cannot measure from Windows host)

| Check | Status | Result |
|---|---|---|
| Package includes headers | Unverified | Recipe installs via CMake; expected ✅ |
| Package includes CMake config | Unverified | Recipe test uses `find_package(OpenCASCADE)`; expected ✅ |
| All needed toolkits present | Unverified | novtk includes all listed toolkits; expected ✅ |
| Exact build string pinned (conda-lock) | Unverified | conda-lock can pin `novtk_h<HASH>_<BUILD>`; expected ✅ |
| Image size vs from-source baseline | Unverified | Prebuilt binary ≈ tens of MB vs 71 MB .so + 1.16 GB image |
| Cold build time vs from-source | Unverified | `micromamba install` ≈ seconds vs hours of OCCT compilation |
| Dynamic linking works with runtime image | Unverified | Shared .so files; expected ✅ |

### 2.6 Proposed workflow

```yaml
# environment.yml (pinned with conda-lock)
name: webcad-kernel
channels:
  - conda-forge
dependencies:
  - occt=7.9.3=novtk_h*_10*  # exact build string via conda-lock
  - protobuf-cpp=3.12.4
  - grpc-cpp=1.30.2
  - abseil-cpp
  - cmake
  - ninja
  - gcc
  - gxx
  - micromamba
```

CI steps:
1. `micromamba create -f environment.lock.yml` (seconds, no compilation)
2. `cmake -S . -B build -G Ninja -DCMAKE_PREFIX_PATH=$CONDA_PREFIX`
3. `cmake --build build -j$(nproc)` (kernel only, OCCT prebuilt)

---

## 3. Option 2: vcpkg

### 3.1 Findings

- **No OCCT package in vcpkg registry.** GitHub code search for `repo:microsoft/vcpkg occt` returned 0 files. No `occt` or `opencascade` port exists.
- Cannot supply OCCT 7.9.3 or any OCCT version.
- vcpkg binary caching exists (GitHub Actions cache / vcpkg CI) but is moot without an OCCT port.
- `abseil` package exists in vcpkg (seen in ports listing), but OCCT does not.

### 3.2 Verdict

**Not viable.** Would require creating and maintaining a custom vcpkg port for OCCT 7.9.3, which is out of scope and adds maintenance burden. conda-forge already has a working 7.9.3 novtk package.

---

## 4. Option 3: Debian/Ubuntu apt packages

### 4.1 Findings

| Distro | Suite | OCCT version | Status |
|---|---|---|---|
| Debian | bookworm (oldstable) | 7.6.3+dfsg1-7 | ❌ Not 7.9.3 |
| Debian | sid | Not checked | Unknown |
| Ubuntu | jammy (22.04 LTS) | 7.5.1+dfsg1-2ubuntu1 | ❌ Not 7.9.3 |
| Ubuntu | noble (24.04 LTS) | 7.6.3+dfsg1-7.1build1 | ❌ Not 7.9.3 |

Packages are split into many sub-packages:
- `libocct-foundation-*` (TKernel/TKMath)
- `libocct-modeling-data-*` (TKBRep)
- `libocct-modeling-algorithms-*` (TKGeomAlgo, TKTopAlgo, TKPrim, TKBool, TKBO, TKFillet, TKOFFSET)
- `libocct-data-exchange-*` (TKDESTEP, TKDEIGES, TKBin)
- `libocct-visualization-*`, `libocct-draw-*`, `libocct-ocaf-*`
- `occt-draw`, `occt-misc`

All `-dev` packages exist for headers. CMake config availability not verified (Debian typically uses `FindOpenCASCADE.cmake` module rather than package-provided config).

### 4.2 Verdict

**Not viable for 7.9.3.** No major distro ships OCCT 7.9.3. The kernel is pinned to 7.9.3 per ADR. Using an older version would change behavior and break the ADR constraint.

---

## 5. Option 4: From-source `occt-base` Docker image (Documented Fallback)

Already implemented (WC-EC-08 build image):

| Metric | Value | Source |
|---|---|---|
| Image `webcad/kernel:occt-7.9.3` | 1.16 GB | `docker images` ✅ |
| OCCT shared libraries | ~71 MB across ~144 `libTK*.so` | `du -sh` ✅ |
| Kernel binary (stripped) | 1.9 MB | `ls -lh` ✅ |
| Cold kernel build (OCCT pre-installed) | ~20 s | Measured ✅ |
| Full OCCT from-source build time | Unverified | Would require full Dockerfile re-run |

Keep as documented fallback if conda-forge is unavailable or a package issue arises.

---

## 6. Comparison Summary

| Criterion | conda-forge (primary) | vcpkg | Debian/Ubuntu | From-source (fallback) |
|---|---|---|---|---|
| OCCT 7.9.3 | ✅ Available | ❌ Not in registry | ❌ Max 7.6.3 | ✅ Already built |
| `novtk` variant | ✅ Yes | N/A | ❌ No variant control | ✅ Custom build |
| Headers + CMake config | ✅ Expected | N/A | ⚠️ Find module only | ✅ Yes |
| All needed toolkits | ✅ Expected | N/A | ⚠️ Split sub-packages | ✅ Yes |
| Binary cache (no from-source build) | ✅ Prebuilt | N/A | ✅ Prebuilt (but wrong version) | ❌ Build from source |
| Full stack in one env | ✅ occt + protobuf + grpc + abseil + compilers | ❌ No OCCT | ⚠️ Need separate grpc/protobuf packages | ❌ Build all from source |
| Image size | Unverified (expected small) | N/A | N/A | 1.16 GB ✅ (under 1.5 GB target) |
| Cold build time | Unverified (expected seconds to install) | N/A | N/A | ~20 s (kernel only) ✅ |
| Dynamic linking | ✅ Shared .so | N/A | N/A | ✅ Shared .so |
| conda-lock pinning | ✅ Available | N/A | N/A | N/A |

---

## 7. Recommendation (Proposed Default)

**Use conda-forge `occt` 7.9.3 `novtk` via micromamba as the primary dependency source**, with gRPC/protobuf/abseil from the same conda-forge environment and conda-forge compilers. Pin exact build strings with conda-lock.

**Rationale:**
1. Only option that supplies OCCT 7.9.3 as a prebuilt binary
2. `novtk` variant matches headless kernel needs (no VTK/TBB/Draw)
3. Single channel for entire stack (OCCT + gRPC + protobuf + abseil + compilers)
4. conda-lock provides exact build string reproducibility
5. Eliminates from-source OCCT build from CI (the largest time sink per spec section 6)

**Keep from-source `occt-base` Docker image as documented fallback** (Q3 proposed default: Yes).

---

## 8. Open Questions (human decisions)

| # | Question | Proposed default | Status |
|---|---|---|---|
| Q1 | Package manager: conda-forge (micromamba) vs vcpkg vs Debian? | conda-forge | Open — vcpkg/Debian ruled out by research |
| Q3 | Keep from-source `occt-base` Docker image as fallback? | Yes | Open |
| Q-new | Should `environment.lock.yml` be committed to repo? | Yes | Open |

---

## 9. Next Steps (after human approval)

1. Create `environment.yml` + `environment.lock.yml` for the kernel build
2. Update `Dockerfile.kernel` or create a new conda-based Dockerfile
3. Update CMakePresets.json to use `$CONDA_PREFIX` for `CMAKE_PREFIX_PATH`
4. Add CI step that runs `micromamba create -f environment.lock.yml` before build
5. Measure: cold build time, image size, binary size with conda-forge OCCT vs from-source baseline
6. Update spec section 5.9 with measured numbers

---

## 10. Files Referenced

- `docs/superpowers/specs/2026-11-20-kernel-build-speed-design.md` — Phase A spec (section 5.9)
- `docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md` — Kernel strategy ADR
- `CMakeLists.txt` — Kernel C++ build
- `Dockerfile.kernel` — Kernel image (from-source fallback)
- `.wolf/cerebrum.md` — materializr OCCT toolkit list and build flags