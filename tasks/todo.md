# WC-EC-15: Port Polyhedron and Convex Hull to Native OCCT Kernel

## Plan
- [x] 1. Update `proto/webcad/engine/v1/engine.proto` (ADR 004: add `PolyhedronFace` and `repeated PolyhedronFace faces = 5` in `CreatePolyhedronOp`)
- [x] 2. Run protobuf generation (`npm run buf:generate` via rtk)
- [x] 3. Implement C++ `computeConvexHull3D`, `OpCreatePolyhedron`, `OpCreateConvexHull`, and CLI parsing in `src/core/gateway/kernel-worker.cpp`
- [x] 4. Wire gRPC handlers `HandleCreatePolyhedron` and `HandleCreateConvexHull` in `kernel-worker.cpp`
- [x] 5. Recompile `kernel_worker` in Docker container (`ninja -C /kernel/build kernel_worker`), swap binary, and restart container
- [x] 6. Update `NativeKernelAdapter` (`opMap` and parameter normalization) in `src/core/harness/native-kernel-adapter.ts`
- [x] 7. Add reference parts fixtures (`tetrahedron.json`, `cube_from_hull.json`, `irregular_polyhedron.json`) in `tests/fixtures/oracle/`
- [x] 8. Verify with `rtk vitest run tests/oracle tests/harness` and `rtk tsc --noEmit`
- [x] 9. Update `docs/epics/WEBCAD-EPIC-EC-v5.md` to mark WC-EC-15 tasks complete

## Review
- Fixed the convex hull orientation and horizon edge bug in `computeConvexHull3D` in `src/core/gateway/kernel-worker.cpp`.
  - Used centroid of initial tetrahedron as interior reference point (`center`).
  - Face orientation checks ensure `center` is behind the plane (`getSignedDistance(plane, center) <= 0`).
  - Edge counting map with `"v1-v2"` and `"v2-v1"` detects horizon edges properly (`count == 1`).
- Recompiled `kernel_worker` via Ninja in `webcad-kernel-test` container and atomically swapped binary.
- Verified:
  - `cube_from_hull` passes: Volume = 1000.0, Surface Area = 600.0, Faces = 12, Edges = 18, Vertices = 8.
  - `native-oracle.integration.test.ts` passes: all 7/7 reference parts pass against live kernel.
  - All 45 tests in `tests/oracle` and `tests/harness` pass (0 failures).
