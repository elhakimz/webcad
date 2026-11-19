// Shim for @bufbuild/protobuf/wkt (v1.x subpath) on top of v2.x.
// Provides MethodOptions_IdempotencyLevel and other well-known type
// descriptors used by @connectrpc/connect.

export enum MethodOptions_IdempotencyLevel {
  IDEMPOTENCY_LEVEL_UNKNOWN = 0,
  NO_SIDE_EFFECTS = 1,
  IDEMPOTENT = 2,
}

// file_google_protobuf_any — FileDescriptorProto for google/protobuf/any.proto.
// Not needed at runtime; empty stub suffices.
export const file_google_protobuf_any: any = undefined;

// anyPack — function for packing messages into google.protobuf.Any.
// Not needed at runtime; no-op stub.
export function anyPack(): any {
  return undefined;
}
