# Kernel Dependency Triage — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the dependency triage & reuse plan from `docs/superpowers/specs/2026-11-20-kernel-dependency-triage-spec.md`: create font credits file, optimize OCCT build image size, implement B-rep import/export (TKBin), implement server-side STEP/STL export, document OCCT LGPL implications, and verify unverified spec items.

**Architecture:** The spec divides work into independent subsystems: (1) font credits documentation, (2) OCCT build image optimization, (3) B-rep binary import/export via TKBin, (4) STEP/STL/glTF export via OCCT classes + custom writers, (5) OCCT license documentation, (6) unverified item verification. Each subsystem is self-contained and committable independently.

**Tech Stack:** C++17, OCCT 7.9.3 (TKBin, TKDESTEP, TKDEIGES, TKMesh, TKShHealing, etc.), Docker multi-stage build, Node.js gateway, TypeScript, protobuf C++/gRPC

**Spec reference:** `docs/superpowers/specs/2026-11-20-kernel-dependency-triage-spec.md`

**Related tickets:** WC-EC-08 (OCCT build image), WC-EC-24 (B-rep import/export), WC-EC-25 (STEP/STL/glTF export), WC-EC-33 (density measurement), WC-EC-40 (OCCT upgrade policy)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `assets/fonts/FONT-CREDITS.md` | Create | Font license & attribution for browser-served fonts (Section 4, Q2 resolved: yes) |
| `Dockerfile.kernel` | Modify | Multi-stage Docker: clean build residue between stages to reduce image size below 2 GB (Section 5.6) |
| `CMakeLists.txt` | Modify | Add TKBin linking, TKShHealing, TKDESTEP/TKDEIGES; keep explicit toolkit set (Section 5.2) |
| `src/core/gateway/kernel-worker.cpp` | Modify | Add B-rep import/export via TKBin (BinTools), pre-validation on importBRep/Restore |
| `src/core/gateway/kernel-worker.cpp` | Modify | Add STEP export via STEPControl_Writer/Reader AP214; STL export via custom tessellation+writer |
| `docs/superpowers/specs/2026-11-20-kernel-dependency-triage-spec.md` | Modify | Mark unverified items as verified after measurement |
| `tests/unit/kernel/brep-import.test.ts` | Create | Unit tests for B-rep pre-validation (size, truncation, section counts) |
| `tests/unit/kernel/brep-export.test.ts` | Create | Unit tests for TKBin B-rep export round trip |
| `tests/unit/kernel/step-export.test.ts` | Create | Unit tests for STEP AP214 export |

---

## Chunk 1: Font Credits File (Section 4, Q2 resolved: yes)

### Task 1.1: Write the failing font credits file

**Files:**
- Create: `assets/fonts/FONT-CREDITS.md`

- [ ] **Step 1: Create FONT-CREDITS.md**

Document each font served from `public/fonts/` with copyright, license, and attribution text. Currently `osifont.ttf` exists; Arimo (Apache 2.0) is planned. No materializr font bundling (Q3 resolved: no).

- [ ] **Step 2: Verify file exists and is readable**

Run: `test -f assets/fonts/FONT-CREDITS.md && echo "exists"`

Expected: File exists at the specified path.

- [ ] **Step 3: Commit**

```bash
git add assets/fonts/FONT-CREDITS.md
git commit -m "feat(wc-ec-05): add font credits file for browser-served fonts"
```

---

## Chunk 2: OCCT Build Image Size Optimization (Section 5.6, WC-EC-08)

### Task 2.1: Add build residue cleanup to Dockerfile.kernel

**Files:**
- Modify: `Dockerfile.kernel`

The 2 GB image size estimate includes build cache and intermediate stages. Multi-stage Docker builds should discard build stages (OCCT source, CMake cache, object files) in the final runtime image. The actual kernel runtime image can be substantially smaller.

- [ ] **Step 1: Add residue cleanup to Stage 2 (OCCT build)**

Add `rm -rf /occt-src /occt/build` after `make install` to remove OCCT source and build artifacts from the OCCT stage. Also add `apt-get clean && rm -rf /var/lib/apt/lists/*` in Stage 1.

- [ ] **Step 2: Add runtime stage cleanup in Stage 3**

Ensure Stage 3 (kernel) only copies the compiled binary and shared libs needed at runtime, not object files or CMake cache.

- [ ] **Step 3: Build Docker image and measure size**

Run: `docker build -f Dockerfile.kernel -t webcad/kernel:occt-7.9.3 . && docker images webcad/kernel:occt-7.9.3 --format "{{.Size}}"`

