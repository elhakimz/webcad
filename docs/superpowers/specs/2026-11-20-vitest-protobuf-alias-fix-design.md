# Vitest Protobuf Alias Fix — Design Spec

**Goal:** Unblock the vitest step of `npm run verify` so all tests pass, including the 18 protobuf-dependent suites currently failing with `TypeError: Cannot read properties of undefined (reading 'util')`.

**Context:** Vite dev server aliases `@bufbuild/protobuf` → `src/compat/protobuf-v1-compat.ts` (v1 compat shim on v2.x), but vitest ignores vite.config.ts and has no aliases. Generated protobuf code imports `{ Message, proto3 }` from `@bufbuild/protobuf` and calls `proto3.util.setEnumType()`, which is undefined in v2.x → test failure at module load.

**Scope:** Add `resolve.alias` to `vitest.config.ts` mirroring vite.config.ts via a shared alias module. Protobuf regeneration is a separate follow-up (bug-087).

---

## 0. Step 0 spike — Connect round trip with current generated files

**Attempted:** Minimal connect-node server + connect-es client round trip using CURRENT generated service files (`engine_connect.ts`, `engine_pb.ts`), no alias changes.

**Result:** FAILED at module load before any request could be made.

```
TypeError: Cannot read properties of undefined (reading 'util')
  at src/generated/proto/webcad/engine/v1/common_pb.ts:77:8
    proto3.util.setEnumType(ExecutionFailureCode, ...)
```

**Implication:** The Connect round trip cannot be tested until the `@bufbuild/protobuf` alias is in place. Even after aliases fix module load, there may be a secondary issue: the generated service uses v1 `ServiceType` while Connect v2 (2.3.0) expects `DescService`. That would surface as a runtime descriptor mismatch, not a module-load error. Regeneration with protoc-gen-es v2 would address both, but is a separate follow-up.

---

## 1. Components

### `vite.aliases.ts` (create, repo root)

Single source of truth for the alias entries. Placed at repo root so both `vite.config.ts` and `vitest.config.ts` import from the same location.

```ts
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('.', import.meta.url));

export const bufProtobufAliases = [
  { find: /^@bufbuild\/protobuf\/wire$/, replacement: `${root}/src/compat/protobuf-v1-compat-wire.ts` },
  { find: /^@bufbuild\/protobuf\/wkt$/, replacement: `${root}/src/compat/protobuf-v1-compat-wkt.ts` },
  { find: /^@bufbuild\/protobuf$/, replacement: `${root}/src/compat/protobuf-v1-compat.ts` },
] as const;
```

**Notes:**
- Uses `const root = fileURLToPath(new URL('.', import.meta.url))` — ESM-native, no `path.dirname`, no `__dirname`.
- All aliases use exact-match regex (`$` anchor). The root alias matches only `@bufbuild/protobuf`, NOT subpaths like `/wire`.
- Resolved paths printed via a config assertion or test to verify resolution at startup.

### `vite.config.ts` (modify)

Replace the inline alias array with `...bufProtobufAliases` imported from `./vite.aliases.ts`.

### `vitest.config.ts` (modify)

Add `resolve: { alias: bufProtobufAliases }` importing from `./vite.aliases.ts`. Keep existing `test.exclude` unchanged.

**Why both need aliases:** Vitest ignores `vite.config.ts` when `vitest.config.ts` exists. Without aliases in vitest.config.ts, generated protobuf imports resolve to real v2.x which lacks `proto3.util`.

---

## 2. Alias order

Specific subpath aliases (`/wire`, `/wkt`) come before the root alias (`/^@bufbuild\/protobuf$/`). All are anchored with `$`, so order does not cause subpath rewriting to the root shim. This is documented here because it was a real bug in a toy vitest 4.1.12 project where a generic string alias rewrote `@bufbuild/protobuf/wire` to the root shim.

**Verified order in vite.config.ts:** `/wire`, `/wkt`, `codegenv2` (to be removed), root — all exact-match regex.

---

## 3. codegenv2 alias — removed; shim file deleted

All aliases use exact-match regex (`$` anchor). The root alias `/^@bufbuild\/protobuf$/` matches only `@bufbuild/protobuf` — NOT `@bufbuild/protobuf/codegenv2`. So codegenv2 subpath imports resolve naturally to node_modules v2.x without an alias.

**Contradiction resolution:** `src/compat/protobuf-v1-compat-codegenv2.ts` is no longer aliased by anything. Delete the file — it is dead code. If some future import needs it, re-add with an explicit alias entry.

---

## 4. Failure mode — runtime descriptor mismatch, not module-load

**Corrected failure mode:** The Connect round trip fails at **runtime** due to descriptor mismatch (v1 `ServiceType` vs Connect v2 `DescService`), NOT at module load. Module load fails only because `proto3.util` is undefined without aliases — once aliases are in place, module load succeeds and the descriptor mismatch surfaces at runtime.

