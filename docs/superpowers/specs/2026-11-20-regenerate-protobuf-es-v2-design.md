# Regenerate protobuf with protoc-gen-es v2

**Status:** Draft — awaiting user approval  
**Supersedes:** `docs/superpowers/specs/2026-11-20-vitest-protobuf-alias-fix-design.md` (alias-fix spec)  
**Related bug:** bug-087 in `.wolf/buglog.json`

## Goal

Regenerate all protobuf artifacts with `protoc-gen-es` v2 (target=ts), dropping `protoc-gen-connect-es` v1 and the `src/compat/*` shims, so `@bufbuild/protobuf` v2.x and `@connectrpc/connect` v2.3.0 work natively without aliases. This unblocks `npm run verify`'s vitest step (18 suites currently fail).

## Step 0 Spike Result (completed)

A scratch vitest run with exact-match aliases successfully loaded `@bufbuild/protobuf` v2.x and ran a connect-node server + connect-es client against the **current** `engine_connect.ts` (v1 `ServiceType`).

- Server responded `{}` to `OpenSession` — the v1 service shape is accepted by `connectNodeAdapter`.
- Client threw at runtime:
  ```
  TypeError: Cannot read properties of undefined (reading 'toString')
   ❯ createMethodUrl .../create-method-url.js:31:10
   ❯ Object.stream .../protocol-connect/transport.js:146:26
   ❯ Object.openSession .../promise-client.js:73:63
  ```
- Root cause confirmed: v1-generated `ServiceType` objects (`{ typeName, methods: Record<string, ...> }`) do not have the `DescService` structure Connect v2's promise-client expects (`methods` as array with `localName`, `parent.typeName`, etc.).

**Conclusion:** The alias shim is a band-aid; regeneration with protoc-gen-es v2 is the correct fix.

## Regeneration Sizing

### Generated files (3 total)
| File | Purpose |
|------|---------|
| `src/generated/proto/webcad/engine/v1/engine_pb.ts` | Message types (OpenSessionRequest, ServerLimits, SessionEvent, KernelStatusEvent, etc.) |
| `src/generated/proto/webcad/engine/v1/engine_connect.ts` | Connect v1 ServiceType (EngineGatewayService, KernelService) |
| `src/generated/proto/webcad/engine/v1/common_pb.ts` | Shared types (CommandHeader, MeshData, BrepReference, ExecutionFailureCode, etc.) |

### Source call sites importing from `src/generated/` (3 files)

| File | Imports | Usage pattern |
|------|---------|---------------|
| `src/core/gateway/session-manager.ts` | `KernelStatus, SessionEvent` from `engine_pb.js` | Type-only (interfaces). No `new`, no `toBinary`/`fromBinary`. |
| `src/core/gateway/connect-server.ts` | `EngineGatewayService, KernelService` from `engine_connect.js` | Wrapped via `toDescService()` to DescService for `router.service()`. No `new` on messages. |
| `src/core/io/RemoteGrpcTransport.ts` | `EngineGatewayService` from `engine_connect.js`; `SessionEvent` from `engine_pb.js`; `CommandHeader, MeshData, BrepReference, ExecutionFailureCode` from `common_pb.js` | `EngineGatewayService` cast `as any` to DescService. Others are type-only. No `new`, no `toBinary`/`fromBinary`. |

### Test call sites (1 file)

| File | Usage |
|------|-------|
| `src/core/io/__tests__/RemoteGrpcTransport.test.ts` | Mocks `CommandHeader, MeshData, BrepReference, SessionEvent` as empty classes with `toBinary()`/`fromBinary()` stubs. No real protobuf construction. |

### Protobuf feature usage in generated code

