# gRPC Kernel Transport — Full Parity Design

**Ticket:** WEBCAD-218
**Epic:** WEBCAD-EPIC-EC-v5 (WEBCAD-EPIC-EC-v5.md)
**Status:** Proposed
**Date:** 2026-11-22
**Author:** Copilot (brainstorming → design)

---

## 1. Problem Statement

The WebCAD frontend currently relies on the WASM worker (`OCCWorkerClient`) as its primary OCCT transport. The gRPC kernel path exists at the infrastructure level
(`RemoteGrpcTransport` → Connect → Gateway → `GrpcKernelClient` → gRPC/UDS → `kernel_worker` → OCCT), but two gaps prevent it from being a first-class transport:

1. **`KernelGrpcTransport`** (`src/core/io/KernelGrpcTransport.ts`) — server-side `OCCTransport` implementation; all 37 methods throw `"not yet implemented"`.
2. **`CommandRegistry`** — only `BoxCommand` is registered, and it returns a synthetic `shapeId` without calling the kernel.

The proto (`proto/webcad/engine/v1/engine.proto`) already defines all 37 operations (init=3 through step_export=37) with request/response messages. No proto changes are required.

**Goal:** Make gRPC a primary transport with full parity to the WASM worker, supporting both:
- `transport: 'grpc'` — client → Connect → Gateway → gRPC → kernel (already wired, needs commands)
- `transport: 'kernel'` — client → `KernelGrpcTransport` → gRPC → kernel (needs full implementation)

WASM remains as a temporary fallback, to be removed after gRPC parity is verified.

---

## 2. Scope

### In scope

| Item | Description |
|------|-------------|
| `KernelGrpcTransport` | Implement all 37 `OCCTransport` methods using `GrpcKernelClient` → gRPC → kernel_worker |
| Command registry | Register all 37 operation commands in `CommandRegistry`, each calling the kernel via `kernelSupervisor.getKernelForSession()` |
| `BoxCommand` | Replace synthetic shapeId with real kernel call |
| `connect-server.ts` KernelService routes | Implement `execute`, `executeWithProgress`, `restore`, `putBlob`, `streamResult` (currently UNIMPLEMENTED) |
| Error handling | Map gRPC/kernel errors to typed `CommandResult` error codes; unimplemented ops → `UNIMPLEMENTED` (not `INVALID_PARAMETER`) |

### Out of scope

- Proto changes (all operations already defined)
- WASM worker removal (separate ticket)
- Kernel-side OCCT implementation (kernel_worker already implements all ops)
- Gateway session/ordering/dedupe (already implemented)

---

## 3. Architecture

```
┌─────────────────┐      Connect (HTTP/2)      ┌──────────────────┐
│   Browser/Node  │ ←────────────────────────→ │   Gateway (8080) │
│ RemoteGrpcTrans │                            │ connect-server.ts│
└─────────────────┘                            └─────────┬────────┘
                                                          │ gRPC/UDS
                                                          ▼
                                                 ┌──────────────────┐
                                                 │ GrpcKernelClient │
                                                 │ kernel-client.ts │
                                                 └─────────┬────────┘
                                                           │ gRPC/UDS
                                                           ▼
                                                 ┌──────────────────┐
                                                 │ KernelSupervisor │
                                                 │ kernel-supervisor│
                                                 └─────────┬────────┘
                                                           │ spawn/pool
                                                           ▼
                                                 ┌──────────────────┐
                                                 │   kernel_worker  │
                                                 │     (OCCT)       │
                                                 └──────────────────┘
```

### Transport implementations

**`RemoteGrpcTransport`** (client-side, already working):
- Connect unary calls to `EngineGatewayService.Execute`
- Gateway forwards to `GrpcKernelClient.execute()` → gRPC → kernel_worker
- Needs: all command registrations so `Execute` dispatches to real kernel calls

**`KernelGrpcTransport`** (server-side, currently stub):
- Direct `OCCTransport` implementation
- Uses `GrpcKernelClient` obtained from `kernelSupervisor.getKernelForSession(sessionId)`
- Used when `transport: 'kernel'` in `OpenCascadeService.init()`
- Needs: all 37 method implementations

### Command layer (gateway-side)