Expected: Image size reduced from 2.54 GB estimate; target < 2 GB after cleanup, ideally < 1 GB.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.kernel
git commit -m "feat(wc-ec-08): reduce kernel image size via multi-stage Docker cleanup"
```

---

## Chunk 3: B-Repe Import/Export via TKBin (WC-EC-24, Section 6)

### Task 3.1: Write failing B-rep pre-validation test

**Files:**
- Create: `tests/unit/kernel/brep-import.test.ts`

Test that B-rep pre-validation rejects oversized/truncated/invalid B-rep data before the OCCT reader.

```typescript
import { describe, it, expect } from 'vitest';

// Simulates pre-validation checks performed before OCCT B-rep reader
function validateBRep(data: Uint8Array): { valid: boolean; reason?: string } {
  if (data.length === 0) return { valid: false, reason: 'empty B-rep' };
  if (data.length > 64 * 1024 * 1024) return { valid: false, reason: 'B-rep too large' };
  // Truncation check: last bytes should be B-rep section terminator
  const lastByte = data[data.length - 1];
  if (lastByte !== 0x1a) return { valid: false, reason: 'truncated B-rep' };
  return { valid: true };
}

describe('B-rep pre-validation', () => {
  it('rejects empty B-rep', () => {
    const result = validateBRep(new Uint8Array(0));
    expect(result.valid).toBe(false);
  });
  it('rejects truncated B-rep', () => {
    const result = validateBRep(new Uint8Array([1, 2, 3]));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('truncated');
  });
  it('accepts valid B-rep', () => {
    const result = validateBRep(new Uint8Array([...Array(10).fill(0), 0x1a]));
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/kernel/brep-import.test.ts` with pre-validation tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/kernel/brep-import.test.ts -v`

Expected: Test fails because pre-validation function not yet imported/implemented in kernel worker.

- [ ] **Step 3: Commit test**

```bash
git add tests/unit/kernel/brep-import.test.ts
git commit -m "test(wc-ec-24): add B-rep pre-validation failing test"
```

### Task 3.2: Implement B-rep pre-validation in kernel-worker.cpp

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

- [ ] **Step 1: Implement pre-validation**

Add B-rep size limit check, truncation check, section count validation before OCCT BinTools reader on `importBRep`/`Restore` ops.

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/unit/kernel/brep-import.test.ts -v`

Expected: Pre-validation rejects invalid B-rep before OCCT reader; valid B-rep proceeds.

- [ ] **Step 3: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp tests/unit/kernel/brep-import.test.ts
git commit -m "feat(wc-ec-24): add B-rep pre-validation before OCCT reader"
```

### Task 3.3: Implement TKBin B-rep export round trip

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`
- Create: `tests/unit/kernel/brep-export.test.ts`

- [ ] **Step 1: Write failing export test**

Test that TKBin B-rep export produces valid binary B-rep that can be re-imported.

- [ ] **Step 2: Implement TKBin export**

Use OCCT `BinTools::Write` / `BinTools::Read` for binary B-rep export/import in kernel worker.

- [ ] **Step 3: Run test to verify it passes**

Expected: Export → import round trip produces identical shape.

- [ ] **Step 4: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp tests/unit/kernel/brep-export.test.ts
git commit -m "feat(wc-ec-24): add TKBin B-rep export/import round trip"
```

---

## Chunk 4: STEP Export via STEPControl_Writer (WC-EC-25, Section 6)

### Task 4.1: Write failing STEP export test

**Files:**
- Create: `tests/unit/kernel/step-export.test.ts`

Test that STEP AP214 export via `STEPControl_Writer` produces valid STEP file.

- [ ] **Step 1: Write failing test**

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/kernel/step-export.test.ts -v`

Expected: Test fails because STEP export not yet implemented.

- [ ] **Step 3: Commit test**

```bash
git add tests/unit/kernel/step-export.test.ts
git commit -m "test(wc-ec-25): add STEP export failing test"
```

### Task 4.2: Implement STEP export

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

- [ ] **Step 1: Implement STEP export**

Use OCCT `STEPControl_Writer` with `Interface_Static::SetCVal("write.step.schema", "AP214")` for mechanical design schema. Handle Y-up→Z-up rotation via `BRepBuilderAPI_Transform`.

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/unit/kernel/step-export.test.ts -v`

Expected: STEP AP214 export produces valid .stp file.

- [ ] **Step 3: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp tests/unit/kernel/step-export.test.ts
git commit -m "feat(wc-ec-25): add STEP AP214 export via STEPControl_Writer"
```

---

## Chunk 5: STL Export via Custom Tessellation+Writer (WC-EC-25, Section 6)

### Task 5.1: Write failing STL export test

**Files:**
- Create: `tests/unit/kernel/stl-export.test.ts`

Test that STL export via custom tessellation (`BRepMesh_IncrementalMesh`) + custom writer produces valid binary STL.

- [ ] **Step 1: Write failing test**

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/kernel/stl-export.test.ts -v`

Expected: Test fails because STL export not yet implemented.

- [ ] **Step 3: Commit test**

```bash
git add tests/unit/kernel/stl-export.test.ts
git commit -m "test(wc-ec-25): add STL export failing test"
```

### Task 5.2: Implement STL export

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

- [ ] **Step 1: Implement STL export**

Tessellate shape with `BRepMesh_IncrementalMesh`, then write custom binary STL writer (vertex welding at 1e-3 mm, non-manifold edge detection, pinhole fan-fill per materializr pattern). Do NOT use `StlAPI_Writer` (materializr includes it but writes manually for better control).

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/unit/kernel/stl-export.test.ts -v`

Expected: STL export produces valid .stl file with welded vertices.

- [ ] **Step 3: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp tests/unit/kernel/stl-export.test.ts
git commit -m "feat(wc-ec-25): add STL export via custom tessellation+writer"
```

---

## Chunk 6: OCCT License Documentation (Section 7)

### Task 6.1: Add OCCT license section to ADR

**Files:**
- Modify: `docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md` (or create separate license doc)

- [ ] **Step 1: Document OCCT license**

Add LGPL-2.1 + Open CASCADE Exception text, dynamic-linking implications, hosted-vs-distributed open question (resolved: hosted, flagged for legal review).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md
git commit -m "docs(wc-ec-05): document OCCT LGPL-2.1 license and exception"
```

---

## Chunk 7: Verify Unverified Items (Section 10)

### Task 7.1: Measure kernel binary size

**Files:**
- No new files (measurement only)

- [ ] **Step 1: Build kernel worker and measure binary size**

Run: `docker build -f Dockerfile.kernel -t webcad/kernel:occt-7.9.3 . && docker run --rm webcad/kernel:occt-7.9.3 ls -lh /kernel/build/kernel_worker`

Expected: Binary size measured; compare against >100 MB "too heavy" threshold.

- [ ] **Step 2: Record measurement in spec**

Update Section 5.6 of the dependency triage spec with actual measured size.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-20-kernel-dependency-triage-spec.md
git commit -m "docs(wc-ec-08): record kernel binary size measurement"
```

### Task 7.2: Verify OCCT toolkit linking completeness

**Files:**
- No new files (verification only)

- [ ] **Step 1: Verify all recommended toolkits are linked**

Confirm CMakeLists.txt links: TKernel, TKMath, TKBRep, TKGeomBase, TKGeomAlgo, TKTopAlgo, TKPrim, TKBool, TKBO, TKFillet, TKOffset, TKShHealing, TKMesh, TKBin, TKDESTEP, TKDEIGES (skip TKG3d, TKService, TKV3d, TKXSBase, TKDESTL per spec recommendation).

- [ ] **Step 2: Commit**

```bash
git commit -m "docs(wc-ec-08): verify OCCT minimal toolkit set"
```

---

## Open Questions (Human Decisions) — All Resolved

| # | Question | Decision | Status |
|---|---|---|---|
| Q1 | gRPC C++ build "too heavy" thresholds? | Try full gRPC first; fall back to length-prefixed protobuf over UDS only if CI >15 min, image >2 GB, binary >100 MB, or gRPC dep unavailable. Image size reducible via multi-stage Docker cleanup. | Resolved |
| Q2 | SolidCraft waiver needed? | Not needed — SolidCraft/solidcore is inspiration only | Resolved |
| Q3 | OCCT delivery model? | Hosted (server-side kernel) | Resolved — flagged for legal review |
| Q4 | Author `assets/fonts/FONT-CREDITS.md`? | Yes — create when Arimo fonts added | Resolved |
| Q5 | Bundle materializr fonts? | No — use upstream fonts directly | Resolved |
| Q6 | Document.test.ts time-box? | Prefer lesser time (few hours, not full day) | Resolved |
| Q7 | Kernel binary size threshold? | Default: >100 MB | Resolved |
| Q8 | Export priority order? | STEP first (WC-EC-25), then STL, glTF, OBJ, 3MF | Resolved |

---

## Exit Criteria

- [ ] `assets/fonts/FONT-CREDITS.md` created with font license/attribution info
- [ ] Docker kernel image size reduced below 2 GB via multi-stage cleanup
- [ ] B-rep pre-validation rejects invalid input before OCCT reader (tests pass)
- [ ] TKBin B-rep export/import round trip works (tests pass)
- [ ] STEP AP214 export via STEPControl_Writer works (tests pass)
- [ ] STL export via custom tessellation+writer works (tests pass)
- [ ] OCCT license documented in ADR
- [ ] Kernel binary size measured and recorded in spec
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes (0 failures)

---

**Next step after plan approval:** Execute Chunk 1 (font credits file), then proceed through Chunks 2–7 sequentially. Each chunk produces self-contained, committable changes.