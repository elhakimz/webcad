# WC-EC-09: Language-Neutral Kernel Protocol Spec + Codecs (TS and C++)

**Status:** Draft (pending user review)
**Ticket:** WC-EC-09 — Language-neutral kernel protocol spec + codecs (TS and C++)
**Priority:** high · **Agent:** B · **Phase:** Phase 1
**Depends on:** WC-EC-05 (kernel strategy), gRPC/Connect transport (PR 2a)
**Design spec location:** docs/superpowers/specs/2026-11-20-wc-ec-09-kernel-protocol-design.md

---

## 1. Decision

**Option A: Spec document + codec validation on top of existing proto.**

proto is already the language-neutral source of truth. gRPC/Connect already provides codecs in both TS and C++. WC-EC-09 documents the wire protocol semantics (error model, ordering, dedupe, payload limits, session lifecycle) and validates that TS and C++ codecs round-trip correctly — no new serialization format, no protocol changes.

**Rejected options:**

| Option | Reason rejected |
|---|---|
| B: Custom codec layer (framing, checksum, magic bytes) | Duplicates what gRPC/HTTP2 already provides; adds maintenance burden for minimal benefit; violates "do not change the protocol" spirit |
| C: JSON fallback codec | Requires manual JSON codec in both languages; not needed for production; debug-only value |

---

## 2. Scope

**In scope:**
- Spec documenting wire protocol semantics on top of existing `proto/webcad/engine/v1/`
- TS codec round-trip tests (all message types, misaligned bytes, 256 KiB boundary)
- C++ codec round-trip tests (all message types, misaligned bytes, 256 KiB boundary)
- Documentation of language-specific considerations (DataView copy for misaligned bytes)

**Out of scope:**
- New protocol or serialization format
- Changes to `proto/` (no ADR needed since no proto change)
- New gateway or kernel code (PR 2a already committed)
- Custom framing, checksums, or magic bytes

---

## 3. Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│   Browser (TS)  │      │   Gateway (TS)   │      │   Kernel (C++)      │
│                 │      │                  │      │                     │
│ RemoteGrpcTrans │────→ │ Connect server   │─────→│ kernel-worker.cpp   │
│   (codec: TS)   │      │ session-manager  │      │   (codec: C++)      │
│                 │      │   ordering       │      │   OCCT 7.9.3        │
│                 │      │   dedupe         │      │                     │
└─────────────────┘      │   auth           │      └─────────────────────┘
                         └──────────────────┘
                                  ↑
                         nginx (HTTP/2 TLS, sticky x-session-id)
                         gRPC over Unix socket / TCP
```

**Proto (language-neutral source of truth):**
- `proto/webcad/engine/v1/common.proto` — common types, `ExecuteFailure`, status codes
- `proto/webcad/engine/v1/engine.proto` — `ExecuteRequest/Response`, `Restore`, `OpenSession`, `UploadChunk`, `StreamMesh`, `KernelService`

**Codegen:**
- TS: `protoc-gen-es v2` → `src/generated/proto/webcad/engine/v1/` (types + DescService)
- C++: `protoc` → kernel build tree (protobuf C++ runtime)

**3 source files import from generated:** `session-manager.ts` (types only), `connect-server.ts` (DescService wrapper), `RemoteGrpcTransport.ts` (casts as any). No manual message construction or `fromBinary` calls in source.

---

## 4. Wire Protocol Semantics

### 4.1 Messages

| RPC | Direction | Purpose |
|---|---|---|
| `OpenSession` | Browser → Gateway | Create session, return session ID + protocol version |
| `Execute` | Browser → Gateway → Kernel | Run a kernel command (box, boolean, fillet, etc.) |
| `Restore` | Browser → Gateway → Kernel | Resume session after disconnect; `needs_rehydrate` + `last_event_id` |
| `UploadChunk` | Browser → Gateway | Stream large file chunks |
| `StreamMesh` | Kernel → Gateway → Browser | Stream mesh data back to client |

### 4.2 Error Model

| Source | Mechanism | Codes |
|---|---|---|
| Kernel operation failure | In-band `ExecuteResponse.failure { ExecuteFailure }` | Kernel-specific enum values |
| Transport/session problem | gRPC status code | `UNAUTHENTICATED`, `PERMISSION_DENIED`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`, `CANCELLED`, `INTERNAL`, `NOT_FOUND`, `RESOURCE_EXHAUSTED` |

JWT expiry mid-stream: server ends stream with `UNAUTHENTICATED`; client reopens with fresh token.

### 4.3 Ordering

- `client_seq` starts at 1 per session (not 0)
- `Execute` and `Restore` are sequenced via a 5-second reorder buffer in `ordering.ts`
- All other RPCs are unsequenced
- `SessionOrderer.processBuffered()` calls `entry.resolve(entry)` after deleting buffered entries (otherwise out-of-order promises hang)

### 4.4 Dedupe

- `request_id` → status + result reference cache
- 10-minute TTL (proposed)
- Results >256 KiB stored by `result_id`; client fetches via `result_id`

### 4.5 Session & Routing

- `x-session-id` header for sticky routing via nginx hash
- One kernel process per session (kill-and-respawn model)
- `OpenSessionResponse` includes: `protocol_version`, `minimum_client_version`, `server_limits`, `heartbeat_interval`, kernel/OCCT version, supported ops
- `BreReference.data` opt-in via `include_brep` flag

