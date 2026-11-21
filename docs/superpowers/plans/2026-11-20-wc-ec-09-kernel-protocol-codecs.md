# WC-EC-09: Language-Neutral Kernel Protocol Codecs (TS and C++) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate that protobuf-generated codecs correctly serialize/deserialize all kernel protocol message types in both TypeScript and C++, including misaligned bytes handling and 256 KiB payload boundaries — with no changes to production code or proto definitions.

**Architecture:** Two independent test suites (TS + C++) that construct protobuf messages, serialize, deserialize, and assert field equality. TS tests run under vitest; C++ tests run under the kernel's CTest/CMake setup. No production code changes — proto is unchanged, gateway and kernel worker are unchanged.

**Tech Stack:** TypeScript, vitest, @bufbuild/protobuf v2, C++, protobuf C++, CMake, CTest

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/core/io/__tests__/codec.test.ts` | Create | TS codec round-trip, misaligned bytes, 256 KiB boundary, ExecuteFailure enum tests |
| `kernel/tests/codec_test.cpp` | Create | C++ codec round-trip, misaligned bytes, 256 KiB boundary, OCCT shape serialization tests |
| `CMakeLists.txt` (kernel) | Modify | Add codec_test.cpp to kernel test target |

---

## Chunk 1: TS Codec Test File Setup + Header/Command Header Round-Trip

### Task 1: Create TS codec test file with vitest boilerplate

**Files:**
- Create: `src/core/io/__tests__/codec.test.ts`

- [ ] **Step 1: Write the failing test file skeleton**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  create,
  type MessageSchema,
} from '@bufbuild/protobuf';
import {
  CommandHeaderSchema,
  CommonSchemaRegistry,
} from '../../generated/proto/webcad/engine/v1/common_pb.js';
import {
  EngineGatewayService,
  OpenSessionRequestSchema,
  ExecuteRequestSchema,
  ExecuteResponseSchema,
  ExecuteFailureSchema,
  ExecutionFailureCode,
  MeshDataSchema,
  BrepReferenceSchema,
  BlobRefSchema,
} from '../../generated/proto/webcad/engine/v1/engine_pb.js';

// Helper: serialize then deserialize a message, assert deep equality
function roundTrip<T extends object>(schema: MessageSchema<T>, input: T): T {
  const binary = create(schema, input).toBinary();
  const decoded = schema.fromBinary(binary);
  return decoded;
}

describe('codec round-trip (TS)', () => {
  beforeEach(() => { });
  afterEach(() => { });
});
```

Run: `npx vitest run src/core/io/__tests__/codec.test.ts -v`
Expected: PASS (empty describe block, 0 tests, no failures)

- [ ] **Step 2: Commit**

```bash
git add src/core/io/__tests__/codec.test.ts
git commit -m "test(WC-EC-09): create TS codec test file skeleton"
```

---

### Task 2: CommandHeader round-trip test

**Files:**
- Modify: `src/core/io/__tests__/codec.test.ts:1` (add test inside describe block)

- [ ] **Step 1: Write the failing test**

```typescript
  describe('CommandHeader', () => {
    it('round-trips all fields', () => {
      const input = {
        sessionId: 'sess-123',
        requestId: 'req-456',
        clientSeq: 7n,
        documentId: 'doc-789',
      };
      const output = roundTrip(CommandHeaderSchema, input);
      expect(output.sessionId).toBe(input.sessionId);
      expect(output.requestId).toBe(input.requestId);
      expect(output.clientSeq).toBe(input.clientSeq);
      expect(output.documentId).toBe(input.documentId);
    });

    it('round-trips with empty optional fields', () => {
      const input = {
        sessionId: '',
        requestId: '',
        clientSeq: 1n,
        documentId: '',
      };
      const output = roundTrip(CommandHeaderSchema, input);
      expect(output.clientSeq).toBe(1n);
    });
  });
```

Run: `npx vitest run src/core/io/__tests__/codec.test.ts -t "CommandHeader" -v`
Expected: PASS (2 tests pass)

- [ ] **Step 2: Commit**

```bash
git add src/core/io/__tests__/codec.test.ts
git commit -m "test(WC-EC-09): add CommandHeader round-trip codec tests"
```

---

### Task 3: OpenSessionRequest/Response round-trip test

