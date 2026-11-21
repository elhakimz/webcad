# Regenerate protobuf with protoc-gen-es v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regenerate all protobuf artifacts with `protoc-gen-es` v2 (target=ts), drop `protoc-gen-connect-es` v1 and `src/compat/*` shims, so `@bufbuild/protobuf` v2.x and `@connectrpc/connect` v2.3.0 work natively without aliases. Unblocks `npm run verify`'s vitest step (18 suites currently fail).

**Architecture:** Replace v1-generated protobuf code (v1 `ServiceType` objects incompatible with Connect v2's `DescService`) with v2-generated code that natively produces `DescService` and `DescMessage`. Remove all alias shims and compat layers. Migrate 3 source call sites that import from `src/generated/`.

**Tech Stack:** `@bufbuild/protoc-gen-es` v2, `@bufbuild/protobuf` v2.17.0, `@connectrpc/connect` v2.3.0, `@connectrpc/connect-node`, Vitest 4.1.5, TypeScript, Vite

---

## Chunk 1: Dependency and Config Changes

### Task 1: Update buf.gen.yaml

**Files:**
- Modify: `C:\Dev\webcad\buf.gen.yaml`

- [ ] **Step 1: Edit buf.gen.yaml**

Replace the `protoc-gen-connect-es` plugin with `protoc-gen-es` v2 only. The v2 plugin generates both message code and Connect service code natively.

```yaml
version: v2
plugins:
  - local: protoc-gen-es
    out: src/generated/proto
    opt: target=ts
```

Expected: File now has only one plugin entry (protoc-gen-es).

- [ ] **Step 2: Commit**

```bash
git add buf.gen.yaml
git commit -m "chore: replace protoc-gen-connect-es with protoc-gen-es v2 in buf.gen.yaml"
```

### Task 2: Update package.json dependencies

**Files:**
- Modify: `C:\Dev\webcad\package.json`

- [ ] **Step 3: Edit package.json**

Update `@bufbuild/protoc-gen-es` from v1.10.1 to v2.x. Remove `@connectrpc/protoc-gen-connect-es` v1.7.0.

Before (approximate):
```json
"devDependencies": {
  "@bufbuild/protoc-gen-es": "^1.10.1",
  "@connectrpc/protoc-gen-connect-es": "^1.7.0"
}
```

After:
```json
"devDependencies": {
  "@bufbuild/protoc-gen-es": "^2.0.0"
}
```

Expected: `@connectrpc/protoc-gen-connect-es` removed, `@bufbuild/protoc-gen-es` at v2.x.

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `npm install` completes without errors. `@connectrpc/protoc-gen-connect-es` no longer in node_modules.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: update protoc-gen-es to v2, remove protoc-gen-connect-es"
```

---

## Chunk 2: Regenerate Protobuf and Delete Shims

### Task 3: Regenerate protobuf with buf generate

**Files:**
- Modify: `C:\Dev\webcad\src\generated\proto\webcad\engine\v1\engine_pb.ts` (regenerated)
- Modify: `C:\Dev\webcad\src\generated\proto\webcad\engine\v1\engine_connect.ts` (regenerated)
- Modify: `C:\Dev\webcad\src\generated\proto\webcad\engine\v1\common_pb.ts` (regenerated)

- [ ] **Step 6: Run buf generate with clean**

```bash
npx buf generate --template buf.gen.yaml
```

Expected: All 3 generated files replaced with v2 output. `engine_connect.ts` now exports `DescService` objects instead of v1 `ServiceType`. Verify by checking that the file contains `DescService` structure (methods array with `localName`).

- [ ] **Step 7: Commit**

```bash
git add src/generated/proto/webcad/engine/v1/
git commit -m "chore: regenerate protobuf with protoc-gen-es v2"
```

### Task 4: Delete src/compat/* shim files

**Files:**
- Delete: `C:\Dev\webcad\src\compat\protobuf-v1-compat.ts`
- Delete: `C:\Dev\webcad\src\compat\protobuf-v1-compat-wire.ts`
- Delete: `C:\Dev\webcad\src\compat\protobuf-v1-compat-wkt.ts`
- Delete: `C:\Dev\webcad\src\compat\protobuf-v1-compat-codegenv2.ts`

- [ ] **Step 8: Delete all 4 compat files**

```bash
rm src/compat/protobuf-v1-compat.ts src/compat/protobuf-v1-compat-wire.ts src/compat/protobuf-v1-compat-wkt.ts src/compat/protobuf-v1-compat-codegenv2.ts
```

Expected: All 4 files removed. `src/compat/` directory may be empty.

- [ ] **Step 9: Commit**

```bash
git add -A src/compat/
git commit -m "chore: delete protobuf v1 compat shim files"
```

---

## Chunk 3: Remove Aliases from Vite Configs

### Task 5: Remove aliases from vite.config.ts

**Files:**
- Modify: `C:\Dev\webcad\vite.config.ts`

- [ ] **Step 10: Remove alias blocks from vite.config.ts**

Remove the 4 exact-match regex aliases for `@bufbuild/protobuf` subpaths. If the file has a shared alias module import, remove that too.

Expected: `vite.config.ts` no longer references `@bufbuild/protobuf` aliases or `vite.aliases.ts`.

- [ ] **Step 11: Commit**

```bash
git add vite.config.ts
git commit -m "chore: remove protobuf aliases from vite.config.ts"
```

### Task 6: Remove aliases from vitest.config.ts

**Files:**
- Modify: `C:\Dev\webcad\vitest.config.ts`

- [ ] **Step 12: Remove alias blocks from vitest.config.ts**

Remove any alias configuration. Vitest should now load `@bufbuild/protobuf` v2.x natively from node_modules.

Expected: `vitest.config.ts` has no `@bufbuild/protobuf` aliases. `test.exclude` list unchanged.

- [ ] **Step 13: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: remove protobuf aliases from vitest.config.ts"
```

---

## Chunk 4: Migrate Call Sites

### Task 7: Migrate connect-server.ts

**Files:**
- Modify: `C:\Dev\webcad\src\core\gateway\connect-server.ts`

- [ ] **Step 14: Remove toDescService() wrapper**

Delete the `toDescService()` function (lines ~20-60). Remove `import type { DescService, DescMethod } from '@bufbuild/protobuf'`. Change `const EngineGatewayServiceDesc = toDescService(EngineGatewayService as any)` to `const EngineGatewayServiceDesc = EngineGatewayService`. Same for `KernelServiceDesc`.

Expected: `connect-server.ts` uses `EngineGatewayService` and `KernelService` directly as DescService (v2 output provides DescService natively). No `as any` cast needed.

- [ ] **Step 15: Commit**

```bash
git add src/core/gateway/connect-server.ts
git commit -m "chore: migrate connect-server.ts to v2 DescService"
```

### Task 8: Migrate RemoteGrpcTransport.ts

**Files:**
- Modify: `C:\Dev\webcad\src\core\io\RemoteGrpcTransport.ts`

- [ ] **Step 16: Remove as any cast on EngineGatewayService**

Change `const EngineGatewayServiceDesc = EngineGatewayService as any` to `const EngineGatewayServiceDesc = EngineGatewayService`. Remove any related type casts.

Expected: `RemoteGrpcTransport.ts` uses `EngineGatewayService` directly as DescService. No `as any` cast.

- [ ] **Step 17: Commit**

```bash
git add src/core/io/RemoteGrpcTransport.ts
git commit -m "chore: migrate RemoteGrpcTransport.ts to v2 DescService"
```

### Task 9: Verify session-manager.ts needs no changes

**Files:**
- Modify: `C:\Dev\webcad\src\core\gateway\session-manager.ts` (no changes expected)

- [ ] **Step 18: Confirm session-manager.ts uses types only**

Verify that `session-manager.ts` only imports `KernelStatus` and `SessionEvent` as types (no `new`, no `toBinary`/`fromBinary`). No changes needed.

Expected: Confirmed no changes needed for `session-manager.ts`.

- [ ] **Step 19: Commit** (skip if no changes)

---

## Chunk 5: Update Test File

### Task 10: Update RemoteGrpcTransport.test.ts mocks

**Files:**
- Modify: `C:\Dev\webcad\src\core\io/__tests__/RemoteGrpcTransport.test.ts`

- [ ] **Step 20: Update mock classes if v2 API changed**

Review the mock classes (`CommandHeader`, `MeshData`, `BrepReference`, `SessionEvent`) to ensure they match v2 generated API shape. The test already uses empty class stubs with `toBinary()`/`fromBinary()` — verify these still work with v2.

Expected: Test mocks updated if needed, or confirmed compatible with v2.

- [ ] **Step 21: Commit**

```bash
git add src/core/io/__tests__/RemoteGrpcTransport.test.ts
git commit -m "chore: update RemoteGrpcTransport.test.ts mocks for v2 protobuf"
```

---

## Chunk 6: Behavior Tests (TDD)

### Task 11: Write toBinary/fromBinary round trip test

**Files:**
- Create: `C:\Dev\webcad\src/core/io/__tests__/protobuf-v2-behavior.test.ts`

- [ ] **Step 22: Write failing test for toBinary/fromBinary round trip**

```typescript
import { describe, it, expect } from 'vitest';
import { CommandHeader } from '../../../generated/proto/webcad/engine/v1/common_pb';

describe('protobuf v2 behavior', () => {
  it('toBinary/fromBinary round trip preserves data', () => {
    const original = new CommandHeader();
    original.sessionId = 'session-123';
    original.requestId = 'req-456';
    original.clientSeq = 7n;

    const bytes = original.toBinary();
    const restored = CommandHeader.fromBinary(bytes);

    expect(restored.sessionId).toBe('session-123');
    expect(restored.requestId).toBe('req-456');
    expect(restored.clientSeq).toBe(7n);
  });
});
```

Expected: FAIL — `CommandHeader` may not have `sessionId`, `requestId`, `clientSeq` fields yet, or import path may be wrong. This is expected; we'll fix in next step.

- [ ] **Step 23: Run test to verify it fails**

```bash
npx vitest run src/core/io/__tests__/protobuf-v2-behavior.test.ts
```

Expected: FAIL (test not yet passing — may fail on import or field names).

- [ ] **Step 24: Fix test to match actual v2 generated API**

Update field names to match what `common_pb.ts` v2 actually generates (check actual field names after regeneration).

- [ ] **Step 25: Run test to verify it passes**

```bash
npx vitest run src/core/io/__tests__/protobuf-v2-behavior.test.ts
```

Expected: PASS.

- [ ] **Step 26: Commit**

```bash
git add src/core/io/__tests__/protobuf-v2-behavior.test.ts
git commit -m "test: add toBinary/fromBinary round trip test for protobuf v2"
```

### Task 12: Write oneof, bytes, int64, enum tests

**Files:**
- Modify: `C:\Dev\webcad\src/core/io/__tests__/protobuf-v2-behavior.test.ts`

- [ ] **Step 27: Add oneof field test**

```typescript
it('oneof field serialization works', () => {
  // Test ExecuteRequest with op oneof
});
```

- [ ] **Step 28: Add bytes field test**

```typescript
it('bytes field round trip preserves Uint8Array data', () => {
  // Test BrepReference.data or MeshData.positions
});
```

- [ ] **Step 29: Add int64 field test**

```typescript
it('int64/uint64 field round trip preserves BigInt', () => {
  // Test client_seq or size fields
});
```

- [ ] **Step 30: Add enum JSON round trip test**

```typescript
it('enum JSON round trip works', () => {
  // Test KernelStatus or ExecutionFailureCode enum serialization
});
```

- [ ] **Step 31: Run all behavior tests**

```bash
npx vitest run src/core/io/__tests__/protobuf-v2-behavior.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 32: Commit**

```bash
git add src/core/io/__tests__/protobuf-v2-behavior.test.ts
git commit -m "test: add oneof, bytes, int64, enum JSON round trip tests"
```

---

## Chunk 7: Connect Round Trip Test

### Task 13: Write Connect round trip test in vitest

**Files:**
- Modify: `C:\Dev\webcad\src/core/io/__tests__/protobuf-v2-behavior.test.ts` (or new file)

- [ ] **Step 33: Write Connect round trip test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { EngineGatewayService } from '../../../generated/proto/webcad/engine/v1/engine_connect';

describe('Connect round trip', () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(async () => {
    const handler = connectNodeAdapter({
      routes(router: any) {
        router.service(EngineGatewayService, {
          openSession: async (req: any) => ({
            protocolVersion: '1.0.0',
            minimumClientVersion: '1.0.0',
            serverLimits: {},
            heartbeatInterval: 15,
            kernelVersion: 'mock-1.0.0',
            occtVersion: 'mock-OCCT-7.7',
            supportedOperations: [],
          }),
        });
      },
    });

    server = createServer(handler);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it('OpenSession call succeeds', async () => {
    const transport = createConnectTransport(`http://127.0.0.1:${port}`);
    const client = createClient(EngineGatewayService, transport);

    const res = await client.openSession({});
    expect(res).toBeDefined();
    expect(res.kernelVersion).toBe('mock-1.0.0');
  });
});
```

Expected: FAIL initially if import path or API shape doesn't match v2.

- [ ] **Step 34: Run test to verify it fails then passes**

```bash
npx vitest run src/core/io/__tests__/protobuf-v2-behavior.test.ts
```

Expected: All tests PASS including Connect round trip.

- [ ] **Step 35: Commit**

```bash
git add src/core/io/__tests__/protobuf-v2-behavior.test.ts
git commit -m "test: add Connect round trip test with connect-node + connect-es"
```

---

## Chunk 8: Verification and Acceptance

### Task 14: Run full verify suite

**Files:** None (verification only)

- [ ] **Step 36: Run npm run verify**

```bash
npm run verify
```

Expected: All steps pass — typecheck, lint, test, buf:lint, buf:breaking. 0 failing vitest suites (was 18).

- [ ] **Step 37: Record before/after test counts**

Document: Before = 65 suites / 390 tests passing, 18 failing. After = 83 suites / 0 failing.

- [ ] **Step 38: Commit** (if any config changes needed to make verify pass)

### Task 15: Run npm run build

**Files:** None

- [ ] **Step 39: Run npm run build**

```bash
npm run build
```

Expected: Build completes without errors.

- [ ] **Step 40: Commit** (if needed)

### Task 16: Dev-server smoke check

**Files:** None

- [ ] **Step 41: Start dev server and check for protobuf errors**

```bash
npm run dev
```

Expected: Dev server starts on http://localhost:5173/ without protobuf-related errors in the console. Open browser dev tools to verify 0 console errors.

- [ ] **Step 42: Stop dev server**

Press `Ctrl+C` to stop the dev server.

- [ ] **Step 43: Final commit**

```bash
git add -A
git commit -m "chore: complete protobuf v2 regeneration — all acceptance criteria met"
```

---

## Acceptance Criteria Checklist

| Criterion | Status |
|-----------|--------|
| `npm run verify` passes (typecheck + lint + test + buf:lint + buf:breaking) | □ |
| 18 previously failing vitest suites now pass | □ |
| No previously passing test regresses | □ |
| Behavior tests pass: toBinary/fromBinary round trip | □ |
| Behavior tests pass: oneof field | □ |
| Behavior tests pass: bytes field | □ |
| Behavior tests pass: int64 field | □ |
| Behavior tests pass: enum JSON round trip | □ |
| Connect round trip test passes (connect-node + connect-es) | □ |
| `npm run build` succeeds | □ |
| Dev-server smoke check: 0 protobuf errors | □ |
| `buf:lint` passes | □ |
| `buf:breaking` passes against `main` baseline | □ |

---

**Open decisions already resolved by spec approval:**
- Regenerate with protoc-gen-es v2 (not alias shim) ✅ approved
- Remove `protoc-gen-connect-es` from `buf.gen.yaml` and `package.json` ✅ approved
- Delete all 4 `src/compat/*` files ✅ approved
- Remove aliases from `vite.config.ts` and `vitest.config.ts` ✅ approved
- Baseline for `buf:breaking`: `main` branch ✅ approved

**Plan complete and saved to `docs/superpowers/plans/2026-11-20-regenerate-protobuf-es-v2.md`. Ready to execute?**