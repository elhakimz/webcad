// Shim for @bufbuild/protobuf/wkt (v1.x subpath) on top of v2.x.
// Provides MethodOptions_IdempotencyLevel and well-known type descriptors
// used by @connectrpc/connect.
//
// file_google_protobuf_any is re-exported from v2.x because @connectrpc/connect's
// status_pb.js passes it to fileDesc() at module load, which accesses .proto on it.
// anyPack is a no-op stub — only used for gRPC status trailers (server-side).

import { file_google_protobuf_any as v2_file_google_protobuf_any } from "../../node_modules/@bufbuild/protobuf/dist/esm/wkt/google/protobuf/any_pb.js";

export enum MethodOptions_IdempotencyLevel {
  IDEMPOTENCY_LEVEL_UNKNOWN = 0,
  NO_SIDE_EFFECTS = 1,
  IDEMPOTENT = 2,
}

export const file_google_protobuf_any = v2_file_google_protobuf_any;

export function anyPack(): any {
  return undefined;
}
