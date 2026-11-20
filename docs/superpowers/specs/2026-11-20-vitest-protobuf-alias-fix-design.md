# Vitest Protobuf Alias Fix — Design Spec

**Goal:** Fix vitest test failures caused by missing `@bufbuild/protobuf` aliases so `npm run verify` passes the test step.

**Context:** Vite dev server aliases `@bufbuild/protobuf` → `src/compat/protobuf-v1-compat.ts` (v1 compat shim on top of v2.x), but vitest has no such aliases. Generated protobuf code imports `{ Message, proto3 }` from `@bufbuild/protobuf` and calls `proto3.util.setEnumType()`, which is undefined in v2.x → `TypeError: Cannot read properties of undefined (reading 'util')`.

**Scope:** Add `resolve.alias` to `vitest.config.ts` mirroring vite.config.ts. Protobuf regeneration (removing compat shim) is a separate follow-up (bug-087).

---

## 1. Architecture

Single file change: `vitest.config.ts` gains a `resolve.alias` block identical in intent to `vite.config.ts`'s aliases.

Vitest uses Vite under the hood, so `resolve.alias` is natively supported.

## 2. Components

### `vitest.config.ts` (modify)

Add `resolve: { alias: [...] }` with 4 entries:

| Import | Replacement |
|--------|-------------|
| `@bufbuild/protobuf` | `path.resolve(__dirname, "src/compat/protobuf-v1-compat.ts")` |
| `@bufbuild/protobuf/wire` | `path.resolve(__dirname, "src/compat/protobuf-v1-compat-wire.ts")` |
| `@bufbuild/protobuf/wkt` | `path.resolve(__dirname, "src/compat/protobuf-v1-compat-wkt.ts")` |
| `@bufbuild/protobuf/codegenv2` | `path.resolve(__dirname, "node_modules/@bufbuild/protobuf/dist/esm/codegenv2/index.js")` |

Need to import `path` and `fileURLToPath` from `url` to compute `__dirname` (same pattern as vite.config.ts).

## 3. Data Flow

1. Vitest loads a test file that imports generated protobuf code (e.g. `common_pb.ts`).
2. `common_pb.ts` does `import { Message, proto3, protoInt64 } from "@bufbuild/protobuf"`.
3. Vitest resolves `@bufbuild/protobuf` via alias → `src/compat/protobuf-v1-compat.ts`.
4. The shim exports `proto3` with `proto3.util` object containing `setEnumType`, `initPartial`, etc.
5. `proto3.util.setEnumType(ExecutionFailureCode, ...)` succeeds; no TypeError.
6. Tests pass; `npm run verify` reaches `buf:lint` and `buf:breaking`.

## 4. Error Handling

- Missing compat shim file → vitest throws module-not-found at test startup (fail fast, clear error).
- No silent fallbacks; the alias either resolves or fails loudly.

## 5. Testing

Run `npm run verify`:
- `typecheck` — passes (already verified)
- `lint` — passes with 0 errors (already verified after native-kernel-adapter fix)
- `test` — all test files pass, including the 18 previously failing protobuf-dependent suites
- `buf:lint` / `buf:breaking` — run after tests

## 6. Follow-up (out of scope)

Bug-087 tracks protobuf regeneration with v2.x (`buf generate`) to eventually remove the compat shim entirely. Not part of this fix.

---

## Spec Self-Review

- **Placeholder scan:** No TBD/TODO/incomplete sections. All paths and aliases specified concretely.
- **Internal consistency:** Aliases match vite.config.ts exactly; architecture and data flow sections agree.
- **Scope check:** Single-file change focused on unblocking verify. Protobuf regeneration explicitly deferred.
- **Ambiguity check:** `__dirname` computation follows existing vite.config.ts pattern; no ambiguity.

---

**Ready for user review.** Please review this spec and let me know if you want changes before I write the implementation plan.