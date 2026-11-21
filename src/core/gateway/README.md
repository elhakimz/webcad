# Gateway Context Pack

## Purpose

The gateway is the bridge between browser clients (Connect protocol) and the kernel (native gRPC). It handles session lifecycle, command ordering, deduplication, authentication, and kernel process supervision.

## Files

| File | Responsibility |
|------|---------------|
| `session-manager.ts` | Per-session state: session id, client_seq counter, dedupe cache, replay buffer, kernel process handle |
| `ordering.ts` | client_seq reorder buffer — applies commands in order, handles gaps with timeout |
| `dedupe.ts` | request_id dedupe cache — bounded TTL cache, returns prior result for duplicates |
| `auth.ts` | JWT interceptor — validates session/project claims from Authorization header |
| `connect-server.ts` | Connect protocol server — OpenSession, Execute, Restore, Subscribe, UploadChunk, Cancel, CloseSession, StreamResult; wires `commandRegistry` and registers `BoxCommand` |
| `command-registry.ts` | CommandRegistry — register/get/list/validate commands; CommandImplementation interface |
| `commands/box.ts` | BoxCommand — `create_box` pilot command (server-side, synthetic shapeId; kernel call deferred) |
| `kernel-client.ts` | gRPC client to kernel — Execute, ExecuteWithProgress, Restore, PutBlob, StreamResult, Health |
| `mock-kernel.ts` | Mock kernel for testing — accepts gRPC calls, returns canned results |

## Key Invariants

- **One kernel process per session** — processes are never shared between sessions
- **client_seq starts at 1** per session, continues across Subscribe reconnects, resets on new OpenSession
- **Dedupe cache is bounded** — TTL (10 min proposed) + size cap; results above 256 KiB stored by reference
- **Unsequenced RPCs**: Cancel, CloseSession, UploadChunk, StreamMesh, Subscribe — only Execute and Restore carry client_seq
- **Gap timeout**: commands behind a gap that times out are aborted with ABORTED, session moves to rehydrating

## Session Lifecycle

1. Client calls `OpenSession` → gateway creates session, spawns kernel process, returns session_id
2. Client calls `Execute` with client_seq → gateway buffers, orders, dedupes, forwards to kernel
3. Kernel returns result → gateway forwards to client (unary) or via Subscribe stream
4. Client calls `CloseSession` → gateway terminates kernel process, cleans up session state

## Testing

- Unit tests: `src/core/gateway/*test.ts` (dedupe, ordering, session-manager)
- Mock kernel available for integration tests without a real kernel