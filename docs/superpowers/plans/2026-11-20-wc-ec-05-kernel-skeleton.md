# WC-EC-05 Kernel Skeleton — Native OCCT 7.9.3 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a native OCCT 7.9.3 kernel worker process (C++17) behind gRPC over UDS, with `Kernel.Execute(ExecuteRequest) -> ExecuteResponse`, plus a Node gateway supervisor that spawns/pools/respawns kernel processes per session. WASM worker remains as offline/preview fallback.

**Architecture:** Browser → Connect (RemoteGrpcTransport) → EngineGatewayService (relay) → native gRPC over UDS → Kernel.Execute → OCCT 7.9.3 → ExecuteResponse (MeshData + opt-in BrepReference). One kernel process per session; supervisor pools warm spares; crash → REHYDRATING → Restore → replay aborted commands.

**Tech Stack:** C++17, OCCT 7.9.3 (shared lib, dynamic linking), protobuf C++, gRPC C++ (or length-prefixed protobuf fallback), Node.js gateway, TypeScript, `@grpc/grpc-js` v1.14.7, `@connectrpc/connect` v2.3.0

**Spec reference:** `docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md`

**Related tickets:** WC-EC-08 (OCCT build image), WC-EC-09 (protocol spec), WC-EC-10 (kernel worker skeleton), WC-EC-11 (gateway supervisor), WC-EC-12 (parity harness), WC-EC-33 (density measurement)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `proto/webcad/engine/v1/engine.proto` | Modify | Add `KernelService`, `KernelExecuteRequest`, `KernelExecuteResponse`, `MeshData`, `BrepReference`, `ExecuteFailure`, `ExecuteFailureCode` |
| `proto/webcad/engine/v1/common.proto` | Modify | Add shared message types if not already present |
| `CMakeLists.txt` | Create | Kernel C++ build: OCCT modules, protobuf, gRPC (or fallback) |
| `Dockerfile.kernel` | Create | Multi-stage OCCT 7.9.3 build image, `OCCT_VERSION` build arg |
| `src/core/gateway/kernel-worker.cpp` | Create | C++ gRPC server: `Kernel.Execute`, OCCT 7.9.3 wrapper, B-rep pre-validation on importBRep/Restore |
| `src/core/gateway/kernel-supervisor.ts` | Create | Node: spawn/pool/respawn kernel processes, UDS framing, health checks |
| `src/core/gateway/kernel-client.ts` | Modify | gRPC client for gateway→kernel; add retry rules (UNAVAILABLE/ABORTED + request_id) |
| `src/core/io/OCCTransport.ts` | Modify | Add kernel transport path alongside WASM |
| `src/core/io/RemoteGrpcTransport.ts` | No change | Unchanged (browser→gateway Connect transport) |
| `src/core/io/OpenCascadeService.ts` | Modify | Route kernel-capable ops through kernel transport; WASM fallback for others |
| `tests/unit/kernel/kernel-supervisor.test.ts` | Create | Unit tests for supervisor spawn/pool/respawn |
| `tests/unit/kernel/kernel-client.test.ts` | Create | Unit tests for client retry rules |
| `tests/e2e/kernel-roundtrip.spec.ts` | Create | E2E: Connect round trip using generated service |

---

## Chunk 1: Protocol Spec (WC-EC-09)

### Task 1.1: Write the failing protobuf test

**Files:**
- Modify: `proto/webcad/engine/v1/engine.proto`

```protobuf
// Add to engine.proto — Kernel service definition
syntax = "proto3";
package webcad.engine.v1;

option go_package = "webcad/engine/v1";

// ... existing messages ...

// Kernel service messages
message KernelExecuteRequest {
  string session_id = 1;
  string command = 2;          // e.g. "createBox", "importBRep", "Restore"
  bytes payload = 3;           // serialized command-specific payload
  bool include_brep = 4;       // stage 1: client sends brepSnapshot
  string brep_snapshot = 5;    // stage 1: client-authoritative B-rep
}

message KernelExecuteResponse {
  string session_id = 1;
  string command = 2;
  oneof result {
    MeshData mesh_data = 3;
    BrepReference brep_reference = 4;
  }
  ExecuteFailure failure = 5;
}

message MeshData {
  repeated float vertices = 1;
  repeated uint32 indices = 2;
  repeated float normals = 3;
  repeated float uvs = 4;
}

message BrepReference {
  string brep_id = 1;
  int64 revision = 2;
}

message ExecuteFailure {
  ExecuteFailureCode code = 1;
  string message = 2;
  string request_id = 3;
}

enum ExecuteFailureCode {
  EXECUTE_FAILURE_UNSPECIFIED = 0;
  EXECUTE_FAILURE_INVALID_INPUT = 1;
  EXECUTE_FAILURE_OCCT_EXCEPTION = 2;
  EXECUTE_FAILURE_TIMEOUT = 3;
  EXECUTE_FAILURE_UNAVAILABLE = 4;
  EXECUTE_FAILURE_ABORTED = 5;
}

service KernelService {
  rpc Execute(KernelExecuteRequest) returns (KernelExecuteResponse);
}
```

