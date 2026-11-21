# WC-EC-24 — B-rep Import/Export and Cross-Version Compatibility Design

**Status:** Proposed  
**Epic:** WC-EC  
**Ticket:** WC-EC-24  
**Priority:** high  
**Agent:** B  
**Depends on:** WC-EC-10  
**Part A dependency:** P0-WEBCAD-KERNEL-CREATE_BOX (create_box failure in OCCT 7.9.3 — see `doc/results/kernel_create_box_findings.md`)

---

## Goal

Complete the remaining WC-EC-24 tasks: explicit format selection for B-rep import/export, content hashing of B-rep for caching/revisions, pre-validation of B-rep input before it reaches the OCCT reader, real fuzzing of the importer, and cross-version round-trip tests (WASM text/STEP ↔ OCCT 7.9.3 binary/text/STEP). Cross-version fixtures are committed and automated; manual steps are only for regenerating fixtures.

---

## Current State

### Kernel (`kernel-worker.cpp`)
- `OpImportBRep` — validates empty input (≤64 MB, ends with 0x1a byte), reads via `BinTools::Read`, caches shape, returns `OpResult` with `shapeId`. No `hash` field yet.
- `OpExportBRep` — looks up cached shape, writes via `BinTools::Write` (binary only), returns binary B-rep data. No `hash` field yet.
- Both already have size and truncation checks.
- Dispatcher handles 33 of 35 operations; unported ops (`check_validity` field 6, `create_loft` field 24) return `INVALID_PARAMETER`.

### WASM Worker (`OCCWorker.ts`)
- `exportShapeToNativeBRep` — BinTools → BRepTools (text) → STEP fallback
- `importShapeFromNativeBRep` — BinTools → BRepTools → STEP fallback
- No BinTools support in opencascade.js 1.1.4; export is text B-rep or STEP fallback.

### Missing
- Content hash not computed or returned
- No explicit `format` field on import/export ops; format inferred from trailing 0x1a byte
- No fuzz tests for malformed input
- Pre-validation limited to size + trailing byte; no header/magic or section-count checks
- No cross-version fixtures committed
- No kernel health smoke test

---

## Design

### 1. Format Selection (replaces "BREP" magic + trailing-0x1a)

Replace the "BREP" magic and trailing-0x1a rules with an explicit `format` field on the import/export operations.

- `OpImportBRep` takes an explicit `format` field: `binary | text | step`.
- `OpExportBRep` takes an optional `format` field (default `binary`): `binary | text | step`.
- Format verification per format (version-tolerant, CRLF-tolerant prefix patterns):

| Format | Prefix pattern (regex, case-insensitive, CRLF-tolerant) | Source |
|--------|--------------------------------------------------------|--------|
| `binary` | `^\nOpen CASCADE Topology V[34]` | OCCT `BinTools` header (Unverified — confirm line numbers against OCCT 7.9.3 source: `src/BinMgmt/BinTools.cxx` or equivalent) |
| `text` | `^DBRep_DrawableShape` | OCCT `BRepTools` header (Unverified — confirm against OCCT 7.9.3 source: `src/BRepTools/BRepTools.cxx`) |
| `step` | `^ISO-10303-21;` | STEP standard header (Unverified — confirm against OCCT 7.9.3 source: `src/STEPControl/STEPControl_Reader.cxx`) |

- **Remove the trailing-byte (0x1a) rule.** Format is determined solely by the explicit `format` field + prefix verification. The existing kernel check for trailing 0x1a is removed.
- Prefix verification is a fast reject, not a guarantee of validity — malformed files with valid prefixes still reach the reader.
- Prefix matching is version-tolerant: `V[34]` covers both OCCT 7.x and 8.x binary headers. CRLF-tolerant: `\r?\n` allowed after the prefix.

### 2. Where `format` Lives in the Proto

- `ImportBRepOp` — add `Format format = 5;` field. The `Format` enum already exists on `BrepReference` in `common.proto` (fields 1–3). Reuse the same enum or reference `BrepReference.Format`.
- `ExportBRepOp` — add `Format format = 2;` field (default `FORMAT_BINARY`).
- `BrepReference.format` (field 1) already exists on the response side — no change needed there.
- `BrepReference.sha256` (field 2) already exists — no proto change needed for hash mapping.
- **No proto change strictly required** if `format` is carried as part of `brep_source` oneof or as a new scalar field on the ops. buf breaking change check required before committing proto changes.

### 3. Kernel Import / Export Support

Kernel import supports all three formats:

| Format | Reader | Notes |
|--------|--------|-------|
| `binary` | `BinTools::Read` | Existing path |
| `text` | `BRepTools::Read` | Text B-rep from WASM worker |
| `step` | `STEPControl_Reader` | STEP fallback from WASM worker |

Export can produce text B-rep when the client may fall back to the WASM worker:

| Format | Writer | Notes |
|--------|--------|-------|
| `binary` | `BinTools::Write` | Existing path |
| `text` | `BRepTools::Write` | New — for WASM fallback compatibility |
| `step` | `STEPControl_Writer` | New — STEP fallback |

### 4. Pre-Validation (`ValidateBrepInput`)

Factor validation into a pure C++ function `ValidateBrepInput(bytes, format)` with GoogleTest unit tests and a test seam proving it runs before the reader.

#### Per-format section-count spec

| Format | Counts read | Where (OCCT source — Unverified) | Size-relative bound |
|--------|------------|----------------------------------|---------------------|
| `binary` (BinTools) | number of shapes/objects | `BinTools::Read` header, shape count field | max ≤ input_size / min_record_bytes (min ~64 bytes per shape header) |
| `text` (BRepTools) | number of shapes | `BRepTools::Read` header line "NbShapes: N" | max ≤ input_size / min_shape_lines (min ~5 lines per shape) |
| `step` | entity count | `STEPControl_Reader` header, #N=... entity count | max ≤ input_size / min_entity_lines (min ~3 lines per entity) |

Replace the fixed 1,000,000 limit with a bound relative to input size:
- `max_sections = input_size / min_section_bytes` where `min_section_bytes` is format-specific (64 for binary, 5 lines for text, 3 lines for step).

**Cannot guarantee "never hang":** Header checks cannot guarantee the reader won't hang on malformed input with valid prefixes. Backstops: deadline kill, memory limit, and sandbox from the gRPC design doc.

### 5. Hash Semantics and Implementation

SHA-256 of serialized bytes is for **integrity and dedupe only**, not a geometry identity or cross-version cache key (the cache key is the feature-chain hash in WC-RGN). Map to `BrepReference.sha256` (field `string sha256=2` already exists in `common.proto` — **verified**, no proto change needed). Add an end-to-end test that the gateway/transport passes it through.

**Hash test:** `sha256(bytes)` equals the `sha256` field in `BrepReference`, verified against known-answer vectors (KAVs):
- SHA-256 of empty bytes = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- SHA-256 of "abc" = `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`

