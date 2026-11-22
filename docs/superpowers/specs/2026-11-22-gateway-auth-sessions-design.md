# WC-EC-27 Design: Gateway Auth Hello + Sessions

**Ticket:** WC-EC-27 — Gateway: gRPC server, auth hello, sessions  
**Priority:** high · **Agent:** A · **Phase:** 3  
**Status:** Proposed (design doc)

---

## 1. Problem Statement

The gateway (`src/core/gateway/connect-server.ts`) already implements the Connect-over-HTTP/2 protocol with session management, ordering, dedupe, and kernel supervision. However:

1. **Auth exists but isn't wired** — `JwtAuthenticator` (`auth.ts`) is built but never called by any gateway route. `OpenSession` and `Execute` accept requests without validating JWTs.
2. **No "auth hello" handshake** — Clients have no unauthenticated entry point to obtain a token before creating a session.
3. **Session lifecycle is informal** — `OpenSession`/`Restore`/`CloseSession` exist but there's no explicit resume/rehydrate handshake for reconnecting clients.

WC-EC-27 closes these gaps without adding a redundant gRPC server for clients (the gRPC in this architecture is gateway→kernel, internal; browser clients use Connect over HTTP/2).

---

## 2. Scope

**In scope:**
- New `AuthHello` RPC on `EngineGatewayService` — unauthenticated entry point that validates client credentials and returns an auth token
- JWT validation wired into `OpenSession` and `Execute`/`Restore` routes in `connect-server.ts`
- Session lifecycle formalized: `OpenSession` creates session, `Restore` resumes/replays, `CloseSession` terminates
- Unit tests for auth wiring and session lifecycle

**Out of scope:**
- Adding a separate gRPC server for browser clients (redundant with Connect)
- OAuth2, OIDC, or third-party identity providers
- Session persistence across gateway restarts (Phase 3 ticket WC-EC-30 covers session resume/rehydrate/restoreMany)

---

## 3. Architecture

### 3.1 Components

| Component | Responsibility | File |
|-----------|---------------|------|
| `JwtAuthenticator` | Validate JWT from `Authorization: Bearer` header | `src/core/gateway/auth.ts` (existing) |
| `SessionManager` | Per-session state, event buffers, heartbeat | `src/core/gateway/session-manager.ts` (existing) |
| `connect-server.ts` | Connect protocol server; routes wired to `defaultGatewayImpl` | `src/core/gateway/connect-server.ts` (modify) |
| `kernel-supervisor.ts` | One kernel process per session, spare pool, crash recovery | `src/core/gateway/kernel-supervisor.ts` (existing) |
| `dedupe.ts` / `ordering.ts` | Request deduplication + client_seq ordering | existing |

### 3.2 Data Flow

**Auth Hello:**
```
Client ── AuthHello({bearer: token}) ──► Gateway ── JwtAuthenticator.verifyToken() ──► {token, expires_in}
```

**OpenSession (authenticated):**
```
Client ── OpenSession(Authorization: Bearer <token>) ──► Gateway ── validate JWT ──► SessionManager.createSession() ──► {session_id, ...}
```

**Execute (authenticated + ordered):**
```
Client ── Execute(session_id, request_id, client_seq) ──► Gateway ── validate JWT ──► dedupe ──► orderer ──► kernel ──► result
```

---

## 4. Interface Changes

### 4.1 Proto: New `AuthHello` RPC

Add to `EngineGatewayService` in `proto/webcad/engine/v1/engine.proto`:

```proto
rpc AuthHello(AuthHelloRequest) returns (AuthHelloResponse);

message AuthHelloRequest {
  string client_version = 1;
  oneof auth {
    string bearer = 2;  // JWT bearer token
  }
}

message AuthHelloResponse {
  string token = 1;
  int64 expires_in = 2;       // seconds until expiry
  string protocol_version = 3;
  string session_id = 4;      // optional: pre-assigned session id if token contains session claim
}
```

**AuthHelloRequest** is unauthenticated — no session required. The gateway validates the `bearer` JWT and returns a token.