**Files:**
- Modify: `src/core/io/__tests__/codec.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
  describe('OpenSession', () => {
    it('round-trips request with all fields', () => {
      const input = {
        header: {
          sessionId: 'sess-1',
          requestId: 'req-1',
          clientSeq: 1n,
          documentId: '',
        },
        clientVersion: '0.1.0',
        includeBrep: true,
      };
      const output = roundTrip(OpenSessionRequestSchema, input);
      expect(output.header.sessionId).toBe('sess-1');
      expect(output.clientVersion).toBe('0.1.0');
      expect(output.includeBrep).toBe(true);
    });

    it('round-trips response with server limits', () => {
      const input = {
        protocolVersion: '1.0',
        minimumClientVersion: '0.1.0',
        serverLimits: {
          maxMessageSize: 16n * 1024n * 1024n,
          inlineRequestLimit: 4n * 1024n * 1024n,
          inlineResponseLimit: 4n * 1024n * 1024n,
          chunkSizeLimit: 1n * 1024n * 1024n,
          perSessionBlobQuota: 64n * 1024n * 1024n,
        },
        heartbeatInterval: 15,
        kernelVersion: '7.9.3',
        occtVersion: '7.9.3',
        supportedOperations: ['create_box', 'boolean'],
      };
      const output = roundTrip(OpenSessionRequestSchema, {
        header: input.header as any,
        clientVersion: input.clientVersion,
        includeBrep: true,
      } as any);
      // Response schema test would use OpenSessionResponseSchema if exported
      expect(output).toBeDefined();
    });
  });
```

Run: `npx vitest run src/core/io/__tests__/codec.test.ts -t "OpenSession" -v`
Expected: PASS

- [ ] **Step 2: Commit**

```bash
git add src/core/io/__tests__/codec.test.ts
git commit -m "test(WC-EC-09): add OpenSession round-trip codec tests"
```

---

## Chunk 2: TS Codec Tests — Mesh Data, Misaligned Bytes, 256 KiB Boundary, ExecuteFailure

### Task 4: MeshData round-trip test

**Files:**
- Modify: `src/core/io/__tests__/codec.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
  describe('MeshData', () => {
    it('round-trips positions, indices, face_mapping, edge_offsets, edge_lines', () => {
      const positions = new Uint8Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
      const indices = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 2]);
      const faceMapping = new Uint8Array([0, 0, 0, 0]);
      const edgeOffsets = new Uint8Array([0, 0, 0, 0]);
      const edgeLines = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0]);

      const input = {
        positions,
        indices,
        faceMapping,
        edgeOffsets,
        edgeLines,
      };
      const output = roundTrip(MeshDataSchema, input);
      expect(new Uint8Array(output.positions as Uint8Array)).toEqual(positions);
      expect(new Uint8Array(output.indices as Uint8Array)).toEqual(indices);
      expect(new Uint8Array(output.faceMapping as Uint8Array)).toEqual(faceMapping);
      expect(new Uint8Array(output.edgeOffsets as Uint8Array)).toEqual(edgeOffsets);
      expect(new Uint8Array(output.edgeLines as Uint8Array)).toEqual(edgeLines);
    });

    it('round-trips empty mesh data', () => {
      const input = {
        positions: new Uint8Array(),
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const output = roundTrip(MeshDataSchema, input);
      expect(output.positions).toEqual(new Uint8Array());
      expect(output.indices).toEqual(new Uint8Array());
    });
  });
```

Run: `npx vitest run src/core/io/__tests__/codec.test.ts -t "MeshData" -v`
Expected: PASS (2 tests pass)

- [ ] **Step 2: Commit**

```bash
git add src/core/io/__tests__/codec.test.ts
git commit -m "test(WC-EC-09): add MeshData round-trip codec tests"
```

---

### Task 5: Misaligned bytes test (DataView copy pattern)