### 4.6 Payload Limits

| Limit | Value | Notes |
|---|---|---|
| Inline payload | ≤256 KiB | Stored directly in message |
| Large payload | BlobRef via `result_id` | Stored by result ID, fetched separately |
| Upload storage | Temp dir vs MinIO | Open question |

### 4.7 Typed Arrays (bytes fields)

Protobuf `bytes` fields may be misaligned. **Never** construct `Float32Array`/`Uint32Array`/`Int32Array` directly from misaligned protobuf bytes. Always copy via `DataView` into a fresh aligned buffer first. Applies to both TS and C++ sides.

---

## 5. Components

### 5.1 TS Codec Validation (new tests)

**File:** `src/core/io/__tests__/codec.test.ts` (new)

Tests:
1. **Round-trip all message types** — Construct each of the 34 handler request/response message types, serialize, deserialize, assert field equality.
2. **Misaligned bytes** — Create a message with a `bytes` field at an odd byte offset, serialize, deserialize, copy via `DataView` into fresh aligned buffer, construct `Float32Array`, assert correct values.
3. **256 KiB boundary** — Payload at exactly 256 KiB; verify BlobRef path vs inline path.
4. **Error enum serialization** — `ExecuteFailure` enum values round-trip correctly.

### 5.2 C++ Codec Validation (new kernel tests)

**File:** kernel test suite (C++, alongside kernel-worker.cpp)

Tests:
1. **Round-trip all message types** — Construct each protobuf message, `SerializeToString`, `ParseFromString`, assert field equality.
2. **Misaligned bytes** — Verify aligned buffer copy pattern works in C++.
3. **256 KiB boundary** — Same boundary check as TS.
4. **OCCT shape serialization** — B-rep data round-trips without corruption.

### 5.3 Existing Components (no changes)

| Component | Role | File |
|---|---|---|
| RemoteGrpcTransport | TS Connect client to gateway | `src/core/io/RemoteGrpcTransport.ts` |
| Connect server | Connect protocol server | `src/core/gateway/connect-server.ts` |
| Session manager | Per-session state, ordering, dedupe | `src/core/gateway/session-manager.ts` |
| Ordering | client_seq reorder buffer | `src/core/gateway/ordering.ts` |
| Dedupe | request_id dedupe cache | `src/core/gateway/dedupe.ts` |
| Auth | JWT interceptor, session/project claims | `src/core/gateway/auth.ts` |
| Kernel client | gRPC client to kernel | `src/core/gateway/kernel-client.ts` |
| Mock kernel | Mock kernel for testing | `src/core/gateway/mock-kernel.ts` |
| Kernel worker | C++ OCCT kernel | `src/core/gateway/kernel-worker.cpp` |

---

## 6. Data Flow

```
Browser UI (TS)
    │
    ▼
OpenCascadeService (service layer)
    │
    ▼
RemoteGrpcTransport (Connect client, TS codec)
    │  HTTP/2 TLS via Connect
    ▼
nginx (HTTP/2 termination, sticky routing by x-session-id)
    │
    ▼
Connect server (gateway, TS) ──→ session-manager + ordering + dedupe
    │  gRPC over Unix socket / TCP
    ▼
Kernel client (gRPC, TS) ──→ Kernel worker (C++ codec) ──→ OCCT 7.9.3
    │                                                    │
    └──────────── response flows back same path ─────────┘
```

---

## 7. Testing

| # | Test | Language | File | Validates |
|---|---|---|---|---|
| 1 | Codec round-trip (all message types) | TS | `src/core/io/__tests__/codec.test.ts` | Every message type serializes → deserializes → equal |
| 2 | Misaligned bytes | TS | `src/core/io/__tests__/codec.test.ts` | DataView copy into aligned buffer; Float32Array correct |
| 3 | 256 KiB boundary | TS | `src/core/io/__tests__/codec.test.ts` | BlobRef vs inline at exact threshold |
| 4 | ExecuteFailure enum | TS | `src/core/io/__tests__/codec.test.ts` | Error enum round-trips |
| 5 | Codec round-trip (all message types) | C++ | kernel test suite | Every message serializes → parses → equal |
| 6 | Misaligned bytes | C++ | kernel test suite | Aligned buffer copy works |
| 7 | 256 KiB boundary | C++ | kernel test suite | Same boundary check |
| 8 | OCCT shape serialization | C++ | kernel test suite | B-rep data round-trips without corruption |

**Existing tests that must still pass:** `RemoteGrpcTransport.test.ts` (mocks generated modules only), gateway unit tests (ordering, dedupe, session manager).

---

## 8. Self-Review

1. **Placeholder scan:** No TBD/TODO/incomplete sections. All sections filled. Open questions noted (upload storage: temp dir vs MinIO) but not blocking.
2. **Internal consistency:** Spec builds on existing proto + PR 2a gateway. Error model, ordering, dedupe are consistent across sections. TS and C++ codec tests mirror each other.
3. **Scope check:** Focused on spec + codec validation. No code changes to gateway/kernel. Single implementation plan scope.
4. **Ambiguity check:** "Do not change protocol" is explicit. "Codecs (TS and C++)" interpreted as validation of protobuf-generated codecs, not custom serialization. Misaligned bytes rule stated precisely.

---

## 9. Next Step

Please review this spec. If approved, I'll invoke the writing-plans skill to create the implementation plan.