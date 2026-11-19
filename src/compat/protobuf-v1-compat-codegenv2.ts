// Shim for @bufbuild/protobuf/codegenv2 (v1.x subpath) on top of v2.x.
// Provides fileDesc/messageDesc used by @connectrpc/connect for gRPC status details.
// v2.x implements these internally in its codegenv2 module but doesn't expose
// them as a subpath export, so we re-export from the internal module via a
// relative path to avoid the Vite alias causing a circular import.

export { fileDesc, messageDesc } from "../../node_modules/@bufbuild/protobuf/dist/esm/codegenv2/index.js";