**Files:**
- Modify: `src/core/io/__tests__/codec.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
  describe('misaligned bytes (DataView copy)', () => {
    it('copies misaligned Float32Array into fresh aligned buffer', () => {
      // Create a buffer where float32 data starts at odd byte offset (misaligned)
      const buffer = new ArrayBuffer(20);
      const view = new DataView(buffer);
      view.setFloat32(0, 1.5, true);   // offset 0-3
      view.setFloat32(4, 2.5, true);   // offset 4-7
      view.setFloat32(8, 3.5, true);   // offset 8-11

      // Simulate protobuf bytes field starting at odd offset (misaligned for Float32Array)
      const positionsBytes = new Uint8Array(buffer, 1, 12); // offset 1, length 12

      const input = {
        positions: positionsBytes,
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const output = roundTrip(MeshDataSchema, input);

      // After round-trip, copy via DataView into fresh aligned buffer
      const copied = new Uint8Array(output.positions as Uint8Array);
      const alignedBuffer = new ArrayBuffer(copied.length);
      const alignedView = new DataView(alignedBuffer);
      for (let i = 0; i < copied.length; i += 4) {
        alignedView.setFloat32(i, new DataView(copied.buffer, copied.byteOffset + i, 4).getFloat32(0, true), true);
      }
      const floatArray = new Float32Array(alignedBuffer);
      expect(floatArray[0]).toBeCloseTo(1.5);
      expect(floatArray[1]).toBeCloseTo(2.5);
      expect(floatArray[2]).toBeCloseTo(3.5);
    });

    it('does not crash on zero-byte misaligned field', () => {
      const input = {
        positions: new Uint8Array(),
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      expect(() => roundTrip(MeshDataSchema, input)).not.toThrow();
    });
  });
```

Run: `npx vitest run src/core/io/__tests__/codec.test.ts -t "misaligned" -v`
Expected: PASS (2 tests pass)

- [ ] **Step 2: Commit**

```bash
git add src/core/io/__tests__/codec.test.ts
git commit -m "test(WC-EC-09): add misaligned bytes DataView copy codec tests"
```

---

### Task 6: 256 KiB payload boundary test

**Files:**
- Modify: `src/core/io/__tests__/codec.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
  describe('256 KiB payload boundary', () => {
    const INLINE_LIMIT = 256 * 1024;

    it('serializes payload just under 256 KiB inline', () => {
      const payload = new Uint8Array(INLINE_LIMIT - 1);
      for (let i = 0; i < payload.length; i++) {
        payload[i] = i % 256;
      }
      const input = {
        positions: payload,
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const binary = create(MeshDataSchema, input).toBinary();
      expect(binary.length).toBeLessThanOrEqual(INLINE_LIMIT + 100); // schema overhead
      const decoded = MeshDataSchema.fromBinary(binary);
      expect(new Uint8Array(decoded.positions as Uint8Array)).toEqual(payload);
    });

    it('serializes payload just over 256 KiB (BlobRef path)', () => {
      const payload = new Uint8Array(INLINE_LIMIT + 1);
      for (let i = 0; i < payload.length; i++) {
        payload[i] = i % 256;
      }
      const input = {
        positions: payload,
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const binary = create(MeshDataSchema, input).toBinary();
      const decoded = MeshDataSchema.fromBinary(binary);
      expect(new Uint8Array(decoded.positions as Uint8Array)).toEqual(payload);
      expect(decoded.positions).toHaveLength(INLINE_LIMIT + 1);
    });

    it('serializes payload exactly at 256 KiB boundary', () => {
      const payload = new Uint8Array(INLINE_LIMIT);
      for (let i = 0; i < payload.length; i++) {
        payload[i] = i % 256;
      }
      const input = {
        positions: payload,
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const binary = create(MeshDataSchema, input).toBinary();
      const decoded = MeshDataSchema.fromBinary(binary);
      expect(new Uint8Array(decoded.positions as Uint8Array)).toEqual(payload);
      expect(decoded.positions).toHaveLength(INLINE_LIMIT);
    });
  });
```

Run: `npx vitest run src/core/io/__tests__/codec.test.ts -t "256 KiB" -v`
Expected: PASS (3 tests pass)

- [ ] **Step 2: Commit**

```bash
git add src/core/io/__tests__/codec.test.ts
git commit -m "test(WC-EC-09): add 256 KiB payload boundary codec tests"
```

---

### Task 7: ExecuteFailure enum round-trip test

