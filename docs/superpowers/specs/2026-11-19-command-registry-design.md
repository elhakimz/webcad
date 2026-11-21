# Command Registry Design

**Ticket:** WEBCAD-192, Onshape-style engine evolution — Ticket 1 (Approach B: vertical slice)
**Date:** 2026-11-19
**Status:** Draft

## Problem

The WebCad engine currently has client-side command classes (`src/core/commands/`) that directly manipulate the client-side `Document`. To evolve toward a server-owned document (Onshape-style), we need a central command registry on the gateway that can register, look up, validate, and execute commands on behalf of the client.

This ticket builds the command registry foundation and registers `BoxCommand` (`create_box`) as the pilot command.

## Scope

**In scope:**
- `CommandRegistry` class: register, get, list, validate commands
- `CommandImplementation` interface: metadata + execute + optional undo
- `BoxCommand` server implementation (`create_box`)
- Unit tests for the registry
- Wiring BoxCommand into the gateway startup

**Out of scope (later tickets):**
- Server-owned Document (Ticket 2)
- Feature Graph + Persistent Topology References (Ticket 3)
- Versioned Operation Log (Ticket 4)
- Native OCCT kernel integration (blocked on WC-EC-05 ADR)
- Proto changes for command-name-based Execute (Ticket 2+)

## Design

### CommandRegistry

Located at `src/core/gateway/command-registry.ts`.

```typescript
export interface CommandParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
  description?: string;
}

export interface CommandMetadata {
  name: string;          // e.g. "create_box"
  description: string;
  version: number;       // starts at 1
  undoable: boolean;
  parameters: Record<string, CommandParameter>;
  result: Record<string, { type: string; description?: string }>;
}

export interface CommandContext {
  sessionId: string;
  requestId: string;
  userId?: string;
}

export interface CommandResult {
  success: boolean;
  entityIds: string[];   // entity IDs created or modified by this command
  data?: Record<string, unknown>;
  errorCode?: number;    // gRPC-compatible status code
  errorMessage?: string;
}

export interface CommandImplementation {
  metadata: CommandMetadata;
  execute(params: Record<string, unknown>, context: CommandContext): Promise<CommandResult>;
  undo?(entityId: string, context: CommandContext): Promise<CommandResult>;
}

export class CommandRegistry {
  private commands = new Map<string, CommandImplementation>();

  register(command: CommandImplementation): void;
  get(name: string): CommandImplementation | undefined;
  list(): CommandMetadata[];
  validate(name: string, params: Record<string, unknown>): { valid: boolean; errors: string[] };
}
```

**Behavior:**
- `register()`: stores the command keyed by `metadata.name`. Throws if a command with the same name is already registered.
- `get()`: returns the command implementation or `undefined`.
- `list()`: returns metadata for all registered commands (suitable for advertising supported operations to clients).
- `validate()`: checks that all `required` parameters are present and that each provided parameter matches its declared `type`. Returns a list of human-readable errors.

### BoxCommand (`create_box`)

Located at `src/core/gateway/commands/box.ts`.

Registers a `create_box` command with these parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| x | number | Yes | Min X coordinate |
| y | number | Yes | Min Y coordinate |
| z | number | Yes | Min Z coordinate |
| dx | number | Yes | Size X |
| dy | number | Yes | Size Y |
| dz | number | Yes | Size Z |
| deflection | number | Yes | Tessellation deflection |

Result: `shape_id` (string) — ID of the created box shape.

**`execute()`:**
1. Validates all parameters are present and are numbers.
2. Generates a deterministic `shapeId` from context (e.g. `box_${requestId}`).
3. Returns `{ success: true, entityIds: [shapeId], data: { shape_id: shapeId } }`.

**Note:** The actual kernel call (via `GrpcKernelClient.Execute` with `CreateBoxOp`) is deferred to the native kernel ticket (blocked on WC-EC-05 ADR). This ticket registers the command and validates parameters; kernel execution is a stub that returns a synthetic shape ID.

**`undo()`:** Not implemented yet. Will remove the box from the server-owned document (Ticket 2).

### Gateway wiring

In `src/core/gateway/connect-server.ts` (or a dedicated bootstrap module), import `BoxCommand` and register it with the `CommandRegistry` instance on gateway startup.

### Tests

Located at `src/core/gateway/command-registry.test.ts`.

Test cases:
1. Register a command and retrieve it by name.
2. Registering a duplicate name throws.
3. `list()` returns metadata for all registered commands.
4. `validate()` passes when all required params are present with correct types.
5. `validate()` fails when a required param is missing.
6. `validate()` fails when a param has the wrong type.
7. `validate()` fails for an unknown command name.
8. `BoxCommand.execute()` returns success with valid params.
9. `BoxCommand.execute()` returns failure with invalid params.

## Success Criteria

- `npm run typecheck` passes
- `npm run lint` passes (no new errors)
- `npm test` passes for `command-registry.test.ts`
- A fresh agent can read `AGENTS.md` + this spec + the code and understand how to add a new command

## Files

| File | Action |
|------|--------|
| `src/core/gateway/command-registry.ts` | Create |
| `src/core/gateway/commands/box.ts` | Create |
| `src/core/gateway/command-registry.test.ts` | Create |
| `src/core/gateway/connect-server.ts` | Modify (register BoxCommand) |
| `src/core/gateway/README.md` | Modify (update context pack) |

## Self-Review

- **Placeholder scan:** No TBDs. Kernel integration is explicitly deferred and marked as out of scope.
- **Internal consistency:** The registry interface matches the BoxCommand implementation. No contradictions.
- **Scope check:** 5 files total, well under 15 files / 600 lines. Single, focused purpose.
- **Ambiguity check:** `validate()` behavior for missing vs wrong-type params is explicit. `execute()` stub behavior is explicit.