- [ ] **Step 1: Write the failing protobuf definition**

Add `KernelService` and messages to `engine.proto`.

- [ ] **Step 2: Verify protobuf compiles**

Run: `protoc --proto_path=proto --ts_out=src/generated proto/webcad/engine/v1/engine.proto`

Expected: protoc generates TypeScript stubs without errors.

- [ ] **Step 3: Commit**

```bash
git add proto/webcad/engine/v1/engine.proto
git commit -m "feat(wc-ec-09): add KernelService protobuf schema"
```

---

## Chunk 2: OCCT Build Image (WC-EC-08)

### Task 2.1: Write CMakeLists.txt for kernel build

**Files:**
- Create: `CMakeLists.txt`

```cmake
cmake_minimum_required(VERSION 3.16)
project(kernel LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OCCT version arg (passed via -DOCCT_VERSION=7.9.3 or Docker build arg)
if(NOT DEFINED OCCT_VERSION)
  set(OCCT_VERSION "V7_9_3")
endif()

find_package(OpenCASCADE REQUIRED COMPONENTS
  TKernel TKMath TKBRep TKGeomBase TKGeomAlgo TKTopAlgo TKPrim TKBool TKBO TKFillet TKOffset TKShHealing TKMesh TKBin TKDESTEP TKDEIGES
)

# gRPC + protobuf (or length-prefixed fallback)
find_package(protobuf REQUIRED)
find_package(gRPC REQUIRED)

add_executable(kernel_worker
  src/core/gateway/kernel-worker.cpp
)

target_link_libraries(kernel_worker PRIVATE
  OpenCASCADE::TKernel OpenCASCADE::TKMath OpenCASCADE::TKBRep
  OpenCASCADE::TKGeomBase OpenCASCADE::TKGeomAlgo OpenCASCADE::TKTopAlgo
  OpenCASCADE::TKPrim OpenCASCADE::TKBool OpenCASCADE::TKBO
  OpenCASCADE::TKFillet OpenCASCADE::TKOffset OpenCASCADE::TKShHealing
  OpenCASCADE::TKMesh OpenCASCADE::TKBin OpenCASCADE::TKDESTEP OpenCASCADE::TKDEIGES
  protobuf::libprotobuf grpc::grpc++
)

# Platform-specific flags
if(MSVC)
  target_compile_options(kernel_worker PRIVATE /EHa /utf-8 /bigobj)
else()
  target_compile_options(kernel_worker PRIVATE -Wswitch)
  target_compile_definitions(kernel_worker PRIVATE OCC_CONVERT_SIGNALS)
endif()
```

- [ ] **Step 1: Write CMakeLists.txt**

Create at repo root with OCCT 7.9.3 toolkit list (explicit, not umbrella).

- [ ] **Step 2: Verify CMake configures**

Run: `cmake -S . -B build/kernel -DOCCT_VERSION=V7_9_3`

Expected: CMake finds OpenCASCADE packages, configures without errors.

- [ ] **Step 3: Commit**

```bash
git add CMakeLists.txt
git commit -m "feat(wc-ec-08): add CMakeLists.txt for OCCT kernel build"
```

### Task 2.2: Write Dockerfile.kernel

**Files:**
- Create: `Dockerfile.kernel`

