# Vitest Protobuf Alias Fix — Design Spec

**Goal:** Unblock the vitest step of `npm run verify` so all tests pass, including the 18 protobuf-dependent suites currently failing with `TypeError: Cannot read properties of undefined (reading 'util')`.

**Context:** Vite dev server aliases `@bufbuild/protobuf` → `src/compat/protobuf-v1-compat.ts` (v1 compat shim on v2.x), but vitest ignores vite.config.ts and has no aliases. Generated protobuf code imports `{ Message, proto3 }` from `@bufbuild/protobuf` and calls `proto3.util.setEnumType()`, which is undefined in v2.x → test failure.

**Scope:** Add `resolve.alias` to `vitest.config.ts` mirroring vite.config.ts. Protobuf regeneration is a separate follow-up (bug-087).

---

## 1. Current alias order in vite.config.ts

The aliases in `vite.config.ts` resolve block, in order:

1. `/^@bufbuild\/protobuf\/wire$/` → `src/compat/protobuf-v1-compat-wire.ts`
2. `/^@bufbuild\/protobuf\/wkt$/` → `src/compat/protobuf-v1-compat-wkt.ts`
3. `/^@bufbuild\/protobuf\/codegenv2$/` → `node_modules/@bufbuild/protobuf/dist/esm/codegenv2/index.js`
4. `/^@bufbuild\/protobuf$/` → `src/compat/protobuf-v1-compat.ts`

All four use exact-match regex (anchored with `$`). The root alias is last and matches only `@bufbuild/protobuf` exactly — it does NOT match subpaths like `@bufbuild/protobuf/wire`.

## 2. Components

### `src/compat/vite.aliases.ts` (create)

Single source of truth for the alias entries. Exported as a `readonly` array of `{ find: RegExp; replacement: string }`.

```ts
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(new URL('.', import.meta.url)));

export const bufProtobufAliases = [
  { find: /^@bufbuild\/protobuf\/wire$/, replacement: path.resolve(__dirname, "src/compat/protobuf-v1-compat-wire.ts") },
  { find: /^@bufbuild\/protobuf\/wkt$/, replacement: path.resolve(__dirname, "src/compat/protobuf-v1-compat-wkt.ts") },
  { find: /^@bufbuild\/protobuf$/, replacement: path.resolve(__dirname, "src/compat/protobuf-v1-compat.ts") },
] as const;
```

### `vite.config.ts` (modify)

Replace the inline alias array with `...bufProtobufAliases`.

### `vitest.config.ts` (modify)

Add `resolve: { alias: bufProtobufAliases }` importing from `src/compat/vite.aliases.ts`. Keep existing `test.exclude` unchanged.

## 3. Why codegenv2 alias is removed

All aliases use exact-match regex (`$` anchor). The root alias `/^@bufbuild\/protobuf$/` matches only `@bufbuild/protobuf` — NOT `@bufbuild/protobuf/codegenv2`. So codegenv2 subpath imports resolve naturally to node_modules v2.x without an alias. The codegenv2 shim (`protobuf-v1-compat-codegenv2.ts`) remains on disk but is no longer aliased; it can be removed in a future cleanup.

## 4. Externalized dependencies (OPEN QUESTION)

Vitest does not transform `node_modules` by default. This means:

- Generated code in `src/` imports `@bufbuild/protobuf` → aliased to our v1 compat shim → `proto3.util` exists → works.
- Packages in `node_modules` (e.g. `@connectrpc/connect`) import `@bufbuild/protobuf` → NOT aliased → real v2.x → `proto3.util` undefined → may fail at module load.

**Proposed default (B):** Leave `@connectrpc/*` and `@bufbuild/*` external and prove compatibility with tests. If connect fails at module load, revisit with option (A).

**Option (A):** Add `test.server.deps.inline` for `@connectrpc/*` and `@bufbuild/*` so vitest transforms them through the alias chain, matching dev-server behavior.

**Decision needed:** Choose (A) or (B). Proposed default: (B).

**Verification needed:** Dev-server behavior does NOT automatically match vitest. Do not assume; the acceptance criteria include a Connect round-trip test in vitest that will reveal any mismatch.

## 5. `__dirname` pattern

Use `fileURLToPath(new URL('.', import.meta.url))` for both `vite.config.ts` and `vite.aliases.ts`. This is ESM-native, works in vitest's transform pipeline, and matches modern Vite patterns. No ambiguity claim is made — this pattern must be verified working in vitest.

## 6. Acceptance criteria

- [ ] The 18 previously failing protobuf-dependent test suites pass.
- [ ] No previously passing test regresses: record test counts before (65 passed / 18 failed) and after; failed count must be 0.
- [ ] New behavior-level tests pass with generated messages:
  - `toBinary`/`fromBinary` round trip
  - A oneof field
  - A bytes field
  - An int64 field
  - Enum JSON round trip
- [ ] Connect round trip in vitest: connect-node server + connect-es client using a generated service.
- [ ] `buf:lint` passes on `proto/`.
- [ ] `buf:breaking` passes against baseline `.git#branch=main` (requires the baseline ref to exist locally).

## 7. Why not regenerate now? (OPEN QUESTION)

**Protobuf/es versions:** `@bufbuild/protobuf` v2.17.0, `@bufbuild/protoc-gen-es` v1.10.1, `@connectrpc/protoc-gen-connect-es` v1.7.0, `@connectrpc/connect` v2.3.0.

**Generated files:** Carry `@ts-nocheck` (see `common_pb.ts` header), so typecheck does not validate them.

**What blocks regeneration with protoc-gen-es v2:**
- v2.x protoc-gen-es generates code that imports v2.x APIs directly (no `proto3.util.setEnumType` calls), which would eliminate the need for the compat shim.
- However, `@connectrpc/protoc-gen-connect-es` v1.7.0 is a v1.x plugin that may not be compatible with protoc-gen-es v2.x output.
- Regenerating all proto files could break Connect client/server code that depends on v1.x-generated structure.
- The compat shim approach is time-boxed: shim and aliases must be removed by the date the project migrates to protoc-gen-es v2 + connect-es v2, or when `buf generate` is confirmed to produce working output with no shim needed.

**Decision needed:** Continue with shim+aliases (time-boxed) vs. regenerate now. Proposed default: continue with shim+aliases, time-boxed exit condition = migration to protoc-gen-es v2.

## 8. Risks and open decisions

**Risks:**
- Vitest may not transform `node_modules` packages that import `@bufbuild/protobuf`, causing `@connectrpc/connect` to fail at module load (mitigated by acceptance criterion: Connect round-trip test).
- The `fileURLToPath(new URL('.', import.meta.url))` pattern for `__dirname` may behave differently in vitest vs Vite (mitigated by running `npm run verify` after change).
- Two config files (vite.config.ts, vitest.config.ts) could drift again if aliases are updated in one but not the other (mitigated by shared `vite.aliases.ts` module).

**Open decisions for human:**
1. **External vs inline deps:** Leave @connectrpc/* external (default) or inline via test.server.deps.inline?
2. **Regenerate vs shim:** Continue with shim+aliases (default, time-boxed) or regenerate protobuf with protoc-gen-es v2 now?

**Working rule:** Do not change code until this spec is approved.