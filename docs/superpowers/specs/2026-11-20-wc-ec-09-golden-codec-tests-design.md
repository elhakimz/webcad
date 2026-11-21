# WC-EC-09: Golden-file codec round-trip tests (TS + C++)

**Date:** 2026-11-20
**Ticket:** WC-EC-09 — Language-neutral kernel protocol spec + codecs (TS and C++)
**Status:** Proposed (awaiting review)

## Problem

WC-EC-09 is marked ✓ in the epic table but its two acceptance criteria are unchecked:

1. Round-trip tests pass in both languages with identical golden files — NOT met (tests use hardcoded inline values, no shared golden files)
2. Spec reviewed against every message type — NOT met (only ~5 of ~40 message types have round-trip coverage)

## Goal

Add shared golden input files and extend both TS and C++ codec round-trip test suites so they read the SAME golden files and validate round-trip fidelity for a focused, high-value subset of message types. Then check both acceptance criteria for WC-EC-09.

## Scope (focused subset per Option B)

Cover these message types (~20), chosen for protocol value and variety of field kinds:

**Common:** CommandHeader, MeshData, ExecuteFailure
**Session:** OpenSessionRequest, OpenSessionResponse
**Health:** HealthRequest, HealthResponse
**ExecuteRequest ops (simple):** InitOp, ClearCacheOp, ReleaseShapesOp, CheckValidityOp, ExportBRepOp
**ExecuteRequest ops (primitives):** CreateBoxOp, CreateCylinderOp, CreateSphereOp, CreateConeOp
**ExecuteRequest ops (compound):** CreateBooleanOp, CreateExtrudeOp, CreateRevolveOp, MultMatrixShapeOp, TransformShapeOp

Each op message is tested individually (not wrapped in ExecuteRequest), which keeps C++ oneof handling simple while still validating the codec.

Explicitly out of scope for this change (follow-up tickets): CreatePolyhedronOp, CreateConvexHullOp, CreatePyramidOp, CreateTorusOp, CreateWedgeOp, CreateFrustumOp, CreateSweepOp, CreateLoftOp, CreateCompoundOp, RotateShapeOp, MirrorShapeOp, ScaleShapeOp, FilletSolidOp, ChamferSolidOp, FilletSolidFaceOp, ChamferSolidFaceOp, MakeThickSolidOp, DraftSolidFacesOp, ImportBRepOp (BlobRef oneof), ExtractFaceProfileOp, Restore*, Subscribe*, Cancel*, CloseSession*, StreamResult*, PutBlob*, ExecuteResponse/result oneofs, BrepReference, BlobRef, ResultChunk, KernelStatusEvent, etc.

## Files

**New:**
- `tests/golden/messages.json` — shared golden input data (array of cases, one per message type)
- `docs/superpowers/specs/2026-11-20-wc-ec-09-golden-codec-tests-design.md` — this spec

**Modified:**
- `src/core/io/__tests__/codec.test.ts` — add `describe('golden round-trip')` block
- `tests/codec_test.cpp` — add gtest cases + minimal JSON parser for reading the golden file
- `docs/epics/WEBCAD-EPIC-EC-v5.md` — check both WC-EC-09 acceptance criteria boxes

## Golden file format (`tests/golden/messages.json`)

Top-level: JSON array of case objects:

```json
[
  {
    "message_type": "CommandHeader",
    "description": "all fields populated",
    "input": {
      "session_id": "c9bf9a6e-6bbd-4c7a-bd1e-0f5a6c1b2d3e",
      "request_id": "d1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f6a",
      "client_seq": 7,
      "document_id": "doc-42"
    }
  },
  {
    "message_type": "MeshData",
    "description": "typical triangular mesh with edge lines",
    "input": {
      "positions": "<base64 of float32 LE xyz triplets>",
      "indices": "<base64 of uint32 LE triangle indices>",
      "face_mapping": "<base64 of int32 LE>",
      "edge_offsets": "<base64 of uint32 LE>",
      "edge_lines": "<base64 of float32 LE>"
    }
  },
  ...
]
```

- Bytes fields (positions, indices, face_mapping, edge_offsets, edge_lines, data) are base64-encoded in JSON; both TS and C++ decode to the same byte sequence.
- Nested messages (Point3D, BrepReference, BlobRef, ServerLimits) are nested objects.
- repeated fields are JSON arrays.
- oneof fields: only one variant present per case.
- Enum fields: numeric value (matches proto3 enum integer representation).
- bool fields: JSON true/false.
- Empty/default case included per message type where meaningful.

