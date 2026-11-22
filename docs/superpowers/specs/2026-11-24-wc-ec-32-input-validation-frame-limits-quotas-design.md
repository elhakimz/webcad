# WC-EC-32: Input Validation, Frame Limits and Quotas

**Status:** Proposed  
**Ticket:** WC-EC-32  
**Priority:** High  
**Phase:** 3  
**Rating:** B (involves gateway + transport layers, validation logic, quota tracking)

---

## 1. Problem Statement

`ServerLimits` (defined in `proto/webcad/engine/v1/common.proto`) returns frame size limits and quota values from `OpenSession`, but they are purely informational — never enforced. The gateway accepts arbitrarily large requests/responses and allows unbounded concurrent operations per session. There is no input validation on command parameters (range, pattern) at the gateway level, and the client transport sends payloads without any pre-flight validation.

This creates several risks:
- **Oversized frames** can exhaust gateway memory or kernel resources.
- **Unbounded concurrency** per session can starve the kernel.
- **Invalid parameters** (negative dimensions, NaN, out-of-range angles) reach the kernel and produce cryptic failures.
- **No fail-fast on the client** — invalid payloads travel over the network before being rejected.

---

## 2. Goals

- Enforce `ServerLimits` frame limits (maxInlineRequestBytes, maxInlineResponseBytes) at the gateway for both `Execute` and `Restore` RPCs.
- Enforce per-session concurrent operation quota (`MAX_CONCURRENT_OPS_PER_SESSION`) at the gateway.
- Validate command input parameters at the gateway using `CommandRegistry.validate()` with range (`min`/`max`) and `pattern` checks.
- Add range (`min`/`max`) and `pattern` constraints to command parameter metadata across all primitive and boolean commands.
- Add client-side pre-flight validation in `RemoteGrpcTransport` (null/undefined payload, non-finite numbers) to fail fast before network.
- Add client-side response size check to reject oversized responses early.
- All gateway errors use gRPC status codes (`INVALID_ARGUMENT`, `RESOURCE_EXHAUSTED`, `QUOTA_EXHAUSTED`) so the client can classify them correctly.

---

## 3. Non-Goals

- No changes to `proto/` (all needed messages and status codes already exist).
- No changes to `ServerLimits` values — they remain as defined in proto.
- No client-side range/pattern validation (that's the gateway's job; client only does type/finiteness pre-flight checks).
- No per-session blob size quota beyond existing `dedupe.ts`/`session-manager.ts` caps.
- No changes to commands or UI layers — they consume via `OpenCascadeService` → `RemoteGrpcTransport`.

---

## 4. Design

### 4.1 CommandRegistry validation extension (`src/core/gateway/command-registry.ts`)

**`CommandParameter` interface** extended with optional fields:

```typescript
export interface CommandParameter {
  type: 'number' | 'string' | 'boolean' | 'object' | 'array';
  required?: boolean;
  description?: string;
  min?: number;      // NEW: inclusive minimum for numbers
  max?: number;      // NEW: inclusive maximum for numbers
  pattern?: string;  // NEW: regex pattern for strings
}
```

**New `validateRange()` helper:**

```typescript
function validateRange(paramName: string, value: unknown, def: CommandParameter): string[] {
  const errors: string[] = [];
  if (typeof value !== 'number') return errors;
  if (def.min !== undefined && value < def.min) {
    errors.push(`Parameter "${paramName}" must be >= ${def.min}, got ${value}`);
  }
  if (def.max !== undefined && value > def.max) {
    errors.push(`Parameter "${paramName}" must be <= ${def.max}, got ${value}`);
  }
  return errors;
}
```

**`validate()` method** updated to call `validateRange()` after type validation for numbers, and pattern check for strings:

```typescript
// After type check passes for numbers:
const rangeErrors = validateRange(paramName, value, paramDef);
errors.push(...rangeErrors);

// After type check passes for strings:
if (def.pattern && typeof value === 'string') {
  const regex = new RegExp(def.pattern);
  if (!regex.test(value)) {
    errors.push(`Parameter "${paramName}" does not match required pattern: ${def.pattern}`);
  }
}
```

### 4.2 Command metadata constraints

Range constraints added to all primitive/boolean command parameters:

| Command | Parameters with `min: 0` | Parameters with `min` + `max` |
|---------|-------------------------|-------------------------------|
| box | dx, dy, dz, deflection | — |
| cylinder | r, h, deflection | — |
| sphere | r, deflection | — |
| cone | r, h, deflection | — |
| frustum | r1, r2, h, deflection | — |
| torus | r1, r2, deflection | — |
| extrude | height, deflection | — |
| revolve | deflection | angle: `min: 0, max: 2π` |
| scale | factor, deflection, factorX, factorY, factorZ | — |

### 4.3 Gateway enforcement (`src/core/gateway/connect-server.ts`)

**New constants:**

```typescript
const MAX_INLINE_REQUEST_BYTES = 4 * 1024 * 1024;   // 4 MiB
const MAX_INLINE_RESPONSE_BYTES = 4 * 1024 * 1024;  // 4 MiB
const MAX_CONCURRENT_OPS_PER_SESSION = 16;
```

**New state:**

```typescript
const concurrentOps = new Map<string, Set<string>>(); // sessionId -> Set of requestIds
```

**`Execute` method flow:**