**Hash implementation:** Remove the "OCCT `Message_Digest`" option (no such class in OCCT's Message package — verified via OCP). Use OpenSSL SHA-256 if linked and licence-compatible; otherwise a vendored SHA-256 implementation.

- `CMakeLists.txt` does **not** currently link OpenSSL (verified).
- **Open question:** Add OpenSSL linking or vendor SHA-256? Default: vendored SHA-256 (avoids new dependency/licence).

### 6. Export Format Default (Open Question)

**Open question:** What is the default export format when `format` is unset on `ExportBRepOp`?
- Option A: `binary` (existing behavior, most efficient)
- Option B: `text` (WASM-compatible, larger but human-readable)
- **Default:** `binary`

### 7. Size Limits

| Path | Limit | Effective today | Transport vs in-band |
|------|-------|-----------------|---------------------|
| Browser → gateway request | 4 MiB | Yes | Transport error (413/Request Entity Too Large) |
| Inline gRPC response | 4 MiB | Yes | Transport error |
| Per gRPC message hard cap | 16 MiB | Yes | Transport error |
| Kernel B-rep cap | 64 MB | Yes | In-band error (`IMPORT_FAILED`, reason `size`) |
| PutBlob / BlobRef for larger B-reps | 16 MiB blob, 64 MiB per-session quota | **UNIMPLEMENTED** | N/A |

Which path carries larger B-reps: BlobRef/PutBlob (for B-reps > 4 MiB inline). **PutBlob is UNIMPLEMENTED** in the kernel — larger B-reps cannot currently be transferred. This must be resolved before B-reps > 4 MiB are supported.

**Reconciliation:** The kernel's 64 MB cap applies to in-band B-reps. The gRPC design's 4 MiB request / 16 MiB message limits mean B-reps between 4 MiB and 64 MB must use PutBlob/BlobRef. Since PutBlob is unimplemented, the effective limit today is 4 MiB for inline B-reps.

### 8. Error Handling

All failures return existing `ExecutionFailureCode` values with a specific reason in the message:

| Code | Reason | When |
|------|--------|------|
| `IMPORT_FAILED` | `size` | input > 64 MB kernel cap or > 4 MiB gRPC request |
| `IMPORT_FAILED` | `header` | prefix mismatch for declared `format` |
| `IMPORT_FAILED` | `truncation` | incomplete input |
| `IMPORT_FAILED` | `counts` | section/entity count exceeds size-relative bound |
| `IMPORT_FAILED` | `reader` | `BinTools::Read` / `BRepTools::Read` / `STEPControl_Reader` throws `Standard_Failure` |
| `IMPORT_FAILED` | `unsupported_format` | format not supported by kernel/WASM |
| `GEOMETRY_EMPTY` | — | imported shape is null |
| `EXPORT_FAILED` | `writer` | `BinTools::Write` / `BRepTools::Write` / `STEPControl_Writer` throws |
| `EXPORT_FAILED` | `empty_output` | zero bytes written |
| `OPERATION_FAILED` | — | other kernel failure |
| `UNSUPPORTED` | — | unimplemented-but-valid operation (e.g. `create_loft`, `check_validity`) |

No new error codes introduced.

### 9. Post-Import Validation Gate

After successful import, run `BRepCheck_Analyzer` on the imported shape and compute volume/surface metrics:

- If `BRepCheck_Analyzer` reports invalid → `IMPORT_FAILED` with reason `reader` (shape failed validity check)
- If volume is NaN or infinite → `GEOMETRY_EMPTY`
- Volume and surface area are stored in `ShapeMetrics` on `ExecuteResponse.metrics`

This gate runs after `ValidateBrepInput` and after the reader, but before caching the shape.

---

## Testing

### Unit Tests

**Pure C++ (`ValidateBrepInput`):** GoogleTest unit tests in `tests/kernel/` (new file). Test seam proves `ValidateBrepInput` runs before the reader:

- Empty bytes → `IMPORT_FAILED` with reason `size`
- Truncated input → `IMPORT_FAILED` with reason `truncation`
- Invalid prefix for declared `format` → `IMPORT_FAILED` with reason `header`
- Section count exceeds size-relative bound → `IMPORT_FAILED` with reason `counts`
- Garbage/random bytes → `IMPORT_FAILED`, no crash, no hang
- Valid binary/text/step B-rep → passes validation
- Known-answer vector: SHA-256 of test bytes matches expected hash

**TypeScript (`tests/core/gateway/brep-validation.test.ts`):** Moved/replaced — kept only for end-to-end failure codes through the transport layer:

- Empty BREP bytes → `IMPORT_FAILED`
- Truncated BREP → `IMPORT_FAILED`
- Invalid header magic → `IMPORT_FAILED`
- Absurd section count → `IMPORT_FAILED` (before reader)
- Garbage/random bytes → `IMPORT_FAILED`, no crash
- Valid BREP round trip → success + `hash` present and deterministic

### Cross-Version Tests

Automated tests using committed fixtures:

- WASM text B-rep imported by OCCT 7.9.3 kernel → success
- WASM STEP fallback imported by OCCT 7.9.3 kernel → success
- OCCT 7.9.3-exported binary B-rep imported by OCCT 7.9.3 kernel → success + hash deterministic
- OCCT 7.9.3-exported text B-rep imported by OCCT 7.9.3 kernel → success
- OCCT 7.9.3-exported STEP imported by OCCT 7.9.3 kernel → success
- **Reverse-direction:** OCCT 7.9.3 kernel exports → WASM worker imports → success
- Malformed variants → `IMPORT_FAILED` with specific reason, no crash

### Fixture Manifest

| Fixture | Source | Version | Format | Committed |
|---------|--------|---------|--------|-----------|
| WASM text B-rep | opencascade.js | 1.1.4 | text | Yes |
| WASM STEP fallback | opencascade.js | 1.1.4 | step | Yes |
| Native binary B-rep | OCCT (conda-forge) | 7.9.3 | binary | Yes |
| Native text B-rep | OCCT (conda-forge) | 7.9.3 | text | Yes |
| Native STEP | OCCT (conda-forge) | 7.9.3 | step | Yes |
| Native binary B-rep | OCCT (conda-forge) | 8.0.x | binary | Gated (8.0.x not baseline) |
| Native text B-rep | OCCT (conda-forge) | 8.0.x | text | Gated |
| Native STEP | OCCT (conda-forge) | 8.0.x | step | Gated |
| Malformed variants | hand-crafted | N/A | all formats | Yes |

- 7.9.3 fixtures from conda-forge OCCT package.
- 8.0.x fixtures are **gated** — generated only when OCCT 8.0.x is available; not part of baseline CI.
- Manual steps only for regenerating fixtures.

### Kernel Health Smoke Test

Box, boolean (fuse/cut/common), mesh — all marked expected-failure until bug `P0-WEBCAD-CREATE_BOX` is fixed. Positive canary test `create_box must succeed` marked expected-failure; flips to passing when fixed.

### Fuzzing

Real fuzzing on `ValidateBrepInput` and the importer:

- libFuzzer or AFL++ harness
- Under ASan/UBSan
- Seeded from real files (including WASM-produced text B-rep and STEP fallback)
- Structure-aware mutation of counts (shape counts, entity counts)
- Per-input time and memory limits
- Short run in CI, longer nightly run on instrumented OCCT

---

## Acceptance Criteria Mapping

| Criterion | Check |
|-----------|-------|
| Explicit `format` field replaces magic/trailing-byte | `OpImportBRep`/`OpExportBRep` accept `format`; prefix verified per format; 0x1a rule removed |
| Kernel import supports binary/text/step | `BinTools::Read` / `BRepTools::Read` / `STEPControl_Reader` all wired |
| Export can produce text B-rep for WASM fallback | `BRepTools::Write` available |
| Content hash for integrity/dedupe | `OpResult.hash` populated; mapped to `BrepReference.sha256`; end-to-end pass-through test |
| Hash uses OpenSSL or vendored SHA-256 | Not OCCT `Message_Digest`; justification recorded |
| Validation factored into pure `ValidateBrepInput` | GoogleTest unit tests; test seam proves pre-reader execution |
| TypeScript tests only for end-to-end failure codes | `brep-validation.test.ts` moved/replaced |
| Committed fixtures for cross-version | WASM text, WASM STEP, native binary/text/step, malformed variants |
| Cross-version tests automated | All fixture round-trip combinations tested |
| Kernel health smoke test prerequisite | Box, boolean, mesh — expected-failure until Part A bug fixed |
| Size limits reconciled | 64 MB kernel vs 4 MiB/16 MiB gRPC; PutBlob UNIMPLEMENTED noted |
| Specific failure reasons | Every failure message includes reason (size/header/truncation/counts/reader/unsupported_format) |
| Real fuzzing | libFuzzer/AFL++ harness, ASan/UBSan, seeded, CI + nightly |
| Open questions + Risks sections | Present (see below) |
| Status | Proposed |

---

## Open Questions

| # | Question | Proposed default |
|---|----------|-----------------|
| 1 | Prefix strings for OCCT 7.9.3 (binary/text) — confirmed vs 8.0.1? | Unverified — confirm on pinned 7.9.3 build |
| 2 | Add OpenSSL linking or vendor SHA-256? | Vendored SHA-256 (avoids new dependency/licence) |
| 3 | Default export format: binary or text? | `binary` |
| 4 | Should `init` return version handshake or be `reserved` in proto? | Handshake (default — see Part A findings) |
| 5 | Plane ticket id for linking Part A bug | User to provide |
| 6 | Exact OCCT source file/line numbers for section-count citations | Unverified — confirm against OCCT 7.9.3 source |

---

## Risks

- **Stale kernel-worker binary:** The binary inside `kernel:occt-7.9.3` may be built from older source than the current `kernel-worker.cpp`. Rebuilding from current source may resolve the create_box issue without code changes (see Part A findings).
- **Parameter mismatch:** If `dx`/`dy`/`dz` arrive as 0 or incorrect values from the client, `MakeBox(0,0,0)` would produce a degenerate box with `IsDone()==false`.
- **`INVALID_PARAMETER` → `UNSUPPORTED` for unported ops:** Behavioral change clients may depend on.
- **PutBlob UNIMPLEMENTED:** B-reps > 4 MiB cannot currently be transferred; larger B-rep support blocked until PutBlob implemented.
- **Header checks cannot guarantee "never hang":** Malformed files with valid prefixes still reach the reader; deadline kill, memory limit, and sandbox from gRPC design are the backstop.
- **Cross-version B-rep compatibility:** Text B-rep format may differ between OCCT 7.9.3 and 8.0.1; fixtures must be regenerated per version.
- **OCCT source citations unverified:** Section-count spec cites OCCT source files/lines that must be confirmed against the actual OCCT 7.9.3 source tree.