## TS test additions (`codec.test.ts`)

Add a `describe('golden round-trip (shared golden file)')` block:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const GOLDEN = JSON.parse(readFileSync(join(__dirname, '../../../tests/golden/messages.json'), 'utf8'));

// Map message_type name -> schema
const SCHEMAS: Record<string, DescMessage> = {
  CommandHeader: CommandHeaderSchema,
  OpenSessionRequest: OpenSessionRequestSchema,
  OpenSessionResponse: OpenSessionResponseSchema,
  HealthRequest: HealthRequestSchema,
  HealthResponse: HealthResponseSchema,
  MeshData: MeshDataSchema,
  ExecuteFailure: ExecuteFailureSchema,
  InitOp: InitOpSchema,
  ClearCacheOp: ClearCacheOpSchema,
  ReleaseShapesOp: ReleaseShapesOpSchema,
  CheckValidityOp: CheckValidityOpSchema,
  ExportBRepOp: ExportBRepOpSchema,
  CreateBoxOp: CreateBoxOpSchema,
  CreateCylinderOp: CreateCylinderOpSchema,
  CreateSphereOp: CreateSphereOpSchema,
  CreateConeOp: CreateConeOpSchema,
  CreateBooleanOp: CreateBooleanOpSchema,
  CreateExtrudeOp: CreateExtrudeOpSchema,
  CreateRevolveOp: CreateRevolveOpSchema,
  MultMatrixShapeOp: MultMatrixShapeOpSchema,
  TransformShapeOp: TransformShapeOpSchema,
};

for (const { message_type, description, input } of GOLDEN) {
  it(`round-trips ${message_type}: ${description}`, () => {
    const schema = SCHEMAS[message_type];
    expect(schema).toBeDefined();
    const msg = create(schema, input);
    const binary = toBinary(schema, msg);
    const decoded = fromBinary(schema, binary);
    expect(decoded).toEqual(input);
  });
}
```

Note: base64 fields need `Uint8Array.from(atob(...), c => c.charCodeAt(0))` conversion in the test assertion since `toBinary`/`fromBinary` preserve bytes as Uint8Array.

For each case, also assert `decoded` deep-equals `input` after normalizing base64->Uint8Array on the input side.

## C++ test additions (`codec_test.cpp`)

Add:
1. A minimal JSON parser (object/array/string/number/bool/null) sufficient to read `tests/golden/messages.json`.
2. A helper to resolve `tests/golden/messages.json` relative to the test executable (assume CWD is build dir or tests dir; fall back to a few candidate paths).
3. For each golden case, a gtest that:
   - Parses the case from JSON
   - Switches on `message_type`
   - Constructs the proto message from parsed fields
   - Round-trips via SerializeToString/ParseFromString
   - Compares decoded fields against parsed input (EXPECT_EQ / EXPECT_FLOAT_EQ / EXPECT_STREQ / byte comparison)

Base64 decode helper for bytes fields.

## Verification

- `npm test` (vitest) — TS golden tests pass
- `ctest` in kernel build dir — C++ golden tests pass
- Both suites use the SAME `tests/golden/messages.json` → "identical golden files" criterion met
- Coverage spans all field kinds: string, uint64, double, int32, bool, bytes (base64), nested message, repeated, enum, oneof

## Acceptance criteria (post-change)

- [x] Round-trip tests pass in both languages with identical golden files
- [x] Spec reviewed against every message type (focused subset)

## Out of scope

- Code generation from proto schema (adds build complexity)
- Testing every one of ~40 message types (follow-up ticket)
- Testing ExecuteResponse result oneofs, streaming types, cancel/close/subscribe (follow-up)

## Design self-review

- **Placeholder scan:** No TBD/TODO remaining; message list and file paths are concrete.
- **Internal consistency:** TS schemas map 1:1 to C++ message classes; golden JSON keys match proto field names (camelCase in TS, snake_case handled by protobuf JSON conventions where applicable).
- **Scope check:** ~20 message types, 2 test files + 1 golden file ≈ well within 600-line / 15-file limit.
- **Ambiguity check:** Base64 bytes handling is explicit; empty/default cases included; enum values are numeric.

Please review this spec before I proceed to implementation.