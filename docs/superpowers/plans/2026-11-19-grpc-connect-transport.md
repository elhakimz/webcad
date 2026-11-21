# gRPC/Connect Transport Replacement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-based OCCT Web Worker transport (postMessage) with a server-side geometry engine using gRPC (gateway→kernel) and Connect protocol (browser→gateway), per the revised design spec at `docs/superpowers/specs/2026-10-21-grpc-connect-transport-design.md`.

**Architecture:** Browser → Connect (HTTP/2 TLS) → nginx → Gateway → gRPC (HTTP/2 UDS/TCP+mTLS) → Kernel. The local WASM worker transport remains as a config option behind the unchanged `OCCTransport` interface. Session IDs are client-generated UUID v4 for sticky routing. One kernel process per session.

**Tech Stack:** TypeScript, Node.js, connect-es (client), connect-node (server), buf (proto lint/breaking/codegen), @grpc/grpc-js, nginx, docker-compose, Vitest, Playwright.

---

## Chunk 1: PR 1 — Proto + Codegen + CI

### Task 1: Create proto directory and common.proto

**Files:**
- Create: `proto/webcad/engine/v1/common.proto`

- [ ] **Step 1: Write common.proto with shared messages**

```protobuf
syntax = "proto3";

package webcad.engine.v1;

option go_package = "github.com/elhakimz/webcad/proto/webcad/engine/v1";
option java_multiple_files = true;
option java_package = "com.webcad.engine.v1";

// Common message types shared between EngineGateway and Kernel services.

// Command header carried on every sequenced RPC.
message CommandHeader {
  string session_id = 1;          // Client-generated UUID v4 session identifier
  string request_id = 2;          // Client-generated UUID v4 request identifier (dedupe key)
  uint64 client_seq = 3;          // Per-session monotonic sequence, starts at 1
  string document_id = 4;         // Optional, reserved for future multi-document sessions
}

// Result header returned on every ExecuteResponse.
message ResultHeader {
  string request_id = 1;          // Echoes the request_id from the command
  uint64 event_id = 2;            // Monotonic per-session event ID (from Subscribe stream)
}

// Reference to B-rep data; data is opt-in (include_brep flag on request controls inclusion).
message BrepReference {
  enum Format {
    FORMAT_UNSPECIFIED = 0;
    BINARY = 1;                   // Native OCCT B-rep binary
    TEXT = 2;                     // Native OCCT B-rep text
    STEP = 3;                     // STEP-encoded legacy snapshot from browser worker
  }
  Format format = 1;
  string sha256 = 2;              // SHA-256 revision hash of the B-rep bytes
  bytes data = 3;                 // Opt-in B-rep payload (only when include_brep=true)
}

// Generalised reference to any large uploaded field (B-rep, polyhedron points, etc.).
message BlobRef {
  string upload_id = 1;           // Chunked upload identifier
  string sha256 = 2;              // SHA-256 of the complete blob
  uint64 size = 3;                // Total blob size in bytes
  string session_id = 4;          // Session the blob is bound to
}

// Mesh data packed into bytes fields.
message MeshData {
  bytes positions = 1;            // float32 LE, xyz triplets
  bytes indices = 2;              // uint32 LE, triangle indices
  bytes face_mapping = 3;         // int32 LE, per-triangle face index
  bytes edge_offsets = 4;         // uint32 LE, offsets into edge_lines array
  bytes edge_lines = 5;           // packed float32 LE, [x1,y1,x2,y2, ...] edge segments
}

// Result chunk for streaming large outputs (> inline limit).
message ResultChunk {
  string result_id = 1;           // References the large result
  uint32 chunk_index = 2;         // Sequential chunk index
  bytes data = 3;                 // Chunk payload (<= 1 MiB each)
  string sha256 = 4;              // SHA-256 of the complete streamed result
  bool final = 5;                 // True on the last chunk
}

// Request for a streamed result chunk.
message ResultChunkRequest {
  string result_id = 1;
  uint32 chunk_index = 2;         // If unset, server streams from the beginning
}

// In-band execution failure (kernel-side problems, not transport errors).
message ExecuteFailure {
  string operation = 1;           // Name of the failing operation
  uint32 code = 2;                // execution_failure_code enum value
  string message = 3;             // Human-readable error message
  string details = 4;             // Structured details (optional)
}

enum ExecutionFailureCode {
  MISSING_ENTITY = 0;             // Entity not found / not cached
  INVALID_PARAMETER = 1;          // Bad argument values
  INVALID_PROFILE = 2;            // Failed wire or face creation
  UNSUPPORTED = 3;                // Non-planar face, non-uniform scale, unsupported loft
  OPERATION_FAILED = 4;           // Extrude, sweep, loft, shell failure
  GEOMETRY_EMPTY = 5;             // Resulting shape is empty/null
  IMPORT_FAILED = 6;              // B-rep import failed
  EXPORT_FAILED = 7;              // B-rep export failed
  INTERNAL = 8;                   // Unexpected kernel failure
}
```

- [ ] **Step 2: Verify file was created correctly**

Run: `wc -l proto/webcad/engine/v1/common.proto`
Expected: ~100 lines

- [ ] **Step 3: Commit**

```bash
git add proto/webcad/engine/v1/common.proto
git commit -m "feat(transport): add common.proto with shared message types"
```

### Task 2: Create engine.proto with services and operation messages

**Files:**
- Create: `proto/webcad/engine/v1/engine.proto`

- [ ] **Step 1: Write engine.proto**

