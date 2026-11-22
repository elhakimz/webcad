# WC-EC-27 Design: Gateway Auth + Sessions (Revised)

**Ticket:** WC-EC-27 — Gateway: gRPC server, auth hello, sessions  
**Priority:** high · **Agent:** B (security review required) · **Phase:** 3  
**Status:** Proposed (design doc, revised after review)

---

## 1. Problem Statement

The gateway (`src/core/gateway/connect-server.ts`) implements Connect-over-HTTP/2 with session management, ordering, dedupe, and kernel supervision. Auth exists but isn't wired:

1. **Auth exists but isn't wired** — `JwtAuthenticator` (`auth.ts`) is built but never called by any gateway route. `OpenSession` and `Execute` accept requests without validating JWTs.
2. **No session ownership model** — nothing ties a session to its authenticated owner; Execute with someone else's session id succeeds.
3. **Inconsistent auth coverage** — only `OpenSession` and `Execute` were going to be protected; `Subscribe`, `UploadChunk`, `StreamResult`, `Cancel`, `CloseSession` were uncovered.
4. **`AuthHello` is redundant** — its only purpose (version negotiation + token) duplicates `OpenSession`, and it can't hand out anything the client doesn't already have (it takes a bearer JWT).

WC-EC-27 closes these gaps without adding a redundant gRPC server for clients (gRPC is gateway→kernel, internal; browser clients use Connect over HTTP/2).

---

## 2. Scope

**In scope:**
- JWT validation via a single Connect interceptor covering **all 8** `EngineGateway` RPCs
- Session ownership: `OpenSession` records the authenticated principal as owner; cross-tenant `Execute`/`Restore`/etc. returns `PERMISSION_DENIED`
- Dedupe and ordering keys scoped by `principal + sessionId` so request ids can't collide across tenants
- `Restore` correctly labeled: re-imports B-reps into an existing session (resume is `Subscribe(last_event_id)` + `OpenSession` with existing id)
- Dev-mode test-token helper so existing tests pass unchanged
- Fail-closed JWT validation: reject `alg:none`, require `exp`, clock-skew limit, default secret refused in production
- Unit tests: table-driven all-RPC auth test, tampered signature, `alg:none`, missing `exp`, expiry mid-stream, another user's session

**Out of scope:**
- OAuth2, OIDC, or third-party identity providers (token minting is a future ticket)
- Session persistence across gateway restarts (WC-EC-30 covers resume/rehydrate)
- `AuthHello` RPC (dropped — see decision log below)

---

## 3. Architecture

### 3.1 Components

| Component | Responsibility | File |
|-----------|---------------|------|
| `JwtAuthenticator` | Validate JWT from `Authorization: Bearer` header | `src/core/gateway/auth.ts` (modify) |
| `AuthInterceptor` | Connect interceptor: validate JWT on every RPC, enforce session ownership | `src/core/gateway/auth-interceptor.ts` (new) |
| `SessionManager` | Per-session state, event buffers, heartbeat | `src/core/gateway/session-manager.ts` (modify) |
| `connect-server.ts` | Connect protocol server; routes wired to `defaultGatewayImpl` + interceptor | `src/core/gateway/connect-server.ts` (modify) |
| `kernel-supervisor.ts` | One kernel process per session, spare pool, crash recovery | existing |
| `dedupe.ts` / `ordering.ts` | Request deduplication + client_seq ordering (scoped by principal+session) | existing (modify key scope) |

### 3.2 Data Flow

**OpenSession (authenticated):**
```
Client ── OpenSession(Authorization: Bearer <token>) ──► Gateway
   ── AuthInterceptor: validate JWT ──► SessionManager.createSession(owner=sub)
   ──► {session_id, protocol_version, ...}
```

**Execute (authenticated + ordered + authorized):**
```
Client ── Execute(session_id, request_id, client_seq) ──► Gateway
   ── AuthInterceptor: validate JWT ──► check owner == sub ──► dedupe(principal+sessionId)
   ──► orderer(principal+sessionId) ──► kernel ──► result
```

**Subscribe (long-lived auth):**
```
Client ── Subscribe(last_event_id) ──► Gateway ── AuthInterceptor ──► stream events
   ── token expires mid-stream ──► server ends stream with UNAUTHENTICATED
   ── client reopens with fresh token
```

**Restore (re-imports B-reps):**
```
Client ── Restore(session_id, brep_ids) ──► Gateway ── AuthInterceptor ──► owner check ──► kernel import B-reps
```

---

## 4. Interface Changes

### 4.1 Auth helper — `auth.ts`

**New `AuthError` class** extending `ConnectError` (from `@connectrpc/connect`):

```typescript
import { ConnectError, Code } from '@connectrpc/connect';

export class AuthError extends ConnectError {
  constructor(message: string, public readonly code: Code = Code.UNAUTHENTICATED) {
    super(message, code);
  }
}
```