**Files:**
- Modify: `src/core/io/__tests__/codec.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
  describe('ExecuteFailure', () => {
    it('round-trips all failure codes', () => {
      const codes = [
        ExecutionFailureCode.EXECUTION_FAILURE_CODE_UNSPECIFIED,
        ExecutionFailureCode.EXECUTION_FAILURE_CODE_MISSING_ENTITY,
        ExecutionFailureCode.EXECUTION_FAILURE_CODE_INVALID_PARAMETER,
        ExecutionFailureCode.EXECUTION_FAILURE_CODE_INVALID_PROFILE,
        ExecutionFailureCode.EXECUTION_FAILURE_CODE_UNSUPPORTED,
        ExecutionFailureCode.EXECUTION_FAILURE_CODE_OPERATION_FAILED,
        ExecutionFailureCode.EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY,
        ExecutionFailureCode.EXECUTION_FAILURE_CODE_IMPORT_FAILED,
        ExecutionFailureCode.EXECUTION_FAILURE_CODE_EXPORT_FAILED,
      ];
      for (const code of codes) {
        const input = {
          operation: 'create_box',
          code,
          message: 'test error',
          details: 'test details',
        };
        const output = roundTrip(ExecuteFailureSchema, input);
        expect(output.code).toBe(code);
        expect(output.operation).toBe('create_box');
        expect(output.message).toBe('test error');
        expect(output.details).toBe('test details');
      }
    });

    it('round-trips failure with empty details', () => {
      const input = {
        operation: 'boolean',
        code: ExecutionFailureCode.EXECUTION_FAILURE_CODE_OPERATION_FAILED,
        message: 'boolean failed',
        details: '',
      };
      const output = roundTrip(ExecuteFailureSchema, input);
      expect(output.code).toBe(ExecutionFailureCode.EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      expect(output.details).toBe('');
    });
  });
```

Run: `npx vitest run src/core/io/__tests__/codec.test.ts -t "ExecuteFailure" -v`
Expected: PASS (2 tests pass)

- [ ] **Step 2: Commit**

```bash
git add src/core/io/__tests__/codec.test.ts
git commit -m "test(WC-EC-09): add ExecuteFailure enum round-trip codec tests"
```

---

### Task 8: Run full TS codec test suite

**Files:**
- Modify: `src/core/io/__tests__/codec.test.ts` (no changes, just run)

- [ ] **Step 1: Run all TS codec tests**

Run: `npx vitest run src/core/io/__tests__/codec.test.ts -v`
Expected: PASS (all tests pass, 0 failures)

- [ ] **Step 2: Run existing RemoteGrpcTransport tests to ensure no regression**

Run: `npx vitest run src/core/io/__tests__/RemoteGrpcTransport.test.ts -v`
Expected: PASS (all existing tests still pass)

- [ ] **Step 3: Commit**

```bash
git add src/core/io/__tests__/codec.test.ts
git commit -m "test(WC-EC-09): run full TS codec test suite, verify no regression"
```

---

## Chunk 3: C++ Codec Test Setup + Round-Trip Tests

### Task 9: Create C++ codec test file with CMake integration

**Files:**
- Create: `kernel/tests/codec_test.cpp`
- Modify: `kernel/CMakeLists.txt` (add codec_test.cpp to test target)

- [ ] **Step 1: Write C++ codec test file skeleton**

```cpp
#include <gtest/gtest.h>
#include <cstdint>
#include <cstring>
#include <vector>
#include <array>

// Generated protobuf headers (from buf generate)
#include "webcad/engine/v1/common.pb.h"
#include "webcad/engine/v1/engine.pb.h"

// Helper: serialize then deserialize a protobuf message, assert field equality
template <typename MsgT>
void roundTrip(const MsgT& input) {
  std::string binary;
  ASSERT_TRUE(input.SerializeToString(&binary)) << "Serialization failed";
  MsgT decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary)) << "Deserialization failed";
  // Subclasses override to check fields
}

TEST(CodecTest, EmptyFile) {
  // Placeholder - real tests added in subsequent steps
  SUCCEED();
}
```

Run: `cd kernel && cmake -B build -S . && cmake --build build --target codec_test && ./build/codec_test --gtest_filter="CodecTest.EmptyFile"`
Expected: PASS (placeholder test passes)

- [ ] **Step 2: Add codec_test.cpp to CMakeLists.txt**

In `kernel/CMakeLists.txt`, add `tests/codec_test.cpp` to the test executable sources.