| Feature | Files | Count |
|---------|-------|-------|
| `new Xxx().fromBinary(...)` | `engine_pb.ts`, `common_pb.ts` | Every message has static `fromBinary` |
| `toBinary()` | `engine_pb.ts`, `common_pb.ts` | Every message has instance `toBinary` |
| oneof fields | `engine_pb.ts` | `ExecuteRequest.op` (20+ cases), `SessionEvent.payload` |
| int64/uint64 fields | `common_pb.ts` | `client_seq`, `event_id`, `size`, `max_message_size`, etc. |
| bytes fields | `common_pb.ts` | `BrepReference.data`, `MeshData.positions/indices/face_mapping/edge_offsets/edge_lines` |
| Enum types | `engine_pb.ts`, `common_pb.ts` | `KernelStatus`, `ExecutionFailureCode`, `BrepReference.Format` |
| `@ts-nocheck` | All 3 generated files | Typecheck skips generated code |

**Total source call sites to migrate: 3 files (type-only usage, no message construction)**  
**Total test call sites: 1 file (mocks only)**  
**Estimated effort: 2–4 hours** (mechanical: regenerate, update imports, delete shims, run verify)

## Plan

### 1. Update `buf.gen.yaml`

Replace `protoc-gen-connect-es` v1 plugin with `protoc-gen-es` v2 only. The v2 plugin generates both message code and Connect service code (DescService-based), so a separate connect plugin is no longer needed.

```yaml
version: v2
plugins:
  - local: protoc-gen-es
    out: src/generated/proto
    opt: target=ts
```

**Human decision:** Remove `protoc-gen-connect-es` from `buf.gen.yaml`? (Proposed: yes — v2 generates Connect services natively.)

### 2. Update `package.json` dependencies

- `@bufbuild/protoc-gen-es`: v1.10.1 → v2.x (latest compatible with `@bufbuild/protobuf` v2.17.0)
- `@connectrpc/protoc-gen-connect-es`: v1.7.0 → **remove** (no longer needed with protoc-gen-es v2)
- `@bufbuild/protobuf`: v2.17.0 (keep)
- `@connectrpc/connect`: v2.3.0 (keep)
- `@connectrpc/connect-node`: keep (used by gateway server)

**Human decision:** Which exact version of `@bufbuild/protoc-gen-es` v2 to pin? (Proposed: latest v2 compatible with `@bufbuild/protobuf` v2.17.0.)

### 3. Regenerate protobuf

Run `buf generate` with `clean: true` to replace all 3 generated files with v2 output:
- `engine_pb.ts` — v2 Message classes with DescMessage
- `engine_connect.ts` — v2 DescService (replaces v1 ServiceType)
- `common_pb.ts` — v2 Message classes

### 4. Delete `src/compat/*`

| File | Reason |
|------|--------|
| `src/compat/protobuf-v1-compat.ts` | v1 compat shim on v2.x — no longer needed |
| `src/compat/protobuf-v1-compat-wire.ts` | wire shim — no longer needed |
| `src/compat/protobuf-v1-compat-wkt.ts` | wkt shim — no longer needed |
| `src/compat/protobuf-v1-compat-codegenv2.ts` | dead code — no longer needed |

**Human decision:** Delete all 4 compat files? (Proposed: yes.)

### 5. Remove aliases from `vite.config.ts` and `vitest.config.ts`

Delete the alias blocks in both configs. No shared alias module (`vite.aliases.ts`) is needed since aliases are being removed entirely.

**Human decision:** Remove aliases from both configs? (Proposed: yes.)

### 6. Migrate call sites

| File | Change |
|------|--------|
| `connect-server.ts` | Remove `toDescService()` wrapper; use `EngineGatewayService` and `KernelService` directly as DescService (v2 output provides DescService natively) |
| `RemoteGrpcTransport.ts` | Remove `as any` cast on `EngineGatewayService`; use directly as DescService |
| `session-manager.ts` | No change needed (type-only imports) |
| `RemoteGrpcTransport.test.ts` | Update mocks if v2 API changes the shape of `toBinary`/`fromBinary` |