**Updated `JwtAuthenticator`:**
- `authenticate(authorization?: string)` returns `JWTPayload | null` (throws `AuthError` on failure)
- Pin algorithm: reject `alg:none` and any alg confusion — only `HS256` accepted
- Require `exp` claim
- Clock-skew limit: 30 seconds tolerance
- Fail closed on default secret in production: if `WEBCAD_JWT_SECRET` is `dev-secret-change-in-production` and `NODE_ENV === 'production'`, refuse to start (throw on construction)

```typescript
export interface JWTPayload {
  sub: string;           // principal (user id)
  sessionId?: string;    // NOT used for session id — sub is the principal
  projectId?: string;
  exp: number;
  iat: number;
  iss?: string;
  aud?: string;
}

export function authenticate(authorization?: string): JWTPayload {
  // ... returns payload or throws AuthError
}

export function createTestToken(payload: Partial<JWTPayload>): string {
  // Dev-mode helper: signs a JWT with the dev secret for tests
  // Only available when WEBCAD_JWT_SECRET is the default dev secret
}
```

### 4.2 Connect interceptor — `auth-interceptor.ts` (new)

Single interceptor applied to all 8 `EngineGateway` RPCs:

```typescript
import { ConnectInterceptor } from '@connectrpc/connect';
import { authenticate } from './auth.js';
import { sessionManager } from './session-manager.js';

export const authInterceptor: ConnectInterceptor = async (next) => async (req) => {
  const authHeader = req.header?.get?.('authorization') ?? req.headers?.authorization;
  const payload = authenticate(authHeader);
  const principal = payload.sub;

  // Session ownership check for RPCs that take session_id
  const sessionId = req.header?.sessionId ?? req.header?.session_id;
  if (sessionId) {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new AuthError(`Session not found: ${sessionId}`, Code.NOT_FOUND);
    }
    if (session.ownerId !== principal) {
      throw new AuthError('Permission denied for this session', Code.PERMISSION_DENIED);
    }
  }

  return next(req);
};
```

Applied to `OpenSession`, `Execute`, `Restore`, `Subscribe`, `UploadChunk`, `Cancel`, `CloseSession`, `StreamResult`.

### 4.3 SessionManager — owner tracking

`SessionInfo` gains `ownerId: string` field. `createSession(clientVersion, sessionId, ownerId)` stores the owner. `OpenSession` sets `ownerId = payload.sub`.

### 4.4 Dedupe and ordering — principal+session scoping

`DedupeCache.markPending(requestId, sessionId)` → key becomes `${principal}:${sessionId}:${requestId}`.
`OrdererRegistry.getOrCreate(sessionId)` → key becomes `${principal}:${sessionId}`.

This prevents request_id collisions across tenants sharing the same gateway instance.

### 4.5 connect-server.ts changes

- Wire `authInterceptor` into all 8 `EngineGateway` routes via Connect's interceptor chain
- `OpenSession` accepts `Authorization: Bearer <token>` header; validates via interceptor; sets session owner
- `Restore` documented as "re-import B-reps into existing session" (not resume)
- Remove per-handler `requireAuth` calls — interceptor covers all routes
- `Subscribe`: when token expires mid-stream, the interceptor rejects with `UNAUTHENTICATED`; Connect closes the stream; client reopens with fresh token

---

## 5. Error Handling

| Situation | Status Code | Message (client-visible) | Log detail |
|-----------|------------|-------------------------|------------|
| Missing `Authorization` header | `UNAUTHENTICATED` | "Authentication required" | full reason |
| Invalid JWT format | `UNAUTHENTICATED` | "Authentication required" | full reason |
| Expired token | `UNAUTHENTICATED` | "Authentication required" | full reason |
| Missing `exp` claim | `UNAUTHENTICATED` | "Authentication required" | full reason |
| `alg:none` / alg confusion | `UNAUTHENTICATED` | "Authentication required" | full reason |
| Invalid signature (tampered) | `UNAUTHENTICATED` | "Authentication required" | full reason |
| Invalid issuer/audience | `UNAUTHENTICATED` | "Authentication required" | full reason |
| Session not found | `NOT_FOUND` | "Session not found" | session id |
| Cross-tenant session access | `PERMISSION_DENIED` | "Permission denied" | principal + session id |
| Default secret in production | startup failure | n/a | "Refusing to start: default JWT secret in production" |

Client-visible messages are generic to avoid leaking auth internals; detailed reasons go to server logs only.

---

## 6. Testing

| Test | File | What it verifies |
|------|------|-----------------|
| Table-driven: all 8 RPCs require auth | `tests/gateway/auth-interceptor.test.ts` (new) | Every EngineGateway RPC rejects missing/invalid JWT |
| Valid JWT passes | same | Authenticated requests proceed |
| Tampered signature | same | Rejected with UNAUTHENTICATED |
| `alg:none` | same | Rejected (algorithm pinned) |
| Missing `exp` | same | Rejected |
| Expiry mid-stream (Subscribe) | same | Stream ends with UNAUTHENTICATED |
| Another user's session | same | PERMISSION_DENIED for cross-tenant access |
| Session not found | same | NOT_FOUND for unknown session id |
| OpenSession sets owner | `tests/gateway/session-owner.test.ts` (new) | `session.ownerId == payload.sub` |
| Dedupe scoped by principal+session | `tests/gateway/dedupe-scoping.test.ts` (new) | Same request_id across different principals doesn't collide |
| Ordering scoped by principal+session | `tests/gateway/ordering-scoping.test.ts` (new) | Separate orderers per principal+session |
| Restore re-imports B-reps | `tests/gateway/restore-breps.test.ts` (new) | Restore imports B-reps, doesn't resume |
| Existing gateway tests | `tests/gateway/connect-server.test.ts` etc. | Use `createTestToken()` helper; pass unchanged |

