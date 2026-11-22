# gRPC Kernel Transport — Full Parity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make gRPC a primary OCCT transport with full parity to the WASM worker, supporting both `transport: 'grpc'` (client → Connect → Gateway → gRPC → kernel) and `transport: 'kernel'` (client → KernelGrpcTransport → gRPC → kernel) paths.

**Architecture:** Two OCCTransport implementations (RemoteGrpcTransport client-side + KernelGrpcTransport server-side), both calling kernel_worker via GrpcKernelClient over gRPC/UDS. Gateway CommandRegistry registers all 37 operations, each calling the kernel through kernelSupervisor.

**Tech Stack:** TypeScript 5, Node.js, @grpc/grpc-js, @connectrpc/connect-node, Vitest, protobuf (engine.proto already defines all 37 operations)

---

## File Structure

### New files to create:

| File | Responsibility |
|------|---------------|
| `src/core/gateway/commands/cylinder.ts` | create_cylinder command |
| `src/core/gateway/commands/sphere.ts` | create_sphere command |
| `src/core/gateway/commands/cone.ts` | create_cone command |
| `src/core/gateway/commands/frustum.ts` | create_frustum command |
| `src/core/gateway/commands/torus.ts` | create_torus command |
| `src/core/gateway/commands/wedge.ts` | create_wedge command |
| `src/core/gateway/commands/pyramid.ts` | create_pyramid command |
| `src/core/gateway/commands/polyhedron.ts` | create_polyhedron command |
| `src/core/gateway/commands/convex-hull.ts` | create_convex_hull command |
| `src/core/gateway/commands/extrude.ts` | create_extrude command |
| `src/core/gateway/commands/revolve.ts` | create_revolve command |
| `src/core/gateway/commands/compound.ts` | create_compound command |
| `src/core/gateway/commands/sweep.ts` | create_sweep command |
| `src/core/gateway/commands/loft.ts` | create_loft command |
| `src/core/gateway/commands/boolean.ts` | create_boolean command |
| `src/core/gateway/commands/mult-matrix.ts` | mult_matrix_shape command |
| `src/core/gateway/commands/transform.ts` | transform_shape command |
| `src/core/gateway/commands/rotate.ts` | rotate_shape command |
| `src/core/gateway/commands/mirror.ts` | mirror_shape command |
| `src/core/gateway/commands/scale.ts` | scale_shape command |
| `src/core/gateway/commands/fillet.ts` | fillet_solid command |
| `src/core/gateway/commands/chamfer.ts` | chamfer_solid command |
| `src/core/gateway/commands/fillet-face.ts` | fillet_solid_face command |
| `src/core/gateway/commands/chamfer-face.ts` | chamfer_solid_face command |
| `src/core/gateway/commands/thick-solid.ts` | make_thick_solid command |
| `src/core/gateway/commands/draft-faces.ts` | draft_solid_faces command |
| `src/core/gateway/commands/step-export.ts` | step_export command |
| `src/core/gateway/commands/init.ts` | init command |
| `src/core/gateway/commands/clear-cache.ts` | clear_cache command |
| `src/core/gateway/commands/release-shapes.ts` | release_shapes command |
| `src/core/gateway/commands/check-validity.ts` | check_validity command |
| `src/core/gateway/commands/export-brep.ts` | export_brep command |
| `src/core/gateway/commands/import-brep.ts` | import_brep command |
| `src/core/gateway/commands/extract-face-profile.ts` | extract_face_profile command |
| `src/core/gateway/commands/index.ts` | Barrel export + registry registration for all commands |
| `tests/core/io/kernel-grpc-transport.test.ts` | Unit tests for KernelGrpcTransport (mock GrpcKernelClient) |

### Files to modify:

| File | Changes |
|------|---------|
| `src/core/io/KernelGrpcTransport.ts` | Implement all 37 OCCTransport methods (currently all throw) |
| `src/core/gateway/commands/box.ts` | Replace synthetic shapeId with real kernel call |
| `src/core/gateway/command-registry.ts` | Register all commands (or import from commands/index.ts) |
| `src/core/gateway/connect-server.ts` | Implement 5 UNIMPLEMENTED KernelService routes |

---

## Chunk 1: KernelGrpcTransport Core — Lifecycle & B-rep Methods

### Task 1.1: Write failing test for KernelGrpcTransport.init()

**Files:**
- Test: `tests/core/io/kernel-grpc-transport.test.ts` (create)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KernelGrpcTransport } from '../../../src/core/io/KernelGrpcTransport.js';

// Mock kernelSupervisor
vi.mock('../../../src/core/gateway/kernel-supervisor.js', () => ({
  kernelSupervisor: {
    getKernelForSession: vi.fn(),
  },
}));

import { kernelSupervisor } from '../../../src/core/gateway/kernel-supervisor.js';

describe('KernelGrpcTransport.init()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates GrpcKernelClient from kernelSupervisor and marks initialized', async () => {
    const mockClient = { execute: vi.fn() };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect((transport as any).client).toBe(mockClient);
    expect((transport as any).initialized).toBe(true);
  });

  it('is idempotent — second call does not re-fetch client', async () => {
    const mockClient = { execute: vi.fn() };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.init();

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 1: Write the failing test**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "init" --reporter=verbose`
Expected: FAIL — `KernelGrpcTransport` not found or `init` not implemented

- [ ] **Step 2: Implement minimal KernelGrpcTransport.init()**

In `src/core/io/KernelGrpcTransport.ts`:
```typescript
import { OCCTransport } from './OCCTransport.js';
import type { GrpcKernelClient } from '../gateway/kernel-client.js';

export class KernelGrpcTransport implements OCCTransport {
  private sessionId: string;
  private client: GrpcKernelClient | null = null;
  private initialized = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const { kernelSupervisor } = await import('../gateway/kernel-supervisor.js');
    this.client = await kernelSupervisor.getKernelForSession(this.sessionId);
    this.initialized = true;
  }

  get pendingCount(): number {
    return 0;
  }
  // ... all other methods throw "not yet implemented"
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "init" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/io/KernelGrpcTransport.ts tests/core/io/kernel-grpc-transport.test.ts
git commit -m "feat(kernel): implement KernelGrpcTransport.init()"
```

---

### Task 1.2: Implement clearCache() and releaseShapes()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

```typescript
async clearCache(): Promise<{ success: boolean }> {
  await this.init();
  const res = await this.client!.execute({
    header: { sessionId: this.sessionId, requestId: crypto.randomUUID() },
    clear_cache: {},
  });
  return { success: (res as any)?.success ?? false };
}

async releaseShapes(entityIds: string[]): Promise<void> {
  await this.init();
  await this.client!.execute({
    header: { sessionId: this.sessionId, requestId: crypto.randomUUID() },
    release_shapes: { entity_ids: entityIds },
  });
}
```

- [ ] **Step 1: Write failing test for clearCache()**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "clearCache" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement clearCache() and releaseShapes()**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "clearCache\|releaseShapes" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/io/KernelGrpcTransport.ts tests/core/io/kernel-grpc-transport.test.ts
git commit -m "feat(kernel): implement clearCache and releaseShapes on KernelGrpcTransport"
```

---

### Task 1.3: Implement checkValidity(), exportBRep(), importBRep(), extractFaceProfile()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing tests for all four B-rep methods**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "checkValidity\|exportBRep\|importBRep\|extractFaceProfile" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all four methods**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "checkValidity\|exportBRep\|importBRep\|extractFaceProfile" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/io/KernelGrpcTransport.ts tests/core/io/kernel-grpc-transport.test.ts
git commit -m "feat(kernel): implement checkValidity, exportBRep, importBRep, extractFaceProfile on KernelGrpcTransport"
```

---

## Chunk 2: KernelGrpcTransport — Primitive Creation Methods

### Task 2.1: Implement createBox()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing test for createBox()**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createBox" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement createBox()**

Build `ExecuteRequest{create_box: {x, y, z, dx, dy, dz, deflection, entity_id}}`, call `client.execute()`, map response.

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createBox" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/io/KernelGrpcTransport.ts tests/core/io/kernel-grpc-transport.test.ts
git commit -m "feat(kernel): implement createBox on KernelGrpcTransport"
```

---

### Task 2.2: Implement createCylinder(), createSphere(), createCone()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing tests for all three methods**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createCylinder\|createSphere\|createCone" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all three methods**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createCylinder\|createSphere\|createCone" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

### Task 2.3: Implement createFrustum(), createTorus(), createWedge(), createPyramid()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing tests for all four methods**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createFrustum\|createTorus\|createWedge\|createPyramid" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all four methods**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createFrustum\|createTorus\|createWedge\|createPyramid" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

## Chunk 3: KernelGrpcTransport — Advanced Creation Methods

### Task 3.1: Implement createPolyhedron(), createConvexHull()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing tests**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createPolyhedron\|createConvexHull" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement both methods**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createPolyhedron\|createConvexHull" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

### Task 3.2: Implement createExtrude(), createRevolve(), createCompound()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing tests**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createExtrude\|createRevolve\|createCompound" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all three methods**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createExtrude\|createRevolve\|createCompound" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

### Task 3.3: Implement createSweep(), createLoft(), createBoolean()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing tests**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createSweep\|createLoft\|createBoolean" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all three methods**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "createSweep\|createLoft\|createBoolean" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

## Chunk 4: KernelGrpcTransport — Transform & Modification Methods

### Task 4.1: Implement multMatrixShape(), transformShape(), rotateShape(), mirrorShape(), scaleShape()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing tests for all five transform methods**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "multMatrixShape\|transformShape\|rotateShape\|mirrorShape\|scaleShape" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all five methods**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "multMatrixShape\|transformShape\|rotateShape\|mirrorShape\|scaleShape" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

### Task 4.2: Implement filletSolid(), chamferSolid(), filletSolidFace(), chamferSolidFace()

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing tests**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "filletSolid\|chamferSolid\|filletSolidFace\|chamferSolidFace" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all four methods**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "filletSolid\|chamferSolid\|filletSolidFace\|chamferSolidFace" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

### Task 4.3: Implement makeThickSolid(), draftSolidFaces(), pendingCount getter

**Files:**
- Modify: `src/core/io/KernelGrpcTransport.ts`
- Test: `tests/core/io/kernel-grpc-transport.test.ts`

- [ ] **Step 1: Write failing tests**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "makeThickSolid\|draftSolidFaces\|pendingCount" --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all methods**

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/core/io/kernel-grpc-transport.test.ts -t "makeThickSolid\|draftSolidFaces\|pendingCount" --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

## Chunk 5: Command Files — Primitives

### Task 5.1: Revise box.ts — real kernel call instead of synthetic shapeId

**Files:**
- Modify: `src/core/gateway/commands/box.ts`
- Test: `src/core/gateway/commands/box.test.ts`

```typescript
import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { kernelSupervisor } from '../kernel-supervisor';

export const BoxCommand: CommandImplementation = {
  metadata: {
    name: 'create_box',
    description: 'Creates a rectangular box solid from min corner and dimensions',
    version: 1,
    undoable: false,
    parameters: {
      x: { type: 'number', required: true, description: 'Min X coordinate' },
      y: { type: 'number', required: true, description: 'Min Y coordinate' },
      z: { type: 'number', required: true, description: 'Min Z coordinate' },
      dx: { type: 'number', required: true, description: 'Size X' },
      dy: { type: 'number', required: true, description: 'Size Y' },
      dz: { type: 'number', required: true, description: 'Size Z' },
      deflection: { type: 'number', required: true, description: 'Tessellation deflection' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created box shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['x', 'y', 'z', 'dx', 'dy', 'dz', 'deflection'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    for (const k of required) {
      if (typeof params[k] !== 'number' || isNaN(params[k] as number)) {
        return { success: false, entityIds: [], errorCode: 3, errorMessage: `Parameter "${k}" must be a valid number` };
      }
    }

    const client = await kernelSupervisor.getKernelForSession(context.sessionId);
    const res = await client.execute({
      header: { sessionId: context.sessionId, requestId: context.requestId },
      create_box: {
        x: params.x as number,
        y: params.y as number,
        z: params.z as number,
        dx: params.dx as number,
        dy: params.dy as number,
        dz: params.dz as number,
        deflection: params.deflection as number,
        entity_id: params.entityId as string,
      },
    });

    const shapeId = (res as any)?.success?.shape_id;
    if (!shapeId) {
      return { success: false, entityIds: [], errorCode: 1, errorMessage: 'Kernel returned no shape_id' };
    }

    return { success: true, entityIds: [shapeId], data: { shape_id: shapeId } };
  },
};
```

- [ ] **Step 1: Revise box.test.ts for real kernel call (mock kernelSupervisor)**

- [ ] **Step 2: Modify box.ts for real kernel call**

- [ ] **Step 3: Run box tests**

Run: `npx vitest run src/core/gateway/commands/box.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

### Task 5.2: Create cylinder.ts, sphere.ts, cone.ts command files

**Files:**
- Create: `src/core/gateway/commands/cylinder.ts`
- Create: `src/core/gateway/commands/sphere.ts`
- Create: `src/core/gateway/commands/cone.ts`
- Create: `src/core/gateway/commands/cylinder.test.ts`
- Create: `src/core/gateway/commands/sphere.test.ts`
- Create: `src/core/gateway/commands/cone.test.ts`

- [ ] **Step 1: Write failing tests for all three commands**

Run: `npx vitest run src/core/gateway/commands/cylinder.test.ts src/core/gateway/commands/sphere.test.ts src/core/gateway/commands/cone.test.ts --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all three commands**

Follow box.ts pattern — validate params, build ExecuteRequest, call kernel, return result.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/core/gateway/commands/cylinder.test.ts src/core/gateway/commands/sphere.test.ts src/core/gateway/commands/cone.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

### Task 5.3: Create frustum.ts, torus.ts, wedge.ts, pyramid.ts command files

**Files:**
- Create: `src/core/gateway/commands/frustum.ts`
- Create: `src/core/gateway/commands/torus.ts`
- Create: `src/core/gateway/commands/wedge.ts`
- Create: `src/core/gateway/commands/pyramid.ts`
- Create: corresponding .test.ts files

- [ ] **Step 1: Write failing tests**

Run: `npx vitest run src/core/gateway/commands/frustum.test.ts src/core/gateway/commands/torus.test.ts src/core/gateway/commands/wedge.test.ts src/core/gateway/commands/pyramid.test.ts --reporter=verbose`
Expected: FAIL

- [ ] **Step 2: Implement all four commands**

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/core/gateway/commands/frustum.test.ts src/core/gateway/commands/torus.test.ts src/core/gateway/commands/wedge.test.ts src/core/gateway/commands/pyramid.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

---

## Chunk 6: Command Files — Advanced Creation Operations

### Task 6.1: Create polyhedron.ts, convex-hull.ts, extrude.ts, revolve.ts, compound.ts

**Files:**
- Create: `src/core/gateway/commands/polyhedron.ts`
- Create: `src/core/gateway/commands/convex-hull.ts`
- Create: `src/core/gateway/commands/extrude.ts`
- Create: `src/core/gateway/commands/revolve.ts`
- Create: `src/core/gateway/commands/compound.ts`
- Create: corresponding .test.ts files

- [ ] **Step 1: Write failing tests**

- [ ] **Step 2: Implement all five commands**

- [ ] **Step 3: Run tests to verify they pass**

- [ ] **Step 4: Commit**

---

### Task 6.2: Create sweep.ts, loft.ts, boolean.ts, step-export.ts command files

**Files:**
- Create: `src/core/gateway/commands/sweep.ts`
- Create: `src/core/gateway/commands/loft.ts`
- Create: `src/core/gateway/commands/boolean.ts`
- Create: `src/core/gateway/commands/step-export.ts`
- Create: corresponding .test.ts files

- [ ] **Step 1: Write failing tests**

- [ ] **Step 2: Implement all four commands**

- [ ] **Step 3: Run tests to verify they pass**

- [ ] **Step 4: Commit**

---

## Chunk 7: Command Files — Transforms & Modifications

### Task 7.1: Create mult-matrix.ts, transform.ts, rotate.ts, mirror.ts, scale.ts

**Files:**
- Create: `src/core/gateway/commands/mult-matrix.ts`
- Create: `src/core/gateway/commands/transform.ts`
- Create: `src/core/gateway/commands/rotate.ts`
- Create: `src/core/gateway/commands/mirror.ts`
- Create: `src/core/gateway/commands/scale.ts`
- Create: corresponding .test.ts files

- [ ] **Step 1: Write failing tests**

- [ ] **Step 2: Implement all five commands**

- [ ] **Step 3: Run tests to verify they pass**

- [ ] **Step 4: Commit**

---

### Task 7.2: Create fillet.ts, chamfer.ts, fillet-face.ts, chamfer-face.ts, thick-solid.ts, draft-faces.ts

**Files:**
- Create: `src/core/gateway/commands/fillet.ts`
- Create: `src/core/gateway/commands/chamfer.ts`
- Create: `src/core/gateway/commands/fillet-face.ts`
- Create: `src/core/gateway/commands/chamfer-face.ts`
- Create: `src/core/gateway/commands/thick-solid.ts`
- Create: `src/core/gateway/commands/draft-faces.ts`
- Create: corresponding .test.ts files

- [ ] **Step 1: Write failing tests**

- [ ] **Step 2: Implement all six commands**

- [ ] **Step 3: Run tests to verify they pass**

- [ ] **Step 4: Commit**

---

## Chunk 8: Command Files — B-rep, Validity, Lifecycle

### Task 8.1: Create init.ts, clear-cache.ts, release-shapes.ts, check-validity.ts

**Files:**
- Create: `src/core/gateway/commands/init.ts`
- Create: `src/core/gateway/commands/clear-cache.ts`
- Create: `src/core/gateway/commands/release-shapes.ts`
- Create: `src/core/gateway/commands/check-validity.ts`
- Create: corresponding .test.ts files

- [ ] **Step 1: Write failing tests**

- [ ] **Step 2: Implement all four commands**

- [ ] **Step 3: Run tests to verify they pass**

- [ ] **Step 4: Commit**

---

### Task 8.2: Create export-brep.ts, import-brep.ts, extract-face-profile.ts

**Files:**
- Create: `src/core/gateway/commands/export-brep.ts`
- Create: `src/core/gateway/commands/import-brep.ts`
- Create: `src/core/gateway/commands/extract-face-profile.ts`
- Create: corresponding .test.ts files

- [ ] **Step 1: Write failing tests**

- [ ] **Step 2: Implement all three commands**

- [ ] **Step 3: Run tests to verify they pass**

- [ ] **Step 4: Commit**

---

## Chunk 9: Command Registry Registration

### Task 9.1: Create commands/index.ts barrel and register all commands

**Files:**
- Create: `src/core/gateway/commands/index.ts`
- Modify: `src/core/gateway/command-registry.ts`

```typescript
// commands/index.ts
export { BoxCommand } from './box.js';
export { CylinderCommand } from './cylinder.js';
// ... all 37 commands

// command-registry.ts
import * as commands from './commands/index.js';
for (const cmd of Object.values(commands)) {
  commandRegistry.register(cmd);
}
```

- [ ] **Step 1: Create commands/index.ts with all 37 command exports**

- [ ] **Step 2: Modify command-registry.ts to auto-register all commands**

- [ ] **Step 3: Verify all 37 commands registered**

Run: `npx vitest run src/core/gateway/command-registry.test.ts --reporter=verbose` (create if needed)
Expected: PASS — `commandRegistry.list().length === 37`

- [ ] **Step 4: Commit**

---

## Chunk 10: connect-server.ts KernelService Routes

### Task 10.1: Implement KernelService execute, executeWithProgress, restore routes

**Files:**
- Modify: `src/core/gateway/connect-server.ts`

- [ ] **Step 1: Implement execute route** — delegate to kernelSupervisor.getKernelForSession() + client.execute()

- [ ] **Step 2: Implement executeWithProgress route** — server-streaming progress

- [ ] **Step 3: Implement restore route** — delegate to kernel Restore

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 5: Commit**

---

### Task 10.2: Implement KernelService putBlob, streamResult routes

**Files:**
- Modify: `src/core/gateway/connect-server.ts`

- [ ] **Step 1: Implement putBlob route** — client-streaming blob upload

- [ ] **Step 2: Implement streamResult route** — server-streaming result chunks

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

---

## Chunk 11: Integration Tests & Verification

### Task 11.1: Create integration test for gRPC transport end-to-end

**Files:**
- Create: `tests/core/io/grpc-transport-integration.test.ts`

- [ ] **Step 1: Write integration test** — requires running kernel (Docker container)

- [ ] **Step 2: Run integration test against running kernel**

Run: `npx vitest run tests/core/io/grpc-transport-integration.test.ts --reporter=verbose`
Expected: PASS (if kernel running)

- [ ] **Step 3: Commit**

---

### Task 11.2: Run full verification suite

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 warnings/errors

- [ ] **Step 3: Run unit tests**

Run: `npm test`
Expected: 0 failures

- [ ] **Step 4: Run buf lint/breaking**

Run: `npm run buf:lint && npm run buf:breaking`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete gRPC kernel transport full parity"
```

---

## Summary

This plan implements full gRPC kernel transport parity across 37 operations through:
1. `KernelGrpcTransport` — server-side OCCTransport implementation (all 37 methods)
2. 37 command files in `src/core/gateway/commands/` — gateway-side command implementations
3. `commands/index.ts` barrel + registration in `command-registry.ts`
4. `BoxCommand` revision — real kernel call instead of synthetic shapeId
5. `connect-server.ts` KernelService routes — 5 UNIMPLEMENTED routes implemented
6. Unit tests for all components
7. Integration tests against running kernel

Estimated: ~70 tasks across 11 chunks. Each chunk produces self-contained, committable changes.