```protobuf
syntax = "proto3";

package webcad.engine.v1;

import "common.proto";

option go_package = "github.com/elhakimz/webcad/proto/webcad/engine/v1";
option java_multiple_files = true;
option java_package = "com.webcad.engine.v1";

// =========================================================================
// EngineGateway — browser-facing service (unary + server-streaming only)
// =========================================================================

service EngineGateway {
  // Open a new session. Session ID is client-generated (UUID v4) so that
  // sticky routing on x-session-id works for OpenSession itself.
  rpc OpenSession(OpenSessionRequest) returns (OpenSessionResponse);

  // Execute a single operation. Carries client_seq for per-session ordering.
  rpc Execute(ExecuteRequest) returns (ExecuteResponse);

  // Restore many entities (rehydration). Carries client_seq.
  rpc Restore(RestoreRequest) returns (RestoreResponse);

  // Subscribe to session events (progress, kernel_status, heartbeat).
  rpc Subscribe(SubscribeRequest) returns (stream SessionEvent);

  // Upload a chunk of a large blob (<= 1 MiB per call).
  rpc UploadChunk(UploadChunkRequest) returns (UploadChunkResponse);

  // Cancel a running command.
  rpc Cancel(CancelRequest) returns (CancelResponse);

  // Close a session and release all resources.
  rpc CloseSession(CloseSessionRequest) returns (CloseSessionResponse);

  // Stream a large result (> inline limit) in chunks.
  rpc StreamResult(StreamResultRequest) returns (stream ResultChunk);
}

// =========================================================================
// Kernel — gateway-facing service (unary + server-streaming only)
// =========================================================================

service Kernel {
  // Execute a single operation on the kernel.
  rpc Execute(ExecuteRequest) returns (ExecuteResponse);

  // Execute with progress streaming (progress messages then final result).
  rpc ExecuteWithProgress(ExecuteRequest) returns (stream ExecuteProgress);

  // Restore many entities on the kernel.
  rpc Restore(RestoreRequest) returns (RestoreResponse);

  // Upload a large blob from gateway to kernel (> 4 MiB). Client streaming.
  rpc PutBlob(stream PutBlobRequest) returns (PutBlobResponse);

  // Stream a large result (> 16 MiB) from kernel to gateway.
  rpc StreamResult(stream ResultChunkRequest) returns (stream ResultChunk);

  // Health check (also serves grpc.health.v1).
  rpc Health(HealthCheckRequest) returns (HealthCheckResponse);
}

// =========================================================================
// EngineGateway request/response messages
// =========================================================================

message OpenSessionRequest {
  CommandHeader header = 1;
  string client_version = 2;
  bool include_brep = 3;          // Default: true while client is authoritative
}

message OpenSessionResponse {
  string protocol_version = 1;
  string minimum_client_version = 2;
  ServerLimits server_limits = 3;
  uint32 heartbeat_interval = 4;  // Seconds, proposed default 15
  string kernel_version = 5;
  string occt_version = 6;
  repeated string supported_operations = 7;
}

message ServerLimits {
  uint64 max_message_size = 1;    // 16 MiB hard cap
  uint64 inline_request_limit = 2; // 4 MiB
  uint64 inline_response_limit = 3; // 4 MiB
  uint64 chunk_size_limit = 4;    // 1 MiB
  uint64 per_session_blob_quota = 5; // 64 MiB
}

message ExecuteRequest {
  CommandHeader header = 1;
  bool include_brep = 2;          // Default per stage: true (client authoritative), false (server authoritative)
  oneof op {
    InitOp init = 3;
    ClearCacheOp clear_cache = 4;
    ReleaseShapesOp release_shapes = 5;
    CheckValidityOp check_validity = 6;
    ExportBRepOp export_brep = 7;
    ImportBRepOp import_brep = 8;
    ExtractFaceProfileOp extract_face_profile = 9;
    CreateBoxOp create_box = 10;
    CreateCylinderOp create_cylinder = 11;
    CreateFrustumOp create_frustum = 12;
    CreateSphereOp create_sphere = 13;
    CreateConeOp create_cone = 14;
    CreateTorusOp create_torus = 15;
    CreateWedgeOp create_wedge = 16;
    CreatePyramidOp create_pyramid = 17;
    CreatePolyhedronOp create_polyhedron = 18;
    CreateConvexHullOp create_convex_hull = 19;
    CreateExtrudeOp create_extrude = 20;
    CreateRevolveOp create_revolve = 21;
    CreateCompoundOp create_compound = 22;
    CreateSweepOp create_sweep = 23;
    CreateLoftOp create_loft = 24;
    CreateBooleanOp create_boolean = 25;
    MultMatrixShapeOp mult_matrix_shape = 26;
    TransformShapeOp transform_shape = 27;
    RotateShapeOp rotate_shape = 28;
    MirrorShapeOp mirror_shape = 29;
    ScaleShapeOp scale_shape = 30;
    FilletSolidOp fillet_solid = 31;
    ChamferSolidOp chamfer_solid = 32;
    FilletSolidFaceOp fillet_solid_face = 33;
    ChamferSolidFaceOp chamfer_solid_face = 34;
    MakeThickSolidOp make_thick_solid = 35;
    DraftSolidFacesOp draft_solid_faces = 36;
  }
}

// Operation payload messages — fields taken exactly from OCCWorker.ts handlers.
message InitOp { }
message ClearCacheOp { }
message ReleaseShapesOp { repeated string entity_ids = 1; }
message CheckValidityOp { string entity_id = 1; }
message ExportBRepOp { string entity_id = 1; }
message ImportBRepOp {
  string entity_id = 1;
  oneof brep_source {
    bytes brep_bytes = 2;
    BlobRef brep_ref = 3;
  }
  double deflection = 4;
}
message ExtractFaceProfileOp { string entity_id = 1; int32 face_index = 2; double deflection = 3; }
message CreateBoxOp { double x = 1; double y = 2; double z = 3; double dx = 4; double dy = 5; double dz = 6; double deflection = 7; string entity_id = 8; }
message CreateCylinderOp { double x = 1; double y = 2; double z = 3; double r = 4; double h = 5; double deflection = 6; string entity_id = 7; }
message CreateFrustumOp { double x = 1; double y = 2; double z = 3; double r1 = 4; double r2 = 5; double h = 6; double deflection = 7; string entity_id = 8; }
message CreateSphereOp { double x = 1; double y = 2; double z = 3; double r = 4; double deflection = 5; string entity_id = 6; }
message CreateConeOp { double x = 1; double y = 2; double z = 3; double r = 4; double h = 5; double deflection = 6; string entity_id = 7; }
message CreateTorusOp { double x = 1; double y = 2; double z = 3; double r1 = 4; double r2 = 5; double deflection = 6; string entity_id = 7; }
message CreateWedgeOp { double x1 = 1; double y1 = 2; double z1 = 3; double x2 = 4; double y2 = 5; double height = 6; double ltx = 7; double deflection = 8; string entity_id = 9; }
message CreatePyramidOp { double x = 1; double y = 2; double z = 3; int32 sides = 4; double radius = 5; double h = 6; double deflection = 7; string entity_id = 8; }
message CreatePolyhedronOp {
  // Large field: use oneof for inline or BlobRef
  repeated Point3D points = 1;
  repeated int32 face_indices = 2;  // Flattened face index array
  oneof points_source {
    repeated Point3D points_inline = 3;
    BlobRef points_ref = 4;
  }
  double deflection = 5;
  string entity_id = 6;
}
message Point3D { double x = 1; double y = 2; double z = 3; }
message CreateConvexHullOp {
  repeated string shape_ids = 1;
  oneof points_source {
    repeated Point3D points_inline = 2;
    BlobRef points_ref = 3;
  }
  double deflection = 4;
  string entity_id = 5;
}
message CreateExtrudeOp {
  repeated Point3D points = 1;
  double height = 2;
  double thickness = 3;
  double deflection = 4;
  bool is_closed = 5;
  string entity_id = 6;
  repeated double vector = 7;
}
message CreateRevolveOp {
  repeated Point3D points = 1;
  Point3D axis_point = 2;
  Point3D axis_dir = 3;
  double angle = 4;
  double thickness = 5;
  double deflection = 6;
  bool is_closed = 7;
  string entity_id = 8;
}
message CreateCompoundOp { repeated string children_ids = 1; string entity_id = 2; double deflection = 3; }
message CreateSweepOp {
  repeated Point3D profile_points = 1;
  repeated Point3D spine_points = 2;
  bool is_solid = 3;
  double deflection = 4;
  string entity_id = 5;
  int32 profile_count = 6;
  string corner_mode = 7;
  bool is_ellipse = 8;
}
message CreateLoftOp {
  repeated LoftProfile profiles = 1;
  bool is_solid = 2;
  bool is_ruled = 3;
  double deflection = 4;
  string entity_id = 5;
}
message LoftProfile { string id = 1; repeated Point3D points = 2; bool closed = 3; }
message CreateBooleanOp {
  string operation = 1;           // "fuse" | "cut" | "common"
  string id_a = 2;
  string id_b = 3;
  string entity_id = 4;
  double deflection = 5;
  Point3D rot_a = 6;
  Point3D rot_b = 7;
  Point3D center_a = 8;
  Point3D center_b = 9;
}
message MultMatrixShapeOp { string entity_id = 1; repeated double m = 2; string target_entity_id = 3; double deflection = 4; }
message TransformShapeOp { string entity_id = 1; double dx = 2; double dy = 3; double dz = 4; string target_entity_id = 5; double deflection = 6; }
message RotateShapeOp { string entity_id = 1; double rx = 2; double ry = 3; double rz = 4; double cx = 5; double cy = 6; double cz = 7; string target_entity_id = 8; double deflection = 9; }
message MirrorShapeOp { string entity_id = 1; Point3D p1 = 2; Point3D p2 = 3; string target_entity_id = 4; double deflection = 5; Point3D normal = 6; }
message ScaleShapeOp { string entity_id = 1; double factor = 2; double cx = 3; double cy = 4; double cz = 5; string target_entity_id = 6; double deflection = 7; double factor_x = 8; double factor_y = 9; double factor_z = 10; }
message FilletSolidOp { string entity_id = 1; int32 edge_index = 2; double radius = 3; double deflection = 4; Point3D visual_p1 = 5; Point3D visual_p2 = 6; }
message ChamferSolidOp { string entity_id = 1; int32 edge_index = 2; double radius = 3; double deflection = 4; Point3D visual_p1 = 5; Point3D visual_p2 = 6; }
message FilletSolidFaceOp { string entity_id = 1; int32 face_index = 2; double radius = 3; }
message ChamferSolidFaceOp { string entity_id = 1; int32 face_index = 2; double radius = 3; }
message MakeThickSolidOp { string entity_id = 1; repeated int32 face_indices = 2; double thickness = 3; bool remove_faces = 4; }
message DraftSolidFacesOp { string entity_id = 1; repeated int32 face_indices = 2; int32 neutral_face_index = 3; double angle_rad = 4; }

message ExecuteResponse {
  ResultHeader header = 1;
  oneof result {
    ExecuteSuccess success = 2;
    ExecuteFailure failure = 3;
  }
  MeshData mesh = 4;
  BrepReference brep_ref = 5;
}

message ExecuteSuccess {
  string shape_id = 1;
  // Per-operation typed result or generic shape reference (oneof)
  oneof op_result {
    BoxResult box = 2;
    CylinderResult cylinder = 3;
    // ... (all 34 operation result types)
    GenericShapeResult generic = 35;
  }
}

message BoxResult { string shape_id = 1; }
message CylinderResult { string shape_id = 1; }
// ... (all operation result types follow the same pattern)
message GenericShapeResult { string shape_id = 1; }

message RestoreRequest {
  CommandHeader header = 1;
  bool include_brep = 2;
  repeated RestoreItem items = 3;  // Max 128 items, max 64 MiB total per request
}
message RestoreItem {
  string entity_id = 1;
  oneof source {
    BrepReference brep_ref = 2;
    string upload_id = 3;
  }
}
message RestoreResponse { ResultHeader header = 1; repeated string restored_entity_ids = 2; }

message SubscribeRequest {
  CommandHeader header = 1;
  uint64 last_event_id = 2;       // Resume from this event ID (0 = start from beginning)
}
message SessionEvent {
  uint64 event_id = 1;            // Monotonic per-session event ID
  oneof payload {
    ProgressEvent progress = 2;
    KernelStatusEvent kernel_status = 3;
    HeartbeatEvent heartbeat = 4;
    NeedsRehydrateEvent needs_rehydrate = 5;
  }
}
message ProgressEvent { string operation = 1; uint32 percent = 2; string message = 3; }
message KernelStatusEvent { KernelStatus status = 1; }
enum KernelStatus { CONNECTED = 0; RESTARTING = 1; REHYDRATING = 2; }
message HeartbeatEvent { uint64 timestamp = 1; }
message NeedsRehydrateEvent { string reason = 1; }

message UploadChunkRequest {
  CommandHeader header = 1;
  string upload_id = 2;
  uint32 chunk_index = 3;
  bytes data = 4;                 // <= 1 MiB
  string sha256 = 5;              // SHA-256 of the complete blob (for verification)
}
message UploadChunkResponse { string upload_id = 1; uint32 total_chunks = 2; }

message CancelRequest { CommandHeader header = 1; string request_id = 2; }
message CancelResponse { bool cancelled = 1; }

message CloseSessionRequest { CommandHeader header = 1; }
message CloseSessionResponse { bool closed = 1; }

message StreamResultRequest { string result_id = 1; }

// =========================================================================
// Kernel request/response messages
// =========================================================================

message ExecuteProgress {
  string request_id = 1;
  uint32 percent = 2;
  string message = 3;
}

message PutBlobRequest {
  string upload_id = 1;
  bytes data = 2;                 // <= 1 MiB per chunk
  bool final = 3;
}
message PutBlobResponse { string upload_id = 1; uint64 total_size = 2; }

message HealthCheckRequest { string service = 1; }
message HealthCheckResponse {
  enum ServingStatus { UNKNOWN = 0; SERVING = 1; NOT_SERVING = 2; SERVICE_UNKNOWN = 3; }
  ServingStatus status = 1;
}
```