**Human decision:** Try `npx @connectrpc/connect-migrate` for mechanical migration? (Proposed: yes, attempt first; manual fallback if it doesn't cover all cases.)

### 7. Delete `*_connect.ts` outputs

The v2 `protoc-gen-es` generates Connect services in the same `_pb.ts` file (or a separate `_connect.ts` depending on plugin version). If a separate `_connect.ts` is emitted alongside `_pb.ts`, delete the old v1 `engine_connect.ts` and use the v2 output. If v2 emits everything into `_pb.ts`, delete `engine_connect.ts`.

**Human decision:** Handle `engine_connect.ts` deletion based on actual v2 output layout. (Proposed: delete old v1 `engine_connect.ts`, use whatever v2 emits.)

## Acceptance Criteria

| Criterion | How verified |
|-----------|-------------|
| `npm run verify` passes (typecheck + lint + test + buf:lint + buf:breaking) | Run `npm run verify` |
| 18 previously failing vitest suites now pass | Compare vitest output before/after |
| No previously passing test regresses | Record counts before (65 suites / 390 tests) and after |
| Behavior tests pass: toBinary/fromBinary round trip, oneof, bytes field, int64 field, enum JSON round trip | New vitest tests in `src/core/io/__tests__/` or existing test files |
| Connect round trip (connect-node server + connect-es client) using generated service, in vitest | New vitest test |
| `npm run build` succeeds | Run `npm run build` |
| Dev-server smoke check: `npm run dev` starts without protobuf errors | Start dev server, check console for 0 protobuf-related errors |
| `buf:lint` passes with no errors | Run `buf lint` |
| `buf:breaking` passes against baseline | Run `buf breaking` against `main` branch (baseline = `main`) |

**buf:breaking success definition:** When no baseline ref exists, use `main` as the baseline. `buf breaking` against `main` must report no breaking changes (field deletions, type changes, enum value removals, etc.).

**"65/18" clarification:** 65 = passing test suites, 18 = failing test suites (counts suites, not individual tests). 390 = passing individual tests.

## Why not regenerate now? (N/A — regeneration IS the plan)

This spec replaces the alias-fix approach entirely. Regeneration with protoc-gen-es v2 is the recommended path because:
- Connect v2 (2.3.0) requires DescService, which only protoc-gen-es v2 produces
- The alias shim is a workaround that masks the root cause
- No known blocker (`bug-087`) prevents regeneration

**protobuf-es version:** v2.x (via `@bufbuild/protoc-gen-es`)  
**connect-es version:** v2.3.0 (`@connectrpc/connect`)  
**Generated files carry `@ts-nocheck`:** Yes — typecheck does not validate generated code

## Open Decisions (need human input)

| Decision | Proposed default |
|----------|-----------------|
| Remove `protoc-gen-connect-es` from `buf.gen.yaml` and `package.json`? | Yes |
| Pin `@bufbuild/protoc-gen-es` to which v2 version? | Latest compatible with `@bufbuild/protobuf` v2.17.0 |
| Delete all 4 `src/compat/*` files? | Yes |
| Remove aliases from `vite.config.ts` and `vitest.config.ts`? | Yes |
| Try `npx @connectrpc/connect-migrate` for call-site migration? | Yes, attempt first |
| Delete old v1 `engine_connect.ts`? | Yes, after v2 regeneration |
| Baseline for `buf:breaking`? | `main` branch |

## Risks

| Risk | Mitigation |
|------|------------|
| v2 generated code has different API shape (e.g., method names, field access) | Review diff after regeneration; update call sites manually |
| `connect-migrate` doesn't cover all call sites | Manual fallback for remaining sites |
| `buf:breaking` reports changes due to codegen differences | Compare against `main` baseline; accept intentional changes |
| Vitest behavior tests need new mocks for v2 API | Write tests against actual v2 output |

## Exit Milestone

This shim/alias approach is removed entirely when `npm run verify` passes with v2-generated code. Owner: TBD (human decision). Link to bug-087: `.wolf/buglog.json`.