**Before offering Option A (inline deps):** Verify the shim (`protobuf-v1-compat.ts`) re-exports all v2 APIs that generated code and `@connectrpc/connect` need:
- `Message`, `proto3`, `proto3.util`, `MethodKind`
- If the shim does not re-export a v2 API, Option A (inlining node_modules through vitest transform) is required.

---

## 5. `__dirname` pattern

Use `const root = fileURLToPath(new URL('.', import.meta.url))` for both `vite.config.ts` and `vite.aliases.ts`. No `path.dirname`. This is ESM-native and works in vitest's transform pipeline. Verified by printing resolved paths at config load.

---

## 6. Externalized dependencies (OPEN QUESTION)

Vitest does not transform `node_modules` by default. This means:

- Generated code in `src/` imports `@bufbuild/protobuf` → aliased to our v1 compat shim → `proto3.util` exists → works.
- Packages in `node_modules` (e.g. `@connectrpc/connect`) import `@bufbuild/protobuf` → NOT aliased → real v2.x → `proto3.util` undefined → may fail at module load.

**Option (A):** Add `test.server.deps.inline` for `@connectrpc/*` and `@bufbuild/*` so vitest transforms them through the alias chain, matching dev-server behavior.

**Option (B):** Leave `@connectrpc/*` and `@bufbuild/*` external and prove compatibility with tests. If connect fails at module load, revisit with option (A).

**Proposed default:** (B). Verification needed: the Connect round-trip acceptance test will reveal any mismatch. Dev-server behavior does NOT automatically match vitest.

---

## 7. Why not regenerate now? (OPEN QUESTION)

**Versions:** `@bufbuild/protobuf` v2.17.0, `@bufbuild/protoc-gen-es` v1.10.1, `@connectrpc/protoc-gen-connect-es` v1.7.0, `@connectrpc/connect` v2.3.0.

**Key fact:** The Connect runtime is already v2 (2.3.0). The blocker for regeneration is **generated service descriptors**, not regeneration risk. The current `@connectrpc/protoc-gen-connect-es` v1.7.0 generates v1 `ServiceType`, while Connect v2 needs `DescService` (protoc-gen-es v2 output).

**Generated files:** Carry `@ts-nocheck` (see `common_pb.ts` header), so typecheck does not validate them.

**What blocks regeneration with protoc-gen-es v2:**
- `@connectrpc/protoc-gen-connect-es` v1.7.0 may not be compatible with protoc-gen-es v2.x output.
- Regenerating all proto files could break Connect client/server code that depends on v1.x-generated structure.

**Shim exit milestone:** Shim and aliases must be removed by the date the project migrates to protoc-gen-es v2 + connect-es v2 (tracked as bug-087). Owner: TBD. Link to bug-087: [bug-087].

**Decision needed:** Continue with shim+aliases (default, time-boxed) vs. regenerate now. Proposed default: continue with shim+aliases, time-boxed exit condition = migration to protoc-gen-es v2.

---

## 8. Acceptance criteria

- [ ] The 18 previously failing protobuf-dependent test suites pass.
- [ ] No previously passing test regresses: record before/after counts. "65/18" counts **suites**, not tests (65 passing suites / 18 failing suites, 390 passing tests). After fix: 0 failing suites.
- [ ] New behavior-level tests pass with generated messages:
  - `toBinary`/`fromBinary` round trip
  - A oneof field
  - A bytes field
  - An int64 field
  - Enum JSON round trip
- [ ] Connect round trip in vitest: connect-node server + connect-es client using a generated service.
- [ ] `npm run build` passes (Vite production build with aliases).
- [ ] Dev-server smoke check: `npm run dev` starts without alias-related errors.
- [ ] `buf:lint` passes on `proto/`.
- [ ] `buf:breaking` passes against baseline `.git#branch=main` (if no baseline exists locally, "passes" means no breaking changes detected against current HEAD; baseline ref must be created before `buf:breaking` can be meaningfully enforced).

---

## 9. Risks and open decisions

**Risks:**
- Vitest may not transform `node_modules` packages that import `@bufbuild/protobuf`, causing `@connectrpc/connect` to fail at module load (mitigated by acceptance criterion: Connect round-trip test).
- The `fileURLToPath(new URL('.', import.meta.url))` pattern may behave differently in vitest vs Vite (mitigated by running `npm run verify` after change).
- Two config files (vite.config.ts, vitest.config.ts) could drift again if aliases are updated in one but not the other (mitigated by shared `vite.aliases.ts` module).

**Open decisions for human:**
1. **External vs inline deps:** Leave @connectrpc/* external (default, Option B) or inline via test.server.deps.inline (Option A)?
2. **Regenerate vs shim:** Continue with shim+aliases (default, time-boxed) or regenerate protobuf with protoc-gen-es v2 now?

**Working rule:** Do not change code until this spec is approved.