### 4.2 connect-server.ts: `defaultGatewayImpl` changes

- **`OpenSession`**: Require `Authorization: Bearer <token>` header. Validate via `JwtAuthenticator.authenticate()`. Extract `sessionId` from JWT payload (`sub` or `sessionId` claim). Reject with `UNAUTHENTICATED` if invalid or missing.
- **`Execute` / `Restore`**: Require valid JWT on every call. Reject unauthenticated requests with `UNAUTHENTICATED`.
- **`AuthHello`**: New handler. Validate the bearer token; return `{token, expires_in, protocol_version, session_id}`.

### 4.3 Auth helper

Add to `auth.ts` (or inline in `connect-server.ts`):

```typescript
export function requireAuth(authorization?: string): JWTPayload {
  const result = authenticator.authenticate(authorization);
  if (!result.authenticated || !result.payload) {
    const err = new Error(`UNAUTHENTICATED: ${result.error}`);
    (err as any).code = 'UNAUTHENTICATED';
    throw err;
  }
  return result.payload;
}
```

---

## 5. Error Handling

| Situation | Status Code | Message |
|-----------|------------|---------|
| Missing `Authorization` header | `UNAUTHENTICATED` | "Missing Authorization header" |
| Invalid JWT format | `UNAUTHENTICATED` | "Invalid JWT format" |
| Expired token | `UNAUTHENTICATED` | "Token expired" |
| Invalid issuer/audience | `UNAUTHENTICATED` | "Invalid issuer" / "Invalid audience" |
| Valid auth, missing session_id | `INVALID_ARGUMENT` | "missing session_id or request_id" |

Connect errors map to gRPC status codes per the Connect Node adapter conventions.

---

## 6. Testing

| Test | File | What it verifies |
|------|------|-----------------|
| AuthHello valid token | `tests/gateway/auth-hello.test.ts` (new) | Returns token + expires_in for valid JWT |
| AuthHello invalid token | same | Rejects invalid/expired JWT |
| OpenSession requires auth | `tests/gateway/open-session-auth.test.ts` (new) | Rejects missing/invalid JWT |
| Execute requires auth | `tests/gateway/execute-auth.test.ts` (new) | Rejects missing/invalid JWT |
| Session lifecycle | `tests/gateway/session-lifecycle.test.ts` (new) | Open → Execute → Restore → Close flow |

Existing tests in `src/core/gateway/*test.ts` (dedupe, ordering, session-manager) continue to pass unchanged.

---

## 7. Configuration

Auth config already reads from env vars in `auth.ts`:

- `WEBCAD_JWT_SECRET` — JWT signing/verification secret (default: `dev-secret-change-in-production`)
- `WEBCAD_JWT_ISSUER` — expected issuer claim (optional)
- `WEBCAD_JWT_AUDIENCE` — expected audience claim (optional)

No new env vars needed.

---

## 8. Files Changed

| File | Action |
|------|--------|
| `proto/webcad/engine/v1/engine.proto` | Add `AuthHello` RPC + request/response messages |
| `src/generated/proto/webcad/engine/v1/engine_pb.ts` | Regenerated from proto (via `buf generate`) |
| `src/core/gateway/connect-server.ts` | Wire auth into `OpenSession`/`Execute`/`Restore`; add `AuthHello` handler |
| `src/core/gateway/auth.ts` | Add `requireAuth()` helper (optional; can inline) |
| `tests/gateway/auth-hello.test.ts` | New — AuthHello tests |
| `tests/gateway/open-session-auth.test.ts` | New — OpenSession auth tests |
| `tests/gateway/execute-auth.test.ts` | New — Execute auth tests |
| `tests/gateway/session-lifecycle.test.ts` | New — session lifecycle tests |

---

## 9. Success Criteria

- `AuthHello` returns a valid token for a correct JWT, rejects invalid/expired JWTs
- `OpenSession` without valid JWT returns `UNAUTHENTICATED`
- `Execute`/`Restore` without valid JWT returns `UNAUTHENTICATED`
- All existing gateway unit tests pass
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run buf:lint` all pass