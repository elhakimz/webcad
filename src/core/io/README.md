# IO (Transport) Context Pack

## Purpose

The IO layer provides the transport abstraction between the CAD application and the geometry kernel. Two implementations exist: local WASM worker (default) and remote gRPC/Connect.

## Files

| File | Responsibility |
|------|---------------|
| `OCCTransport.ts` | Transport interface — `execute(command)`, `restore(...)`, `cancel()`, `close()`. Stable across both implementations. |
| `OpenCascadeService.ts` | Config-based transport selection. Empty `gatewayUrl` → local WASM; non-empty → `RemoteGrpcTransport`. |
| `RemoteGrpcTransport.ts` | Connect-protocol client implementing `OCCTransport`. Replaces `RemoteWsTransport`. |
| `OCCWorker.ts` | Local WASM worker host — spawns Web Worker, posts OCCT commands via postMessage. |
| `OCCWorkerClient.ts` | Client-side wrapper around OCCWorker — message routing, pending call tracking. |

## Transport Selection

```ts
// Empty gatewayUrl → local WASM worker
const service = new OpenCascadeService({ gatewayUrl: '' });

// Non-empty gatewayUrl → Remote gRPC/Connect
const service = new OpenCascadeService({ gatewayUrl: 'http://localhost:8080' });
```

## Key Rules

- **Every async call must be awaited** — no fire-and-forget; failures surfaced to UI
- **Typed arrays from protobuf `bytes`** may be misaligned — copy via `DataView` into fresh aligned buffers before creating `Float32Array`/`Uint32Array`/`Int32Array`
- **OCCTransport interface does not change** — both implementations honor the same contract
- **pendingCount semantics** — tracked for `TestBridge` (undo/transformShape, restoreSolidBRep must be awaited)

## Testing

- Unit tests: `src/core/io/__tests__/RemoteGrpcTransport.test.ts`
- Transport tests verify Connect client behavior, retry logic, error mapping