`CommandRegistry` maps operation names → `CommandImplementation`. Each command:
1. Validates required parameters against its metadata
2. Builds a proto `ExecuteRequest` with the appropriate oneof field
3. Calls `kernelSupervisor.getKernelForSession(sessionId).execute(req)`
4. Returns `CommandResult{success, entityIds, data, errorCode?, errorMessage?}`

---

## 4. Components

### 4.1 `KernelGrpcTransport` (`src/core/io/KernelGrpcTransport.ts`)

Implement all `OCCTransport` methods. Pattern per method:

```typescript
async createBox(x, y, z, dx, dy, dz, deflection?, entityId?): Promise<any> {
  await this.init();
  const req = {
    header: { sessionId: this.sessionId, requestId: generateId() },
    create_box: { x, y, z, dx, dy, dz, deflection: deflection ?? 0.1, entity_id: entityId },
  };
  const res = await this.client!.execute(req);
  // Map ExecuteResponse → OCCTransport return type
  return mapCreateBoxResponse(res);
}
```

Methods to implement (37 total):
- Lifecycle: `init()`, `clearCache()`, `releaseShapes()`, `pendingCount` (getter)
- Validation: `checkValidity()`
- B-rep: `exportBRep()`, `importBRep()`, `extractFaceProfile()`
- Primitives: `createBox`, `createCylinder`, `createSphere`, `createCone`, `createFrustum`, `createTorus`, `createWedge`, `createPyramid`, `createPolyhedron`, `createConvexHull`
- Sweeps/lofts: `createExtrude`, `createRevolve`, `createCompound`, `createSweep`, `createLoft`
- Booleans: `createBoolean`
- Transforms: `multMatrixShape`, `transformShape`, `rotateShape`, `mirrorShape`, `scaleShape`
- Fillet/chamfer: `filletSolid`, `chamferSolid`, `filletSolidFace`, `chamferSolidFace`
- Thick/draft: `makeThickSolid`, `draftSolidFaces`

Error handling: gRPC `ServiceError` → mapped to typed error with appropriate message; kernel operation failures → propagated with kernel error text.

### 4.2 Command files (`src/core/gateway/commands/*.ts`)

Create one file per operation, following the `BoxCommand` pattern. Each command:

```typescript
export const XxxCommand: CommandImplementation = {
  metadata: {
    name: 'create_xxx',
    description: '...',
    version: 1,
    undoable: false,
    parameters: { ... },  // from OCCTransport signature
    result: { shape_id: { type: 'string', ... } },
  },
  execute: async (params, context) => {
    // validate required params
    // build proto ExecuteRequest
    // call kernel via kernelSupervisor.getKernelForSession(sessionId).execute(req)
    // return CommandResult
  },
};
```

Files to create:
| File | Operation | Proto oneof |
|------|-----------|-------------|
| `box.ts` (exists — revise) | create_box | create_box = 10 |
| `cylinder.ts` | create_cylinder | create_cylinder = 11 |
| `sphere.ts` | create_sphere | create_sphere = 13 |
| `cone.ts` | create_cone | create_cone = 14 |
| `frustum.ts` | create_frustum | create_frustum = 12 |
| `torus.ts` | create_torus | create_torus = 15 |
| `wedge.ts` | create_wedge | create_wedge = 16 |
| `pyramid.ts` | create_pyramid | create_pyramid = 17 |
| `polyhedron.ts` | create_polyhedron | create_polyhedron = 18 |
| `convex-hull.ts` | create_convex_hull | create_convex_hull = 19 |
| `extrude.ts` | create_extrude | create_extrude = 20 |
| `revolve.ts` | create_revolve | create_revolve = 21 |
| `compound.ts` | create_compound | create_compound = 22 |
| `sweep.ts` | create_sweep | create_sweep = 23 |
| `loft.ts` | create_loft | create_loft = 24 |
| `boolean.ts` | create_boolean | create_boolean = 25 |
| `mult-matrix.ts` | mult_matrix_shape | mult_matrix_shape = 26 |
| `transform.ts` | transform_shape | transform_shape = 27 |
| `rotate.ts` | rotate_shape | rotate_shape = 28 |
| `mirror.ts` | mirror_shape | mirror_shape = 29 |
| `scale.ts` | scale_shape | scale_shape = 30 |
| `fillet.ts` | fillet_solid | fillet_solid = 31 |
| `chamfer.ts` | chamfer_solid | chamfer_solid = 32 |
| `fillet-face.ts` | fillet_solid_face | fillet_solid_face = 33 |
| `chamfer-face.ts` | chamfer_solid_face | chamfer_solid_face = 34 |
| `thick-solid.ts` | make_thick_solid | make_thick_solid = 35 |
| `draft-faces.ts` | draft_solid_faces | draft_solid_faces = 36 |
| `step-export.ts` | step_export | step_export = 37 |
| `init.ts` | init | init = 3 |
| `clear-cache.ts` | clear_cache | clear_cache = 4 |
| `release-shapes.ts` | release_shapes | release_shapes = 5 |
| `check-validity.ts` | check_validity | check_validity = 6 |
| `export-brep.ts` | export_brep | export_brep = 7 |
| `import-brep.ts` | import_brep | import_brep = 8 |
| `extract-face-profile.ts` | extract_face_profile | extract_face_profile = 9 |

Register all in `command-registry.ts` (or a new `commands/index.ts` barrel).

### 4.3 `BoxCommand` revision (`src/core/gateway/commands/box.ts`)

Replace the synthetic `shapeId = box_${requestId}` with a real kernel call:
- Build `ExecuteRequest{create_box: {...}}`
- Call `kernelSupervisor.getKernelForSession(sessionId).execute(req)`
- Return the kernel's `shape_id` in `CommandResult.data.shape_id`
- Propagate kernel errors as `CommandResult.errorCode`/`errorMessage`

### 4.4 `connect-server.ts` KernelService routes

Implement the 5 UNIMPLEMENTED routes:
- `execute` → delegate to `kernelSupervisor.getKernelForSession()` + `client.execute()`
- `executeWithProgress` → server-streaming progress
- `restore` → delegate to kernel `Restore`
- `putBlob` → client-streaming blob upload
- `streamResult` → server-streaming result chunks

`health` already returns `SERVING`.

### 4.5 `OpenCascadeService` — no changes needed

Already supports `'kernel'` → `KernelGrpcTransport`, `'grpc'` → `RemoteGrpcTransport`, default → WASM.

---

## 5. Data Flow

### Path A: `grpc` transport (client → gateway → kernel)

```
Client.createBox(10,10,10,5,5,5)
  → RemoteGrpcTransport.createBox()
    → Connect POST /EngineGatewayService/Execute
      → Gateway.Execute() [dedupe + ordering]
        → defaultGatewayImpl.executeOnKernel(sessionId, req)
          → kernelSupervisor.getKernelForSession(sessionId)
            → GrpcKernelClient.execute(ExecuteRequest{create_box})
              → gRPC/UDS → KernelService.Execute → kernel_worker → OCCT
                → BRepPrimAPI_MakeBox → Build → Shape → Tessellate
              → ExecuteResponse{success, mesh, brep_ref}
            → Gateway.ExecuteResponse
          → Connect response
    → RemoteGrpcTransport maps response → OCCTransport return type
  → OpenCascadeService.buildGeometry() → THREE.BufferGeometry
```

### Path B: `kernel` transport (direct)

```
OpenCascadeService.init({transport: 'kernel', sessionId})
  → KernelGrpcTransport(sessionId)
    → init() → kernelSupervisor.getKernelForSession(sessionId) → GrpcKernelClient
  → client.createBox(...)
    → KernelGrpcTransport.createBox()
      → GrpcKernelClient.execute(ExecuteRequest{create_box})
        → gRPC/UDS → kernel_worker → OCCT
      → Map ExecuteResponse → OCCTransport return type
```

### Path C: Command flow (gateway-side)

```
Gateway.Execute(req{op: create_box})
  → CommandRegistry.get('create_box').execute(params, context)
    → Validate params (errorCode: 3 if missing/invalid)
    → Build proto ExecuteRequest
    → kernelSupervisor.getKernelForSession(sessionId).execute(req)
    → Return CommandResult{success, entityIds:[shapeId], data:{shape_id}}
      or CommandResult{success: false, errorCode, errorMessage}
```

---

## 6. Error Handling

| Condition | errorCode | errorMessage | Notes |
|-----------|-----------|--------------|-------|
| Missing required parameter | 3 (INVALID_PARAMETER) | `Missing required parameters: x, y, ...` | Command validation |
| Parameter wrong type | 3 (INVALID_PARAMETER) | `Parameter "x" must be a valid number` | Command validation |
| Unknown command | — | `Unknown command: create_xxx` | Registry lookup |
| gRPC transport error | kernel-dependent | gRPC status message | `KernelGrpcTransport` |
| Kernel operation failure | 1 (OPERATION_FAILED) | kernel error text | From `ExecuteFailure` |
| Kernel crash/unavailable | 14 (UNAVAILABLE) | `Kernel unavailable` | `KernelSupervisor` recovery |
| Unimplemented operation | 12 (UNIMPLEMENTED) | `Operation create_xxx not yet implemented` | Not INVALID_PARAMETER |
| Duplicate request_id | 10 (ABORTED) | `Duplicate request_id while in-flight` | Dedupe cache |

**Rule:** Unimplemented-but-valid operations return `UNIMPLEMENTED` (code 12), never `INVALID_PARAMETER` (code 3).

**Rule:** Unexpected exceptions from the kernel are mapped to `INTERNAL` (code 13), not `UNSPECIFIED` (code 0).

---

## 7. Testing

### 7.1 Unit tests

- `KernelGrpcTransport.test.ts` — each method verifies request construction and response mapping (mock `GrpcKernelClient`)
- `command-registry.test.ts` — all 37 commands registered, validation works
- Per-command test files (`box.test.ts` exists — extend; add `cylinder.test.ts`, `loft.test.ts`, etc.)

### 7.2 Integration tests

- End-to-end via running kernel (Docker container `webcad/kernel:occt-7.9.3`)
- Each operation: call → verify `shape_id` returned → verify geometry via `checkValidity` or `exportBRep`
- `create_box` must succeed (linked to Part A bug findings)

### 7.3 Test policy (Part A)

- Current failing assertions (if any) → marked expected-failure linked to bug id
- Positive canary test: `create_box` must succeed, marked expected-failure → flips when fixed
- Kernel health smoke test: box, boolean, mesh

---

## 8. Open Questions

1. **Export format default:** When `exportBRep` is called without an explicit format, should the kernel default to text B-rep (WASM-compatible) or binary B-rep (native)? Proposed default: text B-rep for WASM fallback compatibility.
2. **`init` operation:** The proto has `InitOp` (empty message) only because of the WASM worker. Should `init` become a no-op handshake returning kernel/OCCT version, or be marked `reserved` in the proto (check buf breaking compatibility)?
3. **Unimplemented operations:** Should the dispatcher return `UNIMPLEMENTED` for operations the kernel hasn't ported yet, or should all 37 be implemented at once? Proposed: implement all 37 in this ticket; `UNIMPLEMENTED` is the fallback for future ops.

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Kernel `create_box` fails (Part A P0 bug) | High | High | gRPC path cannot succeed until kernel bug is fixed; findings doc at `doc/results/kernel_create_box_findings.md` |
| `KernelGrpcTransport` and gateway command paths diverge | Medium | Medium | Share request/response mapping logic where possible |
| 37 command files is a large change | Medium | Medium | Phase the work: primitives first, then booleans/transforms, then advanced ops |
| `connect-server.ts` KernelService routes not actually used by current gateway flow | Low | Low | Verify whether `defaultGatewayImpl.executeOnKernel` already covers the gateway→kernel path |

---

## 10. Decision Log

| Decision | Date | Rationale |
|----------|------|-----------|
| Approach C (both KernelGrpcTransport + command registry) | 2026-11-22 | Full parity for both transport types; gateway-mediated path is already working |
| No proto changes | 2026-11-22 | All 37 operations already defined in engine.proto |
| WASM remains as fallback | 2026-11-22 | User stated WASM is temporary; remove after gRPC parity verified |
| Unimplemented ops → UNIMPLEMENTED (not INVALID_PARAMETER) | 2026-11-22 | Per Part A findings contract gap |
| Unexpected exceptions → INTERNAL (not UNSPECIFIED) | 2026-11-22 | Per Part A findings error handling rule |

---

## 11. Related Documents

- `docs/superpowers/specs/2026-10-21-grpc-connect-transport-design.md` — Transport design
- `docs/adr/001-grpc-connect-transport.md` — Kernel strategy ADR
- `docs/epics/WEBCAD-EPIC-EC-v5.md` — Epic ticket table
- `doc/results/kernel_create_box_findings.md` — Part A P0 bug findings
