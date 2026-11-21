# ADR 004: Add PolyhedronFace and `faces` field to CreatePolyhedronOp

## Context

WC-EC-15 requires porting `createPolyhedron` and `createConvexHull` to the native OCCT kernel. The `createPolyhedron` operation needs both `points` (vertices) and `faces` (vertex index tuples defining each polygonal face) to reconstruct a B-Rep solid. The current `CreatePolyhedronOp` proto message only defines `points_inline`, `points_ref`, `deflection`, and `entity_id` — it is missing `faces`.

Without `faces`, a general polyhedron cannot be reconstructed from vertices alone. `CreateConvexHullOp` does not need `faces` because `computeConvexHull3D` derives triangular faces from points.

## Decision

Add a `PolyhedronFace` message and a `repeated PolyhedronFace faces = 5` field to `CreatePolyhedronOp`:

```protobuf
message PolyhedronFace {
  repeated int32 vertex_indices = 1;
}

message CreatePolyhedronOp {
  repeated Point3D points_inline = 1;
  BlobRef points_ref = 2;
  double deflection = 3;
  string entity_id = 4;
  repeated PolyhedronFace faces = 5;
}
```

## Consequences

- **Positive**: `createPolyhedron` can now build general polyhedra with arbitrary face topology, matching the WASM `createPolyhedron` behavioral reference.
- **Positive**: Backward-compatible — `faces` is a repeated field; existing clients omitting it will receive an empty list (kernel will error with "no faces" which is correct behavior).
- **Negative**: Requires regenerating TS/C++ protobuf stubs via `npm run buf:generate`.
- **Scope**: Only `engine.proto` changes; `common.proto` is unaffected.

## Related

- WC-EC-15: Port polyhedron and convex hull
- `proto/webcad/engine/v1/engine.proto` — `CreatePolyhedronOp` message
- `src/core/gateway/kernel-worker.cpp` — `OpCreatePolyhedron` implementation