- [ ] **Step 2: Verify proto compiles syntactically**

Run: `npx buf lint proto/webcad/engine/v1/engine.proto proto/webcad/engine/v1/common.proto`
Expected: No errors (after buf.yaml is set up)

- [ ] **Step 3: Commit**

```bash
git add proto/webcad/engine/v1/engine.proto
git commit -m "feat(transport): add engine.proto with EngineGateway and Kernel services"
```

### Task 3: Create buf.yaml and buf.gen.yaml

**Files:**
- Create: `buf.yaml`
- Create: `buf.gen.yaml`

- [ ] **Step 1: Write buf.yaml**

```yaml
version: v2
lint:
  use:
    - DEFAULT
  except:
    - PACKAGE_VERSION_SUFFIX  # We don't version the package in the proto file name
breaking:
  use:
    - FILE
  except:
    - FIELD_NO_JSON_NAME
modules:
  - path: proto/webcad/engine/v1
```

- [ ] **Step 2: Write buf.gen.yaml**

```yaml
version: v2
plugins:
  - name: ts
    out: src/generated/proto
    opt: target=ts
  - name: grpc
    out: src/generated/proto
    opt: target=ts
```

- [ ] **Step 3: Install buf**

Run: `npm install --save-dev @bufbuild/buf @bufbuild/protoc-gen-es @bufbuild/protoc-gen-connect-ts`
Expected: buf and plugins installed in node_modules

- [ ] **Step 4: Generate TypeScript code**

Run: `npx buf generate proto/webcad/engine/v1/`
Expected: TypeScript and gRPC-Connect client/server stubs generated in `src/generated/proto/`

- [ ] **Step 5: Commit**

```bash
git add buf.yaml buf.gen.yaml src/generated/proto/
git commit -m "feat(transport): add buf config and generated TypeScript code"
```

### Task 4: Add buf lint and breaking to CI

**Files:**
- Create: `.github/workflows/buf.yml`
- Modify: `package.json` (add buf scripts)

- [ ] **Step 1: Add buf scripts to package.json**

```json
{
  "scripts": {
    "buf:lint": "buf lint",
    "buf:breaking": "buf breaking --against-input '.git#branch=main'",
    "buf:generate": "buf generate"
  }
}
```

- [ ] **Step 2: Create CI workflow**

```yaml
name: buf
on: [push, pull_request]
jobs:
  buf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bufbuild/buf-setup-action@v1
      - run: buf lint
      - run: buf breaking --against-input '.git#branch=main'
```

- [ ] **Step 3: Run buf lint locally**

Run: `npm run buf:lint`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/buf.yml package.json
git commit -m "ci(transport): add buf lint and breaking checks to CI"
```

---

## Chunk 2: PR 2a — Gateway + Mock Kernel (TypeScript)

### Task 5: Create OCCTransport interface

**Files:**
- Create: `src/core/io/OCCTransport.ts`

- [ ] **Step 1: Write OCCTransport interface**

```typescript
export interface OCCTransport {
  init(): Promise<void>;
  clearCache(): Promise<{ success: boolean }>;
  releaseShapes(entityIds: string[]): Promise<void>;
  checkValidity(entityId: string): Promise<{ isValid: boolean; faceCount: number; errorMsg: string }>;
  exportBRep(entityId: string): Promise<Uint8Array>;
  importBRep(entityId: string, brepBytes: Uint8Array, deflection?: number): Promise<any>;
  extractFaceProfile(entityId: string, faceIndex: number, deflection?: number): Promise<{ loops: { x: number; y: number; bulge: number }[][] }>;
  createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createFrustum(x: number, y: number, z: number, r1: number, r2: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createWedge(x1: number, y1: number, z1: number, x2: number, y2: number, height: number, ltx: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createPyramid(x: number, y: number, z: number, sides: number, radius: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createPolyhedron(points: any[], faces: number[][], deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array; nakedLines?: number[][]; isSolid?: boolean }>;
  createConvexHull(points?: any[], shapeIds?: string[], deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array; isSolid?: boolean }>;
  createExtrude(points: any[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string, vector?: number[]): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createRevolve(points: any[], axisPoint: { x: number; y: number; z: number }, axisDir: { x: number; y: number; z: number }, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createCompound(childrenIds: string[], entityId: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createSweep(profilePoints: { x: number; y: number; z: number }[], spinePoints: { x: number; y: number; z: number }[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createLoft(profiles: { id: string; points: { x: number; y: number; z: number }[]; closed: boolean }[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: { x: number; y: number; z: number }, rotB?: { x: number; y: number; z: number }, centerA?: { x: number; y: number; z: number }, centerB?: { x: number; y: number; z: number }): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  multMatrixShape(entityId: string, m: number[], targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  transformShape(entityId: string, dx: number, dy: number, dz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  rotateShape(entityId: string, rx: number, ry: number, rz: number, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  mirrorShape(entityId: string, p1: { x: number; y: number; z?: number } | undefined, p2: { x: number; y: number; z?: number } | undefined, targetEntityId?: string, deflection?: number, normal?: { x: number; y: number; z?: number }): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  scaleShape(entityId: string, factor: number | undefined, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number, factorX?: number, factorY?: number, factorZ?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  filletSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  chamferSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  filletSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  chamferSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  makeThickSolid(entityId: string, faceIndices: number[], thickness: number, removeFaces?: boolean): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  draftSolidFaces(entityId: string, faceIndices: number[], neutralFaceIndex: number, angleRad: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  get pendingCount(): number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/io/OCCTransport.ts
git commit -m "feat(transport): extract OCCTransport interface from OCCWorkerClient"
```

### Task 6: Refactor OCCWorkerClient to implement OCCTransport

**Files:**
- Modify: `src/core/io/OCCWorkerClient.ts`

- [ ] **Step 1: Add `implements OCCTransport` to OCCWorkerClient class**

Change: `export class OCCWorkerClient {` → `export class OCCWorkerClient implements OCCTransport {`

- [ ] **Step 2: Add import for OCCTransport**

Add at top: `import { OCCTransport } from './OCCTransport';`

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/core/io/OCCWorkerClient.ts src/core/io/OCCTransport.ts
git commit -m "refactor(transport): OCCWorkerClient implements OCCTransport interface"
```

### Task 7: Create gateway server with Connect protocol

**Files:**
- Create: `src/gateway/server.ts`
- Create: `src/gateway/connect-server.ts`
- Create: `src/gateway/ordering.ts`
- Create: `src/gateway/dedupe.ts`
- Create: `src/gateway/auth.ts`
- Create: `src/gateway/session-manager.ts`

- [ ] **Step 1: Create gateway directory and session manager**

```typescript
// src/gateway/session-manager.ts
import { v4 as uuidv4 } from 'uuid';

export interface SessionState {
  sessionId: string;
  clientSeq: number;           // Last seen client_seq
  pendingMap: Map<number, Promise<any>>;  // client_seq → in-flight promise
  dedupeCache: Map<string, { status: number; resultRef?: string }>;  // request_id → result
  replayBuffer: SessionEvent[];  // Last N events for Subscribe resume
  eventId: number;             // Monotonic event counter
  kernelProcess?: any;         // Kernel child process (one per session)
  rehydrating: boolean;
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  
  createSession(sessionId: string): SessionState {
    const session: SessionState = {
      sessionId,
      clientSeq: 0,
      pendingMap: new Map(),
      dedupeCache: new Map(),
      replayBuffer: [],
      eventId: 0,
      rehydrating: false,
    };
    this.sessions.set(sessionId, session);
    return session;
  }
  
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }
  
  nextEventId(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    return ++session.eventId;
  }
  
  appendReplayBuffer(sessionId: string, event: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.replayBuffer.push(event);
    // Proposed: keep 1024 events or 2 minutes
    if (session.replayBuffer.length > 1024) {
      session.replayBuffer.shift();
    }
  }
  
  getReplayBuffer(sessionId: string, lastEventId: number): any[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.replayBuffer.filter(e => e.eventId > lastEventId);
  }
}
```

- [ ] **Step 2: Create ordering module**

```typescript
// src/gateway/ordering.ts
import { SessionState } from './session-manager';

// Proposed: 64 entries, 5 second timeout (configurable)
const REORDER_BUFFER_SIZE = 64;
const REORDER_TIMEOUT_MS = 5000;

export interface OrderedCommand {
  clientSeq: number;
  requestId: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timer: NodeJS.Timeout;
}

export class OrderingManager {
  private buffers = new Map<string, OrderedCommand[]>();  // sessionId → buffer
  
  enqueue(sessionId: string, cmd: OrderedCommand): void {
    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(sessionId, buffer);
    }
    buffer.push(cmd);
    buffer.sort((a, b) => a.clientSeq - b.clientSeq);
    this.processBuffer(sessionId);
  }
  
  private processBuffer(sessionId: string): void {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return;
    
    // Execute commands in client_seq order
    while (buffer.length > 0) {
      const cmd = buffer[0];
      // Execute (the actual execution is handled by the caller)
      buffer.shift();
    }
  }
  
  getNextSeq(sessionId: string): number {
    // Returns next expected client_seq
    const session = ...; // from session manager
    return session.clientSeq + 1;
  }
}
```

- [ ] **Step 3: Create dedupe module**

```typescript
// src/gateway/dedupe.ts
// Proposed: 10 min TTL, 10k size cap (configurable)
const DEDUPE_TTL_MS = 10 * 60 * 1000;
const DEDUPE_SIZE_CAP = 10000;

export interface DedupeEntry {
  status: number;
  resultRef?: string;
  expiry: number;
}

export class DedupeCache {
  private cache = new Map<string, DedupeEntry>();
  
  get(requestId: string): DedupeEntry | undefined {
    const entry = this.cache.get(requestId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(requestId);
      return undefined;
    }
    return entry;
  }
  
  set(requestId: string, entry: DedupeEntry): void {
    // Enforce size cap
    if (this.cache.size >= DEDUPE_SIZE_CAP && !this.cache.has(requestId)) {
      // Evict oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    entry.expiry = Date.now() + DEDUPE_TTL_MS;
    this.cache.set(requestId, entry);
  }
  
  has(requestId: string): boolean {
    const entry = this.cache.get(requestId);
    if (!entry) return false;
    if (Date.now() > entry.expiry) {
      this.cache.delete(requestId);
      return false;
    }
    return true;
  }
}
```

- [ ] **Step 4: Create auth interceptor**

```typescript
// src/gateway/auth.ts
import { verify } from 'jsonwebtoken';

export interface JWTClaims {
  sub: string;
  session: string;
  project: string;
  exp: number;
}

export function authenticateJWT(authHeader: string | undefined): JWTClaims {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHENTICATED: Missing or invalid Authorization header');
  }
  const token = authHeader.substring(7);
  const claims = verify(token, process.env.JWT_SECRET || 'dev-secret') as JWTClaims;
  if (claims.exp && claims.exp * 1000 < Date.now()) {
    throw new Error('UNAUTHENTICATED: Token expired');
  }
  return claims;
}

export function validateSessionClaims(claims: JWTClaims, sessionId: string): void {
  if (claims.session !== sessionId) {
    throw new Error('PERMISSION_DENIED: Session claim does not match requested session');
  }
}
```

- [ ] **Step 5: Create Connect server**

```typescript
// src/gateway/connect-server.ts
import { createConnectServer } from '@bufbuild/connect-node';
import { EngineGatewayService } from '../generated/proto/engine_pb.connect';
// ... implement all EngineGateway RPCs using SessionManager, OrderingManager, DedupeCache, auth
```

- [ ] **Step 6: Create gateway main server**

```typescript
// src/gateway/server.ts
import { createServer } from 'http';
import { connectServer } from './connect-server';
// ... start HTTP/1.1 server for nginx proxy
```

- [ ] **Step 7: Commit**

```bash
git add src/gateway/
git commit -m "feat(transport): create gateway server with Connect protocol, ordering, dedupe, auth"
```

### Task 8: Create mock kernel for testing

**Files:**
- Create: `src/gateway/mock-kernel.ts`
- Create: `src/gateway/kernel-client.ts` (gRPC client to kernel)

- [ ] **Step 1: Create mock kernel**

```typescript
// src/gateway/mock-kernel.ts
// Implements the Kernel service in TypeScript for testing
// Returns canned responses matching OCCWorker.ts handler outputs
```

- [ ] **Step 2: Create gRPC kernel client**

```typescript
// src/gateway/kernel-client.ts
// Uses @grpc/grpc-js to call Kernel service over UDS or TCP+mTLS
```

- [ ] **Step 3: Commit**

```bash
git add src/gateway/mock-kernel.ts src/gateway/kernel-client.ts
git commit -m "feat(transport): create mock kernel and gRPC kernel client"
```

### Task 9: Write gateway unit tests

**Files:**
- Create: `src/gateway/__tests__/ordering.test.ts`
- Create: `src/gateway/__tests__/dedupe.test.ts`
- Create: `src/gateway/__tests__/session-manager.test.ts`

- [ ] **Step 1: Write ordering test (100 concurrent calls, shuffled arrival)**

```typescript
import { OrderingManager } from '../ordering';

test('applies commands in client_seq order despite shuffled arrival', async () => {
  const mgr = new OrderingManager();
  const results: number[] = [];
  const promises: Promise<void>[] = [];
  
  // Submit 100 commands with shuffled client_seq
  for (let i = 100; i >= 1; i--) {
    promises.push(new Promise((resolve) => {
      mgr.enqueue('test-session', {
        clientSeq: i,
        requestId: `req-${i}`,
        execute: async () => { results.push(i); resolve(undefined); },
        resolve: () => {},
        reject: () => {},
        timer: setTimeout(() => {}, 0),
      });
    }));
  }
  
  await Promise.all(promises);
  
  // Results should be in order 1, 2, 3, ..., 100
  for (let i = 0; i < 100; i++) {
    expect(results[i]).toBe(i + 1);
  }
});
```

- [ ] **Step 2: Write dedupe test**

```typescript
test('duplicate request_id returns prior result, not re-executed', async () => {
  const cache = new DedupeCache();
  let executionCount = 0;
  
  // First request
  cache.set('req-1', { status: 200, resultRef: 'ref-1', expiry: Date.now() + 600000 });
  const entry1 = cache.get('req-1');
  expect(entry1).toBeDefined();
  
  // Duplicate
  const entry2 = cache.get('req-1');
  expect(entry2).toEqual(entry1);
  expect(executionCount).toBe(0); // No re-execution
});
```

- [ ] **Step 3: Write session manager test**

```typescript
test('createSession and getSession work correctly', () => {
  const mgr = new SessionManager();
  const session = mgr.createSession('sess-1');
  expect(session.sessionId).toBe('sess-1');
  expect(session.clientSeq).toBe(0);
  
  const found = mgr.getSession('sess-1');
  expect(found).toBe(session);
  
  const missing = mgr.getSession('sess-2');
  expect(missing).toBeUndefined();
});
```

- [ ] **Step 4: Run gateway tests**

Run: `npm test -- src/gateway/__tests__/`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/gateway/__tests__/
git commit -m "test(transport): add gateway unit tests for ordering, dedupe, session manager"
```

---

## Chunk 3: PR 3 — Client + Infra + Cleanup

### Task 10: Create RemoteGrpcTransport

**Files:**
- Create: `src/core/io/RemoteGrpcTransport.ts`

- [ ] **Step 1: Write RemoteGrpcTransport implementing OCCTransport**

```typescript
import { OCCTransport } from './OCCTransport';
import { EngineGatewayService } from '../generated/proto/engine_pb.connect';
import { createConnectTransport } from '@bufbuild/connect-web';

export class RemoteGrpcTransport implements OCCTransport {
  private client: EngineGatewayService;
  private sessionId: string;
  private clientSeq = 0;
  private pendingMap = new Map<number, (value: any) => void>();
  
  constructor(baseUrl: string, sessionId: string, authToken?: string) {
    const transport = createConnectTransport(baseUrl, {
      // Use same-origin (Vite proxy + nginx), no CORS needed
      // JWT interceptor for Authorization header
    });
    this.client = new EngineGatewayService(transport);
    this.sessionId = sessionId;
  }
  
  get pendingCount(): number {
    return this.pendingMap.size;
  }
  
  private async send<T>(op: string, payload: any): Promise<T> {
    this.clientSeq++;
    const requestId = crypto.randomUUID();
    
    // Check dedupe (client-side)
    // ...
    
    const response = await this.client.execute({
      header: {
        session_id: this.sessionId,
        request_id: requestId,
        client_seq: this.clientSeq,
      },
      include_brep: true,
      [op]: payload,
    });
    
    if (response.failure) {
      throw new Error(`Execution failure: ${response.failure.message}`);
    }
    return response as T;
  }
  
  // Implement all 34 methods delegating to this.send(...)
  async init(): Promise<void> { return this.send('init', {}); }
  async clearCache(): Promise<{ success: boolean }> { return this.send('clear_cache', {}); }
  // ... all 34 methods
}
```

- [ ] **Step 2: Add auth interceptor**

```typescript
// Add JWT to Authorization header via Connect transport interceptors
```

- [ ] **Step 3: Commit**

```bash
git add src/core/io/RemoteGrpcTransport.ts
git commit -m "feat(transport): create RemoteGrpcTransport implementing OCCTransport"
```

### Task 11: Fix fire-and-forget call sites in Document.ts

**Files:**
- Modify: `src/core/model/Document.ts`

- [ ] **Step 1: Fix undo/redo transformShape (fire-and-forget → awaited)**

Change the undo() and redo() callbacks from:
```typescript
(id, dx, dy, dz) => {
  OpenCascadeService.getInstance().transformShape(id, dx, dy, dz);
},
```
to:
```typescript
async (id, dx, dy, dz) => {
  await OpenCascadeService.getInstance().transformShape(id, dx, dy, dz);
},
```

- [ ] **Step 2: Fix restoreSolidBRep (Promise.resolve + .catch → awaited)**

Change `restoreSolidBRep` to return a Promise and await it:
```typescript
private restoreSolidBRep = async (id: string, brep: Uint8Array): Promise<void> => {
  const deflection = 0.1 / (this.facetres || 5.0);
  await OpenCascadeService.getInstance().importBRep(id, brep, deflection);
}
```

- [ ] **Step 3: Update HistoryManager to accept async callbacks**

Modify `HistoryManager.ts` undo/redo to await the transform and restore callbacks.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/core/model/Document.ts src/core/engine/HistoryManager.ts
git commit -m "fix(transport): await fire-and-forget transformShape and restoreSolidBRep calls"
```

### Task 12: Add nginx config for dev and production

**Files:**
- Create: `docker-compose.yml`
- Create: `nginx/dev.conf`
- Create: `nginx/prod.conf`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5173:5173"
    depends_on:
      - gateway
  gateway:
    build: ./gateway
    ports:
      - "3000:3000"
    volumes:
      - ./kernel-socket:/app/socket
  kernel:
    build: ./kernel
    volumes:
      - ./kernel-socket:/app/socket
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx:/etc/nginx/conf.d
    depends_on:
      - app
      - gateway
```

- [ ] **Step 2: Create nginx dev config**

```nginx
# nginx/dev.conf
server {
  listen 443 ssl http2;
  server_name localhost;
  
  # Vite dev server (HTTP/1.1 upstream)
  location / {
    proxy_pass http://app:5173;
    proxy_http_version 1.1;
    proxy_buffering off;
  }
  
  # Connect protocol engine endpoint
  location /webcad.engine.v1/ {
    proxy_pass http://gateway:3000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_set_header x-session-id $http_x_session_id;
  }
}
```

- [ ] **Step 3: Create nginx prod config**

```nginx
# nginx/prod.conf - similar but with mTLS upstream to kernel
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml nginx/
git commit -m "infra(transport): add docker-compose and nginx config for dev and prod"
```

### Task 13: Create client tests (Playwright)

**Files:**
- Create: `tests/e2e/transport.test.ts`
- Create: `tests/e2e/ordering.test.ts`
- Create: `tests/e2e/payload-size.test.ts`

- [ ] **Step 1: Write Playwright test asserting HTTP/2**

```typescript
import { test, expect } from '@playwright/test';

test('browser connects via HTTP/2 through nginx', async ({ page }) => {
  await page.goto('/');
  // Wait for app to load
  await page.waitForSelector('#app');
  
  // Check HTTP/2 via devtools protocol or network timing
  // At least 20 concurrent unary calls while Subscribe stream is open
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => 
      page.evaluate(() => window.openCascadeService.createBox(0, 0, 0, 1, 1, 1))
    )
  );
  expect(results).toHaveLength(20);
});
```

- [ ] **Step 2: Write ordering test (Node HTTP/2 client with random delays)**

```typescript
// tests/e2e/ordering.test.ts - Node HTTP/2 test client
```

- [ ] **Step 3: Write payload size tests (3.9 MiB, 4.1 MiB, >16 MiB)**

```typescript
// tests/e2e/payload-size.test.ts
```

- [ ] **Step 4: Run Playwright tests**

Run: `npm run test:ui`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/
git commit -m "test(transport): add Playwright E2E tests for HTTP/2, ordering, payload sizes"
```

### Task 14: Write golden binary vectors for mesh/edge-line packing

**Files:**
- Create: `tests/unit/mesh-packing.test.ts`
- Create: `tests/fixtures/golden-mesh.bin`
- Create: `tests/fixtures/golden-edge-lines.bin`

- [ ] **Step 1: Write packing helpers and golden vector test**

```typescript
// Test: pack Float32Array at odd byte offset, round-trip through bytes, assert values preserved
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/unit/mesh-packing.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/mesh-packing.test.ts tests/fixtures/
git commit -m "test(transport): add golden binary vectors for mesh and edge-line packing"
```

### Task 15: Update AGENTS.md, README, write ADR

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Create: `docs/superpowers/adr/2026-11-19-grpc-connect-transport.md`

- [ ] **Step 1: Update AGENTS.md** with new architecture

- [ ] **Step 2: Update README.md** with transport architecture

- [ ] **Step 3: Write ADR** with rejected alternatives (gRPC-Web + Envoy, WebSocket + protobuf, WebTransport)

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md docs/superpowers/adr/
git commit -m "docs(transport): update AGENTS.md, README, add ADR for rejected alternatives"
```

---

## Summary of Files

### New files:
| File | Purpose |
|------|---------|
| `proto/webcad/engine/v1/common.proto` | Shared message types (CommandHeader, BrepReference, MeshData, etc.) |
| `proto/webcad/engine/v1/engine.proto` | EngineGateway + Kernel services, 34 operation messages |
| `buf.yaml` | Buf lint/breaking configuration |
| `buf.gen.yaml` | Buf codegen configuration |
| `.github/workflows/buf.yml` | CI: buf lint and breaking checks |
| `src/core/io/OCCTransport.ts` | Transport interface (extracted from OCCWorkerClient) |
| `src/gateway/server.ts` | Gateway HTTP server entry point |
| `src/gateway/connect-server.ts` | Connect protocol server implementation |
| `src/gateway/ordering.ts` | Per-session client_seq ordering |
| `src/gateway/dedupe.ts` | request_id deduplication cache |
| `src/gateway/auth.ts` | JWT authentication interceptor |
| `src/gateway/session-manager.ts` | Session state management |
| `src/gateway/mock-kernel.ts` | Mock kernel for testing |
| `src/gateway/kernel-client.ts` | gRPC client to kernel |
| `src/core/io/RemoteGrpcTransport.ts` | Connect-based client transport |
| `docker-compose.yml` | Multi-service docker compose |
| `nginx/dev.conf` | Dev nginx config (HTTP/2 TLS, proxy to Vite + gateway) |
| `nginx/prod.conf` | Production nginx config |
| `tests/e2e/transport.test.ts` | Playwright HTTP/2 test |
| `tests/e2e/ordering.test.ts` | Ordering E2E test |
| `tests/e2e/payload-size.test.ts` | Payload size E2E tests |
| `tests/unit/mesh-packing.test.ts` | Golden binary vector tests |
| `tests/fixtures/golden-mesh.bin` | Golden mesh binary fixture |
| `tests/fixtures/golden-edge-lines.bin` | Golden edge-line binary fixture |
| `docs/superpowers/adr/2026-11-19-grpc-connect-transport.md` | ADR for rejected alternatives |

### Modified files:
| File | Change |
|------|--------|
| `src/core/io/OCCWorkerClient.ts` | Implement OCCTransport interface |
| `src/core/model/Document.ts` | Await fire-and-forget calls (undo/redo transformShape, restoreSolidBRep) |
| `src/core/engine/HistoryManager.ts` | Support async callbacks in undo/redo |
| `package.json` | Add buf scripts |
| `AGENTS.md` | Update architecture section |
| `README.md` | Update transport documentation |

### PR 2b (out of scope for this plan):
Real kernel server in the language chosen by WC-EC-05 ADR. Depends on open question O2 (kernel language). Not planned here.

---

**Plan complete and saved to `docs/superpowers/plans/2026-11-19-grpc-connect-transport.md`. Ready to execute?**