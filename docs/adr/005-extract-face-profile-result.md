# ADR 005: ExtractFaceProfileResult proto message

**Status:** Accepted
**Date:** 2026-11-21
**Ticket:** WC-EC-17

## Context

WC-EC-17 ports `extract_face_profile` to the native OCCT kernel. The operation returns a set of 2D loops (coplanar wire projections) rather than a 3D solid shape, so it cannot reuse the existing `*Result { string shape_id = 1; }` pattern.

`engine.proto` already defines `ExtractFaceProfileOp` at `ExecuteRequest` field 9. We need a response message plus a oneof entry in `ExecuteSuccess`.

## Decision

Add to `engine.proto`:

```protobuf
message Point2D { double x = 1; double y = 2; double bulge = 3; }
message Loop2D { repeated Point2D points = 1; }
message ExtractFaceProfileResult { repeated Loop2D loops = 1; }
```

And add to `ExecuteSuccess.oneof op_result`:

```protobuf
ExtractFaceProfileResult extract_face_profile = 30;  // Next free field after GenericShapeResult = 29
```

### Rationale

- **Field 30**: `ExecuteSuccess` oneof ends at `GenericShapeResult generic = 29`; 30 is the next free field.
- **bulge on Point2D**: Each vertex in a loop carries its own bulge (matching WASM `{x, y, bulge: 0}`), supporting polylines where different segments have different bulge values.
- **No shape_id**: `extract_face_profile` returns loops only; no new entity is cached.

## Consequences

### Positive
- Type-safe response for 2D profile extraction
- Matches WASM reference data model
- No existing field numbers disturbed

### Negative
- `extract_face_profile` cannot be tested via the standard oracle runner (which expects 3D solid metrics); requires a dedicated integration test
- New proto message requires buf lint + codegen

## Alternatives Considered

| Approach | Reason rejected |
|----------|-----------------|
| Reuse `GenericShapeResult` with shape_id | Wrong semantics — operation returns loops, not a shape |
| Field 38 in oneof | Not the next free field; 30 is correct |
| bulge on Loop2D | Geometrically incorrect — different segments in a loop can have different bulges |

## References

- [WC-EC-17 design spec](docs/superpowers/specs/2026-11-23-wc-ec-17-extrude-revolve-compound-face-profile-design.md)
- WASM reference: `src/core/io/OCCWorker.ts:4384-4529`