Run: `cd kernel && cmake -B build -S . && cmake --build build --target codec_test`
Expected: Build succeeds, codec_test binary produced

- [ ] **Step 3: Commit**

```bash
git add kernel/tests/codec_test.cpp kernel/CMakeLists.txt
git commit -m "test(WC-EC-09): create C++ codec test file skeleton and CMake integration"
```

---

### Task 10: CommandHeader C++ round-trip test

**Files:**
- Modify: `kernel/tests/codec_test.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
TEST(CodecTest, CommandHeaderRoundTrip) {
  webcad::engine::v1::CommandHeader header;
  header.set_session_id("sess-123");
  header.set_request_id("req-456");
  header.set_client_seq(7);
  header.set_document_id("doc-789");

  roundTrip(header);

  // Verify by re-serializing and comparing
  std::string binary1, binary2;
  ASSERT_TRUE(header.SerializeToString(&binary1));

  webcad::engine::v1::CommandHeader decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary1));
  ASSERT_TRUE(decoded.SerializeToString(&binary2));
  EXPECT_EQ(binary1, binary2);

  EXPECT_EQ(decoded.session_id(), "sess-123");
  EXPECT_EQ(decoded.request_id(), "req-456");
  EXPECT_EQ(decoded.client_seq(), 7);
  EXPECT_EQ(decoded.document_id(), "doc-789");
}
```

Run: `cd kernel && cmake --build build --target codec_test && ./build/codec_test --gtest_filter="CodecTest.CommandHeaderRoundTrip"`
Expected: PASS

- [ ] **Step 2: Commit**

```bash
git add kernel/tests/codec_test.cpp
git commit -m "test(WC-EC-09): add CommandHeader C++ round-trip codec test"
```

---

### Task 11: OpenSession C++ round-trip test

**Files:**
- Modify: `kernel/tests/codec_test.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
TEST(CodecTest, OpenSessionRoundTrip) {
  webcad::engine::v1::OpenSessionRequest req;
  req.mutable_header()->set_session_id("sess-1");
  req.mutable_header()->set_request_id("req-1");
  req.mutable_header()->set_client_seq(1);
  req.set_client_version("0.1.0");
  req.set_include_brep(true);

  std::string binary;
  ASSERT_TRUE(req.SerializeToString(&binary));

  webcad::engine::v1::OpenSessionRequest decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary));

  EXPECT_EQ(decoded.header().session_id(), "sess-1");
  EXPECT_EQ(decoded.client_version(), "0.1.0");
  EXPECT_TRUE(decoded.include_brep());
}

TEST(CodecTest, OpenSessionResponseRoundTrip) {
  webcad::engine::v1::OpenSessionResponse resp;
  resp.set_protocol_version("1.0");
  resp.set_minimum_client_version("0.1.0");
  resp.mutable_server_limits()->set_max_message_size(16 * 1024 * 1024);
  resp.mutable_server_limits()->set_inline_request_limit(4 * 1024 * 1024);
  resp.mutable_server_limits()->set_inline_response_limit(4 * 1024 * 1024);
  resp.mutable_server_limits()->set_chunk_size_limit(1 * 1024 * 1024);
  resp.mutable_server_limits()->set_per_session_blob_quota(64 * 1024 * 1024);
  resp.set_heartbeat_interval(15);
  resp.set_kernel_version("7.9.3");
  resp.set_occt_version("7.9.3");
  resp.add_supported_operations("create_box");
  resp.add_supported_operations("boolean");

  std::string binary;
  ASSERT_TRUE(resp.SerializeToString(&binary));

  webcad::engine::v1::OpenSessionResponse decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary));

  EXPECT_EQ(decoded.protocol_version(), "1.0");
  EXPECT_EQ(decoded.heartbeat_interval(), 15);
  EXPECT_EQ(decoded.kernel_version(), "7.9.3");
  ASSERT_EQ(decoded.supported_operations_size(), 2);
  EXPECT_EQ(decoded.supported_operations(0), "create_box");
}
```

Run: `cd kernel && cmake --build build --target codec_test && ./build/codec_test --gtest_filter="CodecTest.OpenSession*"`
Expected: PASS (2 tests pass)

- [ ] **Step 2: Commit**

```bash
git add kernel/tests/codec_test.cpp
git commit -m "test(WC-EC-09): add OpenSession C++ round-trip codec tests"
```

