# WC-EC-29: Vite Dev Proxy and Local/Remote Switch

**Status:** Draft  
**Ticket:** WC-EC-29 · Vite dev proxy and local/remote switch  
**Priority:** medium · **Agent:** A · **Phase:** 3  
**Date:** 2026-11-22

## Goal

Make local development ergonomic by (a) proxying gateway API calls through the Vite dev server so the browser Connect client reaches the gateway without CORS or port juggling, and (b) providing a config-driven switch between local WASM transport and remote gRPC transport without code changes.

## Scope

**In scope:**
- Vite dev server proxy: `/api/grpc/*` → `http://localhost:8080` (gateway)
- Environment-variable-driven transport selection (`VITE_TRANSPORT`, `VITE_GATEWAY_URL`)
- `OpenCascadeService.init()` already supports `transport`/`gatewayUrl`; no code change needed there beyond reading env vars at bootstrap
- Small transport/connection status indicator in the UI status bar (dev visibility)

**Out of scope:**
- Runtime transport swap without reload
- Persistent localStorage preference for transport
- Production proxy (this is dev-only; WC-EC-39 replaces Vite file API in production)

## Background

### Current state

- Vite dev server runs on `http://localhost:5173` (`vite.config.ts`)
- Gateway (Connect protocol) runs on `http://localhost:8080` (`src/core/gateway/connect-server.ts`)
- `OpenCascadeService` (src/core/io/OpenCascadeService.ts) already supports three transport modes:
  - `transport: 'local'` (default, no `gatewayUrl`) → `OCCWorkerClient` (WASM worker)
  - `transport: 'grpc'` + non-empty `gatewayUrl` → `RemoteGrpcTransport` (Connect/gRPC)
  - `transport: 'kernel'` → `KernelGrpcTransport`
- `RemoteGrpcTransport` (WC-EC-28, done) implements reconnect, backoff, heartbeat watchdog, pending-call retry/abort, and Restore-based rehydration

### Why this ticket

During development, engineers must manually edit code to switch between local WASM and remote gRPC, and the browser Connect client hitting `http://localhost:8080` directly from `http://localhost:5173` triggers CORS. A dev proxy + env-var config removes both frictions.

## Design

### 1. Vite Dev Proxy

Add `server.proxy` to `vite.config.ts`:

```ts
server: {
  port: 5173,
  proxy: {
    '/api/grpc': {
      target: 'http://localhost:8080',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/grpc/, ''),
      configure: (proxy, options) => {
        proxy.on('error', (err, req, res) => {
          console.warn('[Vite proxy] Gateway unreachable:', err.message);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Gateway unavailable — is the gateway running on port 8080?');
          }
        });
      },
    },
  },
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
},
```

**Behavior:**
- Requests to `http://localhost:5173/api/grpc/...` are forwarded to `http://localhost:8080/...`
- Connect RPC paths (e.g., `/webcad.engine.v1.EngineGatewayService/OpenSession`) pass through unchanged after the `/api/grpc` prefix is stripped
- If the gateway is down, the proxy returns a clear 502 message instead of a cryptic CORS/network error

**Why proxy instead of direct `http://localhost:8080`:**
- Avoids CORS preflight failures on the Connect POST endpoints
- Single origin (5173) simplifies cookie/auth header handling if auth is added later
- Matches common dev-setup patterns (Vite proxy → backend)

### 2. Local/Remote Transport Switch

No change to `OpenCascadeService.init()` — it already accepts `transport` and `gatewayUrl`. The switch is driven by environment variables read at app bootstrap.

In `src/app.ts` (or `src/main.ts`), read env vars and pass to `OpenCascadeService.init()`:

```ts
const transport = (import.meta.env.VITE_TRANSPORT as 'local' | 'grpc' | 'kernel' | undefined) ?? 'local';
const gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? undefined;

await OpenCascadeService.getInstance().init({
  transport,
  gatewayUrl,
  sessionId: crypto.randomUUID(),
  includeBrep: true,
  timeoutMs: 30000,
});
```

**Transport selection matrix:**

| VITE_TRANSPORT | VITE_GATEWAY_URL | Result |
|---|---|---|
| (unset) | (unset) | Local WASM (`OCCWorkerClient`) |
| `local` | (unset) | Local WASM |
| `grpc` | `http://localhost:8080` | Remote gRPC via Vite proxy (`/api/grpc`) |
| `grpc` | `http://remote-host:8080` | Remote gRPC direct |
| `kernel` | (unset) | Kernel gRPC (`KernelGrpcTransport`) |

**Default:** `local` (WASM) — no gateway required, works out of the box for offline/preview use.

### 3. UI Transport/Connection Indicator

Add a small pill in the status bar showing:
- Transport mode: `LOCAL` (WASM) or `REMOTE` (gRPC)
- Connection state: `CONNECTED`, `RECONNECTING`, `REHYDRATING`, `DISCONNECTED`, `ERROR`

This reuses `RemoteGrpcTransport`'s `ConnectionState` events (already emitted via `EventTarget` from WC-EC-28). For local WASM, the state is always `CONNECTED` after init.

**Placement:** Right side of the status bar, next to existing status indicators.

### 4. Error Handling

- Gateway unreachable at init → `OpenCascadeService.init()` throws; error surfaced via `onError` callback and UI indicator shows `ERROR`
- Mid-session gateway loss → `RemoteGrpcTransport` reconnects automatically (WC-EC-28); UI indicator shows `RECONNECTING` then `CONNECTED`
- Transport switch (config change) → requires page reload; no runtime swap

## Data Flow

```
Browser (Vite dev, :5173)
  ├── UI action (create box, etc.)
  │       ↓
  ├── OpenCascadeService (transport: 'grpc', gatewayUrl: '/api/grpc')
  │       ↓
  ├── RemoteGrpcTransport (Connect client)
  │       POST /api/grpc/webcad.engine.v1.EngineGatewayService/OpenSession
  │       ↓ (Vite proxy)
  └── Gateway (Connect server, :8080)
          ↓
      Kernel supervisor → OCCT kernel
```

For local mode:
```
Browser (Vite dev, :5173)
  ├── OpenCascadeService (transport: 'local')
  │       ↓
  └── OCCWorkerClient → Web Worker → OCCT WASM
```

## Testing

1. **Vite proxy test:** Start gateway on 8080, start Vite dev on 5173, call `OpenCascadeService.init({ transport: 'grpc', gatewayUrl: '/api/grpc' })`, verify `OpenSession` reaches the gateway through the proxy.
2. **Transport switch test:** Set `VITE_TRANSPORT=local` → WASM worker initializes; set `VITE_TRANSPORT=grpc` + `VITE_GATEWAY_URL=/api/grpc` → RemoteGrpcTransport initializes.
3. **Fallback test:** Gateway down → clear 502 from proxy, error surfaced in UI.
4. **Unit tests:** No new unit tests required beyond existing `RemoteGrpcTransport.test.ts` coverage; the proxy is Vite configuration, not code.

## Acceptance Criteria

- [ ] Vite dev server proxies `/api/grpc/*` to `http://localhost:8080`
- [ ] `VITE_TRANSPORT=local` (default) initializes WASM worker without gateway
- [ ] `VITE_TRANSPORT=grpc` + `VITE_GATEWAY_URL=/api/grpc` initializes RemoteGrpcTransport through proxy
- [ ] Gateway down returns clear 502 via proxy (no CORS error)
- [ ] UI status bar shows transport mode and connection state
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all pass

## Open Questions

None — all decisions resolved in this spec.

---

*This spec is ready for review. Once approved, invoke the writing-plans skill to create the implementation plan.*