1. Header validation (sessionId, requestId present)
2. **Input validation** — `commandRegistry.validate(opName, payload)` → `INVALID_ARGUMENT` on failure
3. **Frame limit check** — `Buffer.byteLength(JSON.stringify(request)) > MAX_INLINE_REQUEST_BYTES` → `RESOURCE_EXHAUSTED`
4. **Quota check** — `concurrentOps.get(sessionId)?.size >= MAX_CONCURRENT_OPS_PER_SESSION` → `QUOTA_EXHAUSTED`
5. Dedupe lookup
6. Orderer submit → `executeOnKernel`
7. **Response size check** — response serialized size > `MAX_INLINE_RESPONSE_BYTES` → `RESOURCE_EXHAUSTED`
8. Dedupe complete
9. **Cleanup in `finally`** — remove requestId from `concurrentOps[sessionId]`

**`Restore` method flow:** Same as Execute but for restore items (steps 1-9 with restore-specific payload).

### 4.4 Client-side validation (`src/core/io/RemoteGrpcTransport.ts`)

**New `validatePayload()` private method** called at the start of `execute()`:

```typescript
private validatePayload(opName: string, payload: unknown): void {
  if (payload === null || payload === undefined) {
    throw new GrpcTransportError('INVALID_ARGUMENT', `Payload for ${opName} must not be null or undefined`);
  }
  if (typeof payload !== 'object') {
    throw new GrpcTransportError('INVALID_ARGUMENT', `Payload for ${opName} must be an object`);
  }
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new GrpcTransportError('INVALID_ARGUMENT', `${opName}.${key} must be a finite number, got ${value}`);
    }
  }
}
```

**Response size check** after receiving response from gateway:

```typescript
const responseSize = Buffer.byteLength(JSON.stringify(response));
if (responseSize > 4 * 1024 * 1024) {
  throw new GrpcTransportError('RESOURCE_EXHAUSTED', `Response size ${responseSize} exceeds max inline size`);
}
```

### 4.5 Data flow

```
Client (RemoteGrpcTransport)
  1. validatePayload(payload) → fail fast on null/NaN/Infinity
  2. Send ExecuteRequest to gateway
  3. Receive response → check size ≤ 4MiB

Gateway (connect-server.ts)
  1. Validate header
  2. commandRegistry.validate(op, params) → INVALID_ARGUMENT on range/pattern/type failure
  3. Check request size ≤ 4MiB → RESOURCE_EXHAUSTED
  4. Check concurrent ops per session ≤ 16 → QUOTA_EXHAUSTED
  5. Dedupe lookup
  6. Orderer → executeOnKernel
  7. Check response size ≤ 4MiB → RESOURCE_EXHAUSTED
  8. Dedupe complete
  9. finally: cleanup concurrent ops tracking
```

---

## 5. Error Handling

| Error | Code | When | Retryable? |
|-------|------|------|------------|
| Missing required param | `INVALID_ARGUMENT` | validate() fails | No |
| Wrong type | `INVALID_ARGUMENT` | validate() type check fails | No |
| Below min / above max | `INVALID_ARGUMENT` | validateRange() fails | No |
| Pattern mismatch | `INVALID_ARGUMENT` | string pattern check fails | No |
| Request too large | `RESOURCE_EXHAUSTED` | frame limit exceeded | No |
| Response too large | `RESOURCE_EXHAUSTED` | frame limit exceeded | No |
| Concurrent ops exceeded | `QUOTA_EXHAUSTED` | per-session limit exceeded | No |
| Client null payload | `INVALID_ARGUMENT` | validatePayload() | No |
| Client NaN/Infinity | `INVALID_ARGUMENT` | validatePayload() | No |

`QUOTA_EXHAUSTED` and `RESOURCE_EXHAUSTED` are already in `NON_RETRYABLE_CODES` in `RemoteGrpcTransport.ts`, so the client will not retry these errors.

---

## 6. Tests

### 6.1 CommandRegistry (`src/core/gateway/command-registry.test.ts`)

- Range min: value below min → error `Parameter "X" must be >= N, got V`
- Range min: value at min → valid
- Range max: value above max → error `Parameter "X" must be <= N, got V`
- Range max: value at max → valid
- Range within bounds → valid
- Pattern: string not matching → error `Parameter "X" does not match required pattern: P`
- Pattern: string matching → valid
- Pattern: missing optional string → valid (skipped)

### 6.2 RemoteGrpcTransport (`src/core/io/__tests__/RemoteGrpcTransport.test.ts`)

- Null/undefined payload → `INVALID_ARGUMENT` (via createBox with NaN/Infinity)
- NaN payload → `INVALID_ARGUMENT`
- Infinity payload → `INVALID_ARGUMENT`
- -Infinity payload → `INVALID_ARGUMENT`
- Valid finite numbers → passed to `execute`
- Oversized response (>4MiB) → `RESOURCE_EXHAUSTED`

### 6.3 Existing tests preserved

All existing command tests (box.test.ts, etc.) and transport tests continue to pass.

---

## 7. Acceptance Criteria

- [x] `npm run typecheck` passes (0 errors)
- [x] `npm run lint` passes (0 errors)
- [x] `npm test` passes (all 747 existing + new tests)
- [x] `npm run buf:lint` passes (no proto changes needed)
- [ ] Gateway `Execute`/`Restore` enforce input validation, frame limits, and quota
- [ ] Client `RemoteGrpcTransport` does pre-flight validation and response size check
- [ ] Command parameter metadata has min/max/pattern constraints
- [ ] Design doc written and reviewed (this document)

---

## 8. Open Questions

None — all decisions resolved.

---

## 9. Agent Rating

**B** — spans gateway and transport layers, introduces validation logic, quota tracking, and frame limit enforcement with proper error codes and cleanup.