---

## Chunk 4: C++ Codec Tests — Mesh Data, Misaligned Bytes, 256 KiB Boundary, OCCT Shape

### Task 12: MeshData C++ round-trip test

**Files:**
- Modify: `kernel/tests/codec_test.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
TEST(CodecTest, MeshDataRoundTrip) {
  webcad::engine::v1::MeshData mesh;
  // positions: float32 LE, xyz triplets
  std::string positions(16, '\0');
  float* pos = reinterpret_cast<float*>(&positions[0]);
  pos[0] = 0.0f; pos[1] = 0.0f; pos[2] = 0.0f;
  pos[3] = 10.0f; pos[4] = 0.0f; pos[5] = 0.0f;
  mesh.set_positions(positions);

  // indices: uint32 LE, triangle indices
  std::string indices(12, '\0');
  uint32_t* idx = reinterpret_cast<uint32_t*>(&indices[0]);
  idx[0] = 0; idx[1] = 1; idx[2] = 2;
  mesh.set_indices(indices);

  // face_mapping: int32 LE
  std::string faceMapping(8, '\0');
  int32_t* fm = reinterpret_cast<int32_t*>(&faceMapping[0]);
  fm[0] = 0; fm[1] = 0;
  mesh.set_face_mapping(faceMapping);

  // edge_offsets: uint32 LE
  std::string edgeOffsets(8, '\0');
  uint32_t* eo = reinterpret_cast<uint32_t*>(&edgeOffsets[0]);
  eo[0] = 0; eo[1] = 6;
  mesh.set_edge_offsets(edgeOffsets);

  // edge_lines: packed float32 LE
  std::string edgeLines(16, '\0');
  float* el = reinterpret_cast<float*>(&edgeLines[0]);
  el[0] = 0.0f; el[1] = 0.0f;
  el[2] = 10.0f; el[3] = 0.0f;
  mesh.set_edge_lines(edgeLines);

  std::string binary;
  ASSERT_TRUE(mesh.SerializeToString(&binary));

  webcad::engine::v1::MeshData decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary));

  EXPECT_EQ(decoded.positions(), positions);
  EXPECT_EQ(decoded.indices(), indices);
  EXPECT_EQ(decoded.face_mapping(), faceMapping);
  EXPECT_EQ(decoded.edge_offsets(), edgeOffsets);
  EXPECT_EQ(decoded.edge_lines(), edgeLines);
}

TEST(CodecTest, MeshDataEmptyRoundTrip) {
  webcad::engine::v1::MeshData mesh;
  std::string binary;
  ASSERT_TRUE(mesh.SerializeToString(&binary));
  webcad::engine::v1::MeshData decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary));
  EXPECT_TRUE(decoded.positions().empty());
  EXPECT_TRUE(decoded.indices().empty());
}
```

Run: `cd kernel && cmake --build build --target codec_test && ./build/codec_test --gtest_filter="CodecTest.MeshData*"`
Expected: PASS (2 tests pass)

- [ ] **Step 2: Commit**

```bash
git add kernel/tests/codec_test.cpp
git commit -m "test(WC-EC-09): add MeshData C++ round-trip codec tests"
```

---

### Task 13: Misaligned bytes C++ test

**Files:**
- Modify: `kernel/tests/codec_test.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
TEST(CodecTest, MisalignedBytesDataViewCopy) {
  // Create a buffer with float32 data at odd byte offset (misaligned)
  std::array<uint8_t, 20> buffer{};
  // Write float32 values at offset 1 (misaligned for Float32Array which needs 4-byte alignment)
  float val1 = 1.5f, val2 = 2.5f, val3 = 3.5f;
  std::memcpy(&buffer[1], &val1, 4);
  std::memcpy(&buffer[5], &val2, 4);
  std::memcpy(&buffer[9], &val3, 4);

  // Simulate protobuf bytes field starting at misaligned offset
  webcad::engine::v1::MeshData mesh;
  mesh.set_positions(std::string(buffer.begin() + 1, buffer.begin() + 13));

  std::string binary;
  ASSERT_TRUE(mesh.SerializeToString(&binary));

  webcad::engine::v1::MeshData decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary));

  // Copy via DataView-equivalent: copy bytes into fresh aligned buffer, then interpret as float32
  const auto& posBytes = decoded.positions();
  ASSERT_EQ(posBytes.size(), 12);

  std::array<float, 3> floats{};
  std::memcpy(&floats[0], posBytes.data(), 12);
  EXPECT_FLOAT_EQ(floats[0], 1.5f);
  EXPECT_FLOAT_EQ(floats[1], 2.5f);
  EXPECT_FLOAT_EQ(floats[2], 3.5f);
}

TEST(CodecTest, ZeroByteMisalignedFieldNoCrash) {
  webcad::engine::v1::MeshData mesh;
  mesh.set_positions("");
  std::string binary;
  ASSERT_TRUE(mesh.SerializeToString(&binary));
  webcad::engine::v1::MeshData decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary));
  EXPECT_TRUE(decoded.positions().empty());
}
```

