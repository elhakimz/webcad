# WC-EC-24 — B-rep Import/Export and Cross-Version Compatibility Design

**Status:** Proposed  
**Epic:** WC-EC  
**Ticket:** WC-EC-24  
**Priority:** high  
**Agent:** B  
**Depends on:** WC-EC-10

## 1. Goal

Complete the remaining WC-EC-24 tasks: content hashing of B-rep for caching/revisions, fuzz-testing the importer, and pre-validation of BREP input before it reaches the OCCT reader. Cross-version round-trip tests (WASM ↔ OCCT 8.0.1) are documented as manual verification procedures.

## 2. Current State

### 2.1 Kernel (`kernel-worker.cpp`)
- `OpImportBRep` — validates empty input (≤64MB, ends with 0x1a byte), reads via `BinTools::Read`, caches shape, returns `OpResult` with `shapeId`
- `OpExportBRep` — looks up cached shape, writes via `BinTools::Write`, returns binary BREP data
- Both already have size and truncation checks

### 2.2 WASM Worker (`OCCWorker.ts`)
- `exportShapeToNativeBRep` — BinTools → BRepTools (text) → STEP fallback
- `importShapeFromNativeBRep` — BinTools → BRepTools → STEP fallback

### 2.3 Missing
- Content hash not computed or returned
- No fuzz tests for malformed input
- Pre-validation limited to size + trailing byte; no header/magic or section-count checks

## 3. Design

### 3.1 Kernel Changes (`kernel-worker.cpp`)

#### `OpImportBRep`
- Add SHA-256 hash of raw B-rep bytes, returned in `OpResult.hash`
- Add pre-validation before `BinTools::Read`:
  1. Empty check (existing)
  2. Size ≤ 64MB (existing)
  3. Ends with 0x1a (existing truncation check)
  4. Header magic starts with "BREP"
  5. Section count sanity limit (reject > 1,000,000 sections)
- On failure: return error code, never crash or hang

#### `OpExportBRep`
- Add SHA-256 hash of exported bytes, returned in `OpResult.hash`

#### `OpResult`
- Add optional `std::string hash` field, populated on successful import/export

#### Hash helper
- `ComputeSha256(const std::string& data)` → hex string
- Use OpenSSL SHA-256 if linked; otherwise OCCT `Message_Digest` or a minimal SHA-256 implementation

### 3.2 WASM Worker (`OCCWorker.ts`)

No kernel-side WASM changes required. The `OpResult.hash` field is returned by the kernel and propagated through the existing transport layer automatically.

### 3.3 Error Handling

All failures return existing `ExecutionFailureCode` values:
- `IMPORT_FAILED` — size exceeded, invalid header, `BinTools::Read` exception
- `GEOMETRY_EMPTY` — imported shape is null
- `EXPORT_FAILED` — `BinTools::Write` exception, empty output

No new error codes introduced.

### 3.4 Testing

#### Unit tests: `tests/core/gateway/brep-validation.test.ts`
- Empty BREP bytes → `IMPORT_FAILED`
- Truncated BREP (missing 0x1a) → `IMPORT_FAILED`
- Invalid header magic → `IMPORT_FAILED`
- Absurd section count (>1M) → `IMPORT_FAILED` (before reader)
- Garbage/random bytes → `IMPORT_FAILED`, no crash
- Valid BREP round trip → success + `hash` present and deterministic

#### Cross-version manual verification (Tasks 1-2)
- WASM-produced BREP imported by OCCT 8.0.1 kernel → document result
- OCCT 8.0.1-exported BREP imported by WASM worker → document result
- Results documented in `doc/results/`

### 3.5 Acceptance Criteria Mapping

| Criterion | Check |
|-----------|-------|
| Cross-version round trips pass or incompatibilities documented | Manual verification, results in `doc/results/` |
| Truncated and oversized-count BREP rejected quickly without touching reader | Unit tests assert `IMPORT_FAILED` before `BinTools::Read` |
| Content hash for caching/revisions | `OpResult.hash` present, deterministic |
| Fuzz-tested importer | Unit tests cover malformed inputs |

## 4. Scope Check

- Kernel changes: `kernel-worker.cpp` only (~50 lines added)
- WASM changes: none
- New test file: `tests/core/gateway/brep-validation.test.ts`
- No protocol changes (proto untouched)
- No new dependencies beyond existing OpenSSL/OCCT hashing

## 5. Out of Scope

- Full BREP structural parsing validation (beyond header + section count)
- Automatic cross-version CI (manual verification documented)
- WASM-side content hashing (kernel provides it)

---

Please review this spec. If approved, I'll commit it and proceed to the implementation plan via writing-plans.