Existing tests in `src/core/gateway/*test.ts` (dedupe, ordering, session-manager) need a test-token helper (`createTestToken`) to pass unchanged under auth.

---

## 7. Configuration

Auth config reads from env vars:

- `WEBCAD_JWT_SECRET` — JWT signing/verification secret (default: `dev-secret-change-in-production`)
- `WEBCAD_JWT_ISSUER` — expected issuer claim (optional)
- `WEBCAD_JWT_AUDIENCE` — expected audience claim (optional)
- `NODE_ENV` — if `production` and secret is default, gateway refuses to start

No new env vars needed.

---

## 8. Decision Log

| Decision | Rationale |
|----------|-----------|
| **Drop `AuthHello`** | Version negotiation belongs to `OpenSession` (per approved design). `AuthHello` takes a bearer JWT and can only echo it — nothing to hand out. Duplicates `OpenSession`. |
| **Session id from client `x-session-id`** | Not from JWT `sub` (that's the user, giving one session per user). Sticky routing uses client-generated session ids in `x-session-id` header. |
| **Connect interceptor over per-handler `requireAuth`** | Per-handler calls miss routes. One interceptor covers all 8 RPCs uniformly. |
| **`ConnectError` not plain `Error`** | Connect maps plain `Error` with `.code` to `unknown`. `ConnectError` carries the correct gRPC status code. |
| **Generic client messages, detailed logs** | Prevents leaking auth internals to clients; operators can still diagnose from logs. |
| **`Restore` = re-import B-reps** | Resume is `Subscribe(last_event_id)` + `OpenSession` with existing id. `Restore` re-imports B-rep shapes into the session kernel. |
| **Dedupe/ordering keyed by principal+session** | Prevents request_id collisions across tenants on shared gateway. |
| **Rate: B** | Security work benefits from external security review before production deployment. |

---

## 9. Proto Details

- Service name in proto: `EngineGatewayService` (Connect client stub may reference it as `EngineGateway`)
- No one-member `oneof` in `AuthHelloRequest` (dropped with AuthHello)
- Protobuf generator: `buf generate` with `protoc-gen-connect-es` + `protoc-gen-es` per `buf.gen.yaml`
- v1/v2 question unresolved — no proto changes in this ticket

---

## 10. Files Changed

| File | Action |
|------|--------|
| `src/core/gateway/auth.ts` | Add `AuthError` (extends `ConnectError`), pin algorithm, require `exp`, clock-skew, fail-closed default secret, `createTestToken()` helper |
| `src/core/gateway/auth-interceptor.ts` | New — Connect interceptor for all 8 EngineGateway RPCs; JWT validation + session ownership |
| `src/core/gateway/connect-server.ts` | Wire `authInterceptor` into all routes; remove per-handler auth; `OpenSession` sets owner |
| `src/core/gateway/session-manager.ts` | Add `ownerId` to `SessionInfo`; `createSession(..., ownerId)` |
| `src/core/gateway/dedupe.ts` | Key dedupe by `${principal}:${sessionId}:${requestId}` |
| `src/core/gateway/ordering.ts` | Key orderers by `${principal}:${sessionId}` |
| `tests/gateway/auth-interceptor.test.ts` | New — table-driven all-RPC auth test |
| `tests/gateway/session-owner.test.ts` | New — OpenSession sets owner, cross-tenant denied |
| `tests/gateway/dedupe-scoping.test.ts` | New — dedupe scoped by principal+session |
| `tests/gateway/ordering-scoping.test.ts` | New — ordering scoped by principal+session |
| `tests/gateway/restore-breps.test.ts` | New — Restore re-imports B-reps |
| `tests/gateway/connect-server.test.ts` | Modified — use `createTestToken()` helper |

---

## 11. Success Criteria

- All 8 `EngineGateway` RPCs reject missing/invalid JWT with `UNAUTHENTICATED`
- Cross-tenant session access returns `PERMISSION_DENIED`
- Unknown session id returns `NOT_FOUND`
- `OpenSession` records `ownerId = sub` from JWT
- Dedupe and ordering keys scoped by principal+session
- Gateway refuses to start with default secret in production
- `alg:none`, missing `exp`, tampered signature all rejected
- Subscribe ends stream with `UNAUTHENTICATED` on token expiry
- Existing gateway unit tests pass with `createTestToken()` helper
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run buf:lint` all pass