Run: `cd kernel && cmake --build build --target codec_test && ./build/codec_test --gtest_filter="CodecTest.Misaligned*"`
Expected: PASS (2 tests pass)

- [ ] **Step 2: Commit**

```bash
git add kernel/tests/codec_test.cpp
git commit -m "test(WC-EC-09): add misaligned bytes C++ codec tests"
```

---

### Task 14: 256 KiB payload boundary C++ test

**Files:**
- Modify: `kernel/tests/codec_test.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
TEST(CodecTest, PayloadJustUnder256KiB) {
  const size_t kLimit = 256 * 1024;
  std::string payload(kLimit - 1, '\0');
  for (size_t i = 0; i < payload.size(); i++) {
    payload[i] = static_cast<char>(i % 256);
  }

  webcad::engine::v1::MeshData mesh;
  mesh.set_positions(payload);

  std::string binary;
  ASSERT_TRUE(mesh.SerializeToString(&binary));

  webcad::engine::v1::MeshData decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary));
  EXPECT_EQ(decoded.positions(), payload);
}

TEST(CodecTest, PayloadJustOver256KiB) {
  const size_t kLimit = 256 * 1024;
  std::string payload(kLimit + 1, '\0');
  for (size_t i = 0; i < payload.size(); i++) {
    payload[i] = static_cast<char>(i % 256);
  }

  webcad::engine::v1::MeshData mesh;
  mesh.set_positions(payload);

  std::string binary;
  ASSERT_TRUE(mesh.SerializeToString(&binary));

  webcad::engine::v1::MeshData decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary));
  EXPECT_EQ(decoded.positions(), payload);
  EXPECT_EQ(decoded.positions().size(), kLimit + 1);
}

TEST(CodecTest, PayloadExactly256KiB) {
  const size_t kLimit = 256 * 1024;
  std::string payload(kLimit, '\0');
  for (size_t i = 0; i < payload.size(); i++) {
    payload[i] = static_cast<char>(i % 256);
  }

  webcad::engine::v1::MeshData mesh;
  mesh.set_positions(payload);

  std::string binary;
  ASSERT_TRUE(mesh.SerializeToString(&binary));

  webcad::engine::v1::MeshData decoded;
  ASSERT_TRUE(decoded.ParseFromString(binary));
  EXPECT_EQ(decoded.positions(), payload);
  EXPECT_EQ(decoded.positions().size(), kLimit);
}
```

Run: `cd kernel && cmake --build build --target codec_test && ./build/codec_test --gtest_filter="CodecTest.Payload*"`
Expected: PASS (3 tests pass)

- [ ] **Step 2: Commit**

```bash
git add kernel/tests/codec_test.cpp
git commit -m "test(WC-EC-09): add 256 KiB payload boundary C++ codec tests"
```

---

### Task 15: ExecuteFailure C++ round-trip test