```dockerfile
ARG OCCT_VERSION=V7_9_3

# Stage 1: Build OCCT dependencies
FROM ubuntu:22.04 AS deps
ARG OCCT_VERSION
RUN apt-get update && apt-get install -y \
  build-essential cmake git libfreeglut3-dev libx11-dev \
  libxext-dev libxft-dev libxmu-dev libxpm-dev libxrandr-dev \
  libglew-dev libfreetype6-dev libfontconfig1-dev \
  libglu1-mesa-dev libxcursor-dev libxi-dev libxt-dev \
  && rm -rf /var/lib/apt/lists/*

# Stage 2: Build OCCT 7.9.3
FROM deps AS occt
ARG OCCT_VERSION
WORKDIR /occt
RUN git clone --branch ${OCCT_VERSION} --depth 1 https://git.dev.opencascade.org/gitweb/?p=occt.git;o=plain /occt-src \
  && mkdir build && cd build \
  && cmake ../occt-src -DCMAKE_BUILD_TYPE=Release -DBUILD_MODULE_ApplicationFramework=ON \
    -DBUILD_MODULE_DataExchange=ON -DBUILD_MODULE_FoundationClasses=ON \
    -DBUILD_MODULE_ModelingAlgorithms=ON -DBUILD_MODULE_ModelingData=ON \
    -DBUILD_MODULE_Presentation=OFF -DBUILD_MODULE_Visualization=OFF \
    -DBUILD_MODULE_ViewerFramework=OFF -DBUILD_MODULE_Draw=OFF \
  && make -j$(nproc) && make install

# Stage 3: Kernel worker
FROM occt AS kernel
WORKDIR /kernel
COPY CMakeLists.txt ./
COPY src/core/gateway/kernel-worker.cpp ./src/core/gateway/
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j$(nproc)

CMD ["./build/kernel_worker"]
```

- [ ] **Step 1: Write Dockerfile.kernel**

Multi-stage: OCCT 7.9.3 build + kernel worker.

- [ ] **Step 2: Verify Dockerfile syntax**

Run: `docker build --help | head -1` (just verify docker is available)

Expected: Docker CLI available.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile.kernel
git commit -m "feat(wc-ec-08): add Dockerfile.kernel for OCCT 7.9.3 build image"
```

---

## Chunk 3: Kernel Worker Skeleton (WC-EC-10)

### Task 3.1: Write kernel-worker.cpp — gRPC server skeleton

**Files:**
- Create: `src/core/gateway/kernel-worker.cpp`

```cpp
// Kernel worker: OCCT 7.9.3 wrapped behind gRPC Kernel.Execute
#include <grpcpp/grpcpp.h>
#include "engine.grpc.pb.h"  // generated from engine.proto

// OCCT includes
#include <TKernel.hxx>
#include <TKBRep.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepMesh_IncrementalMesh.hxx>

// ... other OCCT includes as needed

using grpc::Server;
using grpc::ServerBuilder;
using grpc::ServerContext;
using grpc::Status;
using webcad::engine::v1::KernelExecuteRequest;
using webcad::engine::v1::KernelExecuteResponse;
using webcad::engine::v1::KernelService;
using webcad::engine::v1::ExecuteFailure;
using webcad::engine::v1::ExecuteFailureCode;

class KernelServiceImpl final : public KernelService::Service {
  Status Execute(ServerContext* context, const KernelExecuteRequest* request,
                 KernelExecuteResponse* response) override {
    response->set_session_id(request->session_id());
    response->set_command(request->command());

    try {
      if (request->command() == "createBox") {
        // TODO: parse payload, call OCCT BRepPrimAPI_MakeBox, produce MeshData
        auto* mesh = response->mutable_mesh_data();
        // populate mesh vertices/indices
      } else if (request->command() == "importBRep" || request->command() == "Restore") {
        // B-rep pre-validation: size, truncation, section counts before OCCT reader
        // TODO: implement pre-validation
      } else {
        auto* failure = response->mutable_failure();
        failure->set_code(ExecuteFailureCode::EXECUTE_FAILURE_INVALID_INPUT);
        failure->set_message("Unknown command: " + request->command());
      }
    } catch (const std::exception& e) {
      auto* failure = response->mutable_failure();
      failure->set_code(ExecuteFailureCode::EXECUTE_FAILURE_OCCT_EXCEPTION);
      failure->set_message(e.what());
    }

    return Status::OK;
  }
};

