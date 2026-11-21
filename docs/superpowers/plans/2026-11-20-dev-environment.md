# Dev environment plan — kernel build speed (Phase B, item 5.7)

**Spec:** `docs/superpowers/specs/2026-11-20-kernel-build-speed-design.md`, section 5.7 "Dev environment"  
**Status:** Draft — waiting for human approval before rollout

This plan covers the developer-facing side of Phase B item 5.7:
1. A VS Code / GitHub Codespaces devcontainer (`.devcontainer/devcontainer.json`)
2. A one-command kernel verification script (`scripts/verify-kernel.sh`)
3. Sanitizer (asan/ubsan) builds and gdb/lldb debugging notes

## 1. Devcontainer — `.devcontainer/devcontainer.json`

| Field | Value |
|---|---|
| Base image | `mcr.microsoft.com/devcontainers/base:ubuntu-22.04` |
| Features | git, node (lts, for the TS side of the repo) |
| postCreateCommand | `bash .devcontainer/post-create.sh` |
| runArgs | `--cap-add=SYS_PTRACE` (required for gdb/lldb inside the container) |

### Toolchain installed by `post-create.sh`

- `build-essential` → gcc/g++
- `cmake`, `ninja-build`, `ccache`
- `lld` (system package, CMake fallback linker)
- `mold 2.3.3` (from GitHub release, best-effort; amd64/arm64; skipped if unavailable)
- `gdb`, `lldb`
- `libprotobuf-dev`, `protobuf-compiler`, `libgrpc-dev`, `protobuf-compiler-grpc` (provides `grpc_cpp_plugin`)

### VS Code customizations

Extensions: `ms-vscode.cpptools`, `ms-vscode.cmake-tools`, `ms-vscode.cpptools-extension-pack`, `ms-vscode.makefile-tools`.  
Settings: default compiler `/usr/bin/g++`, intelliSense mode `linux-gcc-x64`, build directory `${workspaceFolder}/build`, `.hxx`/`.cpp` treated as C++.

### OCCT — installed separately (by design)

OpenCASCADE 7.9.3 is NOT installed by the devcontainer. Two supported sources:

1. **From source** — build with `Dockerfile.kernel` stage 2 (OCCT 7.9.3, modules: FoundationClasses, ModelingData, ModelingAlgorithms, DataExchange; Presentation/Visualization/ViewerFramework/Draw OFF), install to `/usr/local`, then `ldconfig`. Kernel `CMakeLists.txt` expects libraries in `/usr/local/lib` and headers in `/usr/local/include` or `/usr/local/include/opencascade`.
2. **conda-forge `occt` (`novtk`, 7.9.3) via micromamba** — proposed default per spec section 5.1; provides headers and CMake config. Verify all needed toolkits are present: TKernel, TKMath, TKBRep, TKGeomBase, TKGeomAlgo, TKTopAlgo, TKPrim, TKBool, TKBO, TKFillet, TKOffset, TKShHealing, TKMesh, TKBin, TKDESTEP, TKDEIGES, TKXSBase.

After OCCT is installed, run:

```bash
./scripts/verify-kernel.sh
```

## 2. One-command kernel verify — `scripts/verify-kernel.sh`

```bash
# Default: dev preset, build/ directory
./scripts/verify-kernel.sh

# Explicit preset and build dir
./scripts/verify-kernel.sh ci build/ci
./scripts/verify-kernel.sh asan-ubsan build/asan-ubsan
```

What it does, in order:

1. **Configure** — `cmake --preset <preset>` (Ninja generator, ccache launcher, mold/lld linker as configured in `CMakePresets.json`).
2. **Build** — `cmake --build <build-dir> -j$(nproc)`, builds the `kernel_worker` target.
3. **Unit tests** — `ctest --output-on-failure`, but only if `CTestTestfile.cmake` exists; skipped with a message otherwise (the kernel CMakeLists.txt does not currently enable CTest).
4. **Parity subset via CLI** — echoes four JSON commands into `kernel-worker --cli` (JSON-over-stdio, no gRPC/gateway):
   - `health`
   - `create_box` (entity `box1`, 10×20×30)
   - `export_brep` (entity `box1`)
   - `step_export` (entity `box1`)

   Each response must contain `"ok": true`. `export_brep`/`step_export` exercise the shape cache, so a `create_box` failure cascades — that's intended.

Output example:

```
============================================================
 WebCAD kernel verification
============================================================
 Preset:   dev
 Build dir: build/dev
 Jobs:     8
------------------------------------------------------------
==> Step 1/4: cmake configure (preset dev, Ninja generator)
  [PASS] cmake configure (12.34 s)
==> Step 2/4: cmake build (kernel_worker, -j8)
  [PASS] cmake build (5.67 s)
  [PASS] kernel_worker binary present
==> Step 3/4: unit tests (ctest)
  [SKIP] no CTestTestfile.cmake ...
==> Step 4/4: parity subset via kernel-worker --cli (JSON-over-stdio)
  [PASS] cli health
  [PASS] cli create_box
  [PASS] cli export_brep
  [PASS] cli step_export
============================================================
 Kernel verification complete
------------------------------------------------------------
 Passed:   7/7
 Failed:   0
 Total time: 18.01 s
============================================================
RESULT: PASS
```

Exit code: 0 on PASS, non-zero on FAIL. Step logs are captured in `mktemp -d` and removed on exit; failure tails are printed to stderr.

## 3. Sanitizers (asan/ubsan)

Use the `asan-ubsan` CMake preset (already defined in `CMakePresets.json`):

```bash
./scripts/verify-kernel.sh asan-ubsan build/asan-ubsan
```

Preset flags: `-O0 -g -fsanitize=address,undefined -fno-omit-frame-pointer` for compile and link.

Notes:

- ASan needs `ASAN_OPTIONS=detect_leaks=0` if the kernel process is long-running (the gRPC server mode intentionally keeps the process alive); CLI mode exits promptly so leak reporting is fine.
- Sanitizers apply to the kernel TUs only. OCCT shared libraries are pre-built without sanitizers, so OCCT-internal UB won't be flagged — expected, not a script bug.
- If you run the sanitizer build under `kernel-worker --cli`, set `LD_PRELOAD` of the clang/LLVM sanitizer runtime only if you built with clang; with GCC, the `-fsanitize` link flags pull in the runtime automatically.

## 4. Debugging with gdb / lldb

The devcontainer runs with `--cap-add=SYS_PTRACE` so ptrace-based debuggers work inside the container.

### CLI mode (easiest)

```bash
gdb --args build/dev/kernel_worker --cli < commands.txt
(gdb) run
(gdb) bt        # on crash
```

Or step through a single command:

```bash
echo '{"op": "create_box", "x": 0, "y": 0, "z": 0, "dx": 10, "dy": 20, "dz": 30, "entity_id": "box1"}' | \
  gdb --args build/dev/kernel_worker --cli
(gdb) break OpCreateBox
(gdb) run
(gdb) ...
```

lldb equivalent:

```bash
lldb -- build/dev/kernel_worker --cli < commands.txt
(lldb) breakpoint set --name OpCreateBox
(lldb) run
```

### gRPC server mode

Start the worker, then attach:

```bash
build/dev/kernel_worker unix:///tmp/webcad-kernel.sock &   # or the gateway-managed socket
gdb -p $(pgrep kernel_worker)
```

### Tips

- Build the `dev` preset (`-O0 -g`) for debugging; `ci`/`release` are optimized and harder to step through.
- `cmake --preset dev` sets `CMAKE_CXX_FLAGS: -O0 -g -Wall -Wextra`.
- The devcontainer installs both `gdb` and `lldb`; pick whichever you prefer — commands above work for either.

## 5. Files

| File | Purpose |
|---|---|
| `.devcontainer/devcontainer.json` | Devcontainer definition (base image, features, VS Code customizations, postCreateCommand) |
| `.devcontainer/post-create.sh` | Post-create setup: apt toolchain, best-effort mold, version printout |
| `scripts/verify-kernel.sh` | One-command kernel verify: configure → build → ctest → CLI parity subset |
| `CMakePresets.json` | Existing: `dev`, `ci`, `release`, `asan-ubsan` presets (Ninja generator) |
| `CMakeLists.txt` | Existing: kernel build, OCCT toolkits, protobuf/gRPC codegen, mold/lld linker |

## 6. Verification

Run this plan's artifacts end-to-end in the devcontainer:

```bash
# 1. Container creation runs .devcontainer/post-create.sh automatically
# 2. Install OCCT 7.9.3 (from source or conda-forge) — see section 1
# 3. Verify the kernel
./scripts/verify-kernel.sh
# 4. Verify with sanitizers
./scripts/verify-kernel.sh asan-ubsan build/asan-ubsan
# 5. Debug a failing op
gdb --args build/dev/kernel_worker --cli < /path/to/commands.txt
```

Approvals needed before rollout: none beyond the design-spec sign-off in section "Stop Point" of the build speed spec — this plan implements only section 5.7, no protocol or ADR changes.