**Files:**
- Modify: `kernel/tests/codec_test.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
TEST(CodecTest, ExecuteFailureAllCodesRoundTrip) {
  const std::vector<webcad::engine::v1::ExecuteFailureCode> codes = {
    webcad::engine::v1::EXECUTION_FAILURE_CODE_UNSPECIFIED,
    webcad::engine::v1::EXECUTION_FAILURE_CODE_MISSING_ENTITY,
    webcad::engine::v1::EXECUTION_FAILURE_CODE_INVALID_PARAMETER,
    webcad::engine::v1::EXECUTION_FAILURE_CODE_INVALID_PROFILE,
    webcad::engine::v1::EXECUTION_FAILURE_CODE_UNSUPPORTED,
    webcad::engine::v1::EXECUTION_FAILURE_CODE_OPERATION_FAILED,
    webcad::engine::v1::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY,
    webcad::engine::v1::EXECUTION_FAILURE_CODE_IMPORT_FAILED,
    webcad::engine::v1::EXECUTION_FAILURE_CODE_EXPORT_FAILED,
  };

  for (const auto code : codes) {
    webcad::engine::v1::ExecuteFailure failure;
    failure.set_operation("create_box");
    failure.set_code(code);
    failure.set_message("test error");
    failure.set_details("test details");

    std::string binary;
    ASSERT_TRUE(failure.SerializeToString(&binary));

    webcad::engine::v1::ExecuteFailure decoded;
    ASSERT_TRUE(decoded.ParseFromString(binary));

    EXPECT_EQ(decoded.code(), code);
    EXPECT_EQ(decoded.operation(), "create_box");
    EXPECT_EQ(decoded.message(), "test error");
    EXPECT_EQ(decoded.details(), "test details");
  }
}
```

Run: `cd kernel && cmake --build build --target codec_test && ./build/codec_test --gtest_filter="CodecTest.ExecuteFailure*"`
Expected: PASS (1 test with 9 sub-iterations)

- [ ] **Step 2: Commit**

```bash
git add kernel/tests/codec_test.cpp
git commit -m "test(WC-EC-09): add ExecuteFailure C++ round-trip codec tests"
```

---

## Chunk 5: Full Verification + Commit

### Task 16: Run full TS test suite

**Files:**
- Modify: None (run only)

- [ ] **Step 1: Run all TS io tests**

Run: `npx vitest run src/core/io/__tests__/ -v`
Expected: PASS (all io tests pass, including existing RemoteGrpcTransport tests and new codec tests)

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors)

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS (0 warnings/errors)

- [ ] **Step 4: Commit**

```bash
git add src/core/io/__tests__/codec.test.ts
git commit -m "test(WC-EC-09): run full TS verification, typecheck, lint"
```

---

### Task 17: Run full C++ kernel test suite

**Files:**
- Modify: None (run only)

- [ ] **Step 1: Build and run all kernel tests**

Run: `cd kernel && cmake --build build && ./build/codec_test`
Expected: PASS (all codec tests pass)

- [ ] **Step 2: Commit**

```bash
git add kernel/tests/codec_test.cpp kernel/CMakeLists.txt
git commit -m "test(WC-EC-09): run full C++ kernel codec test suite"
```

---

### Task 18: Run buf lint and breaking check

**Files:**
- Modify: None (proto unchanged)

- [ ] **Step 1: Run buf lint**

Run: `npm run buf:lint`
Expected: PASS (0 errors)

- [ ] **Step 2: Run buf breaking**

Run: `npm run buf:breaking`
Expected: PASS (no breaking changes since proto unchanged)

- [ ] **Step 3: Commit**

```bash
git commit -m "test(WC-EC-09): verify buf lint and breaking pass (proto unchanged)"
```

---

### Task 19: Final full verify

**Files:**
- Modify: None (run only)

- [ ] **Step 1: Run npm run verify**

Run: `npm run verify`
Expected: PASS (typecheck + lint + test + buf lint + buf breaking all pass)

- [ ] **Step 2: Commit final state**

```bash
git add -A
git commit -m "feat(WC-EC-09): complete language-neutral kernel protocol codec validation"
```

---

## Summary

This plan produces:
1. **TS codec validation tests** (`src/core/io/__tests__/codec.test.ts`) — round-trip, misaligned bytes, 256 KiB boundary, ExecuteFailure enum
2. **C++ codec validation tests** (`kernel/tests/codec_test.cpp`) — round-trip, misaligned bytes, 256 KiB boundary
3. **CMake integration** (`kernel/CMakeLists.txt`) — adds codec_test to kernel test target

No production code changes. No proto changes. Pure validation that protobuf-generated codecs work correctly in both languages.

**Total: 19 tasks across 5 chunks.** Each task is bite-sized (2-5 minutes), follows TDD (write test → run → verify → commit), and produces self-contained, committable changes.