int main(int argc, char** argv) {
  std::string server_address("unix:///tmp/webcad-kernel.sock");
  KernelServiceImpl service;

  ServerBuilder builder;
  builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
  builder.RegisterService(&service);
  std::unique_ptr<Server> server(builder.BuildAndStart());
  std::cout << "Kernel listening on " << server_address << std::endl;
  server->Wait();
  return 0;
}
```

- [ ] **Step 1: Write kernel-worker.cpp skeleton**

Create C++ gRPC server with `Kernel.Execute`, OCCT includes, B-rep pre-validation stubs.

- [ ] **Step 2: Compile kernel worker**

Run: `cmake --build build/kernel --target kernel_worker -j$(nproc)`

Expected: Compiles without errors (OCCT headers found, protobuf/gRPC linked).

- [ ] **Step 3: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-10): add kernel-worker.cpp gRPC server skeleton"
```

### Task 3.2: Implement B-rep pre-validation

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

- [ ] **Step 1: Write pre-validation test**

Test that oversized/truncated B-rep is rejected before OCCT reader.

- [ ] **Step 2: Implement pre-validation**

Add size limits, truncation checks, section count validation before OCCT reader on `importBRep`/`Restore`.

- [ ] **Step 3: Run test**

Expected: Invalid B-rep returns `EXECUTE_FAILURE_INVALID_INPUT`; valid B-rep proceeds.

- [ ] **Step 4: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(wc-ec-10): add B-rep pre-validation before OCCT reader"
```

---

## Chunk 4: Gateway Supervisor (WC-EC-11)

### Task 4.1: Write kernel-supervisor.ts — process pool

**Files:**
- Create: `src/core/gateway/kernel-supervisor.ts`

```typescript
import { spawn, ChildProcess } from 'node:child_process';
import { createServer, net } from 'node:net';
import { join } from 'node:path';

interface KernelProcess {
  proc: ChildProcess;
  udsPath: string;
  sessionId: string | null;
  healthy: boolean;
  lastPing: number;
}

export class KernelSupervisor {
  private pool: Map<string, KernelProcess> = new Map();
  private warmSpares: KernelProcess[] = [];
  private readonly kernelBinary: string;
  private readonly maxSessions: number;
  private readonly crashTimeoutMs: number;

  constructor(kernelBinary: string, maxSessions: number = 50, crashTimeoutMs: number = 30000) {
    this.kernelBinary = kernelBinary;
    this.maxSessions = maxSessions;
    this.crashTimeoutMs = crashTimeoutMs;
  }

  acquireSession(sessionId: string): Promise<string> {
    // Returns UDS path for a kernel process assigned to this session
    // Uses warm spare if available, otherwise spawns new process
  }

  releaseSession(sessionId: string): void {
    // Returns kernel process to warm spare pool or terminates if at capacity
  }

  onCrash(sessionId: string): void {
    // Mark session REHYDRATING, respawn kernel, notify client to Restore + replay
  }

  healthCheck(): void {
    // Ping all kernel processes, respawn unhealthy ones
  }
}
```

- [ ] **Step 1: Write kernel-supervisor.ts**

Process pool with spawn, acquire/release, warm spares, crash handling.

- [ ] **Step 2: Write supervisor unit test**

**Files:**
- Create: `tests/unit/kernel/kernel-supervisor.test.ts`

Test spawn, acquire/release, warm spare usage, crash respawn.

- [ ] **Step 3: Run supervisor tests**

Run: `npx vitest run tests/unit/kernel/kernel-supervisor.test.ts`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/gateway/kernel-supervisor.ts tests/unit/kernel/kernel-supervisor.test.ts
git commit -m "feat(wc-ec-11): add kernel supervisor process pool"
```

### Task 4.2: Implement crash → REHYDRATING → Restore → replay

**Files:**
- Modify: `src/core/gateway/kernel-supervisor.ts`
- Modify: `src/core/gateway/kernel-client.ts`

- [ ] **Step 1: Write crash recovery test**

Test that on kernel crash, in-flight commands are aborted, session enters REHYDRATING, client Restore + replay works.

- [ ] **Step 2: Implement crash recovery**

Supervisor marks session REHYDRATING on crash; client receives UNAVAILABLE/ABORTED with request_id; client replays aborted commands in order after Restore.

- [ ] **Step 3: Run crash recovery test**

Expected: Crash → abort → REHYDRATING → Restore → replay sequence works.

- [ ] **Step 4: Commit**

```bash
git add src/core/gateway/kernel-supervisor.ts src/core/gateway/kernel-client.ts tests/unit/kernel/kernel-client.test.ts
git commit -m "feat(wc-ec-11): kernel crash recovery with REHYDRATING state"
```

---

## Chunk 5: Transport Integration & WASM Fallback

### Task 5.1: Add kernel transport to OCCTransport

**Files:**
- Modify: `src/core/io/OCCTransport.ts`

- [ ] **Step 1: Add kernel transport enum/variant**

Add `KERNEL` alongside `WASM` transport type.

- [ ] **Step 2: Implement kernel transport methods**

Route kernel-capable ops through gRPC client; fall back to WASM for unsupported ops.

- [ ] **Step 3: Run existing transport tests**

Run: `npx vitest run tests/unit/io/`

Expected: No regressions.

- [ ] **Step 4: Commit**

```bash
git add src/core/io/OCCTransport.ts
git commit -m "feat(wc-ec-05): add kernel transport to OCCTransport"
```

### Task 5.2: Route OpenCascadeService through kernel

**Files:**
- Modify: `src/core/io/OpenCascadeService.ts`

- [ ] **Step 1: Update OpenCascadeService**

Route `createBox`, `importBRep`, `Restore` and other kernel-capable ops through kernel transport; keep WASM fallback for ops not yet ported.

- [ ] **Step 2: Run unit tests**

Run: `npx vitest run tests/unit/io/`

Expected: All transport tests pass, kernel route works.

- [ ] **Step 3: Commit**

```bash
git add src/core/io/OpenCascadeService.ts
git commit -m "feat(wc-ec-05): route kernel-capable ops through native kernel"
```

---

## Chunk 6: E2E Verification

### Task 6.1: Write kernel round-trip E2E test

**Files:**
- Create: `tests/e2e/kernel-roundtrip.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test('Connect round trip via kernel: create box → mesh returned', async ({ page }) => {
  // Connect through RemoteGrpcTransport → EngineGatewayService → kernel
  // Verify MeshData is returned and rendered
});

test('Kernel crash recovery: crash → REHYDRATING → Restore → replay', async ({ page }) => {
  // Kill kernel process, verify session recovers
});
```

- [ ] **Step 1: Write E2E test**

- [ ] **Step 2: Run E2E test**

Run: `npx playwright test tests/e2e/kernel-roundtrip.spec.ts`

Expected: Kernel round trip succeeds; crash recovery works.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/kernel-roundtrip.spec.ts
git commit -m "feat(wc-ec-05): add E2E kernel round-trip test"
```

---

## Chunk 7: Acceptance & Smoke Checks

### Task 7.1: Add npm run build and dev-server smoke check

**Files:**
- No new files (existing scripts)

- [ ] **Step 1: Run npm run build**

Run: `npm run build`

Expected: Build succeeds (Vite/esbuild strips types, no typecheck).

- [ ] **Step 2: Run dev-server smoke check**

Start dev server, verify kernel can be spawned and a simple Execute round trip works.

Expected: Dev server boots, kernel process spawns, UDS connection works.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(wc-ec-05): verify npm run build and dev-server smoke check"
```

---

## Open Questions (Human Decisions)

| # | Question | Proposed Default | Status |
|---|---|---|---|
| 1 | gRPC C++ build "too heavy" — fall back to length-prefixed protobuf over UDS? | Try full gRPC first; fall back only if CI build >15 min, image >2 GB, binary >100 MB, or gRPC unavailable in target distro | Open — thresholds in ADR Section 10; pending measurement when OCCT 7.9.3 kernel is built (Chunk 6 blocker) |
| 2 | SolidCraft waiver approver | N/A — SolidCraft is for inspiration only, not a replacement kernel | Resolved |
| 3 | LGPL delivery model: hosted or distributed? | Hosted (server-side kernel); legal review needed | Resolved — hosted |
| 4 | Document.test.ts B-rep restore failure time-box? | 1 day before ADR finalized | Resolved — investigated, root cause found (un-awaited async undo/redo in redo test), test fixed with `await`, all 477 tests pass |

---

## Exit Criteria

- [ ] `npm run build` passes
- [ ] Kernel worker spawns and responds to `Kernel.Execute` via UDS
- [ ] Supervisor spawns/pools/respawns kernel processes per session
- [ ] Crash → REHYDRATING → Restore → replay works end-to-end
- [ ] B-rep pre-validation rejects invalid input before OCCT reader
- [ ] E2E Connect round trip succeeds
- [ ] No regressions in existing unit tests (`npm test` exit 0)

---

**Next step after plan approval:** Execute Chunk 1 (protocol spec), then proceed through Chunks 2–7 sequentially. Each chunk produces self-contained, committable changes.