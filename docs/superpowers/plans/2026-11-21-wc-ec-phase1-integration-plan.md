# WC-EC Phase 1 Cross-Ticket Integration Test Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single self-contained Vitest integration test that connects to the real Docker OCCT kernel through the Phase 1 gRPC protocol chain (header → op → response) and exercises create_box, step_export, error handling, and health — closing the gap that no test reaches a real OCCT kernel through the Phase 1 protocol.

**Architecture:** One new test file (`tests/harness/kernel-docker-phase1.integration.test.ts`) modeled exactly on the existing `tests/harness/docker-kernel-grpc.integration.test.ts`. It creates a gRPC client to `localhost:50051` (container `ef253d77`, image `sha256:ab1484...`), runs 6 tests in one `describe` block sharing a `shapeId`, and leaves the container running in `afterAll` (caller owns lifecycle). No source code changes — test only.

**Tech Stack:** Vitest 4, grpc-js, proto-loader, engine.proto/common.proto, Docker OCCT kernel.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `tests/harness/kernel-docker-phase1.integration.test.ts` | Create | 6-test gRPC integration suite against Docker OCCT kernel |

No other files change. Design doc already saved at `docs/superpowers/specs/2026-11-21-wc-ec-phase1-integration-design.md`.

---

## Chunk 1: Write and run the integration test

### Task 1: Write the test file

- [ ] **Step 1: Create `tests/harness/kernel-docker-phase1.integration.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import * as path from 'node:path';

const PROTO_ROOT = path.resolve(process.cwd(), 'proto');
const PROTO_PATH = path.resolve(PROTO_ROOT, 'webcad/engine/v1/engine.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_ROOT],
});

const grpcObject = (grpc as unknown as { loadPackageDefinition: (def: any) => any }).loadPackageDefinition(packageDefinition);
const engineProto = grpcObject.webcad.engine.v1;

const KERNEL_ADDRESS = process.env.KERNEL_ADDRESS || 'localhost:50051';

describe('WC-EC Phase 1: cross-ticket integration against Docker OCCT kernel', () => {
  let client: any = null;
  let shapeId = '';

  beforeAll(async () => {
    client = new engineProto.KernelService(KERNEL_ADDRESS, grpc.credentials.createInsecure());
  });

  afterAll(() => {
    if (client) {
      client.close();
      client = null;
    }
  });

  const execute = (request: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      client.Execute(request, (err: grpc.ServiceError | null, res: any) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  };

  it('health check returns SERVING', async () => {
    const response = await new Promise<any>((resolve, reject) => {
      client.Health({ service: 'webcad.engine.v1.KernelService' }, (err: any, res: any) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
    expect(response.status).toBe('SERVING_STATUS_SERVING');
  });

  it('Execute(InitOp) round-trips successfully', async () => {
    const request = {
      header: {
        session_id: 'test-session-phase1',
        request_id: 'test-req-init',
        client_seq: 1,
        document_id: '',
      },
      include_brep: false,
      init: {},
    };
    const response = await execute(request);
    expect(response.result).toBe('success');
  });

  it('create_box returns a shape_id', async () => {
    const request = {
      header: {
        session_id: 'test-session-phase1',
        request_id: 'test-req-create-box',
        client_seq: 2,
        document_id: '',
      },
      include_brep: false,
      create_box: {
        x: 0, y: 0, z: 0,
        dx: 10, dy: 10, dz: 10,
        deflection: 0.1,
        entity_id: 'box_1',
      },
    };
    const response = await execute(request);
    expect(response.result).toBe('success');
    expect(response.success).toBeDefined();
    expect(response.success.shape_id).toBe('box_1');
    shapeId = response.success.shape_id;
  });

  it('step_export returns valid STEP-214 data', async () => {
    const request = {
      header: {
        session_id: 'test-session-phase1',
        request_id: 'test-req-step-export',
        client_seq: 3,
        document_id: '',
      },
      include_brep: false,
      step_export: {
        entity_id: shapeId,
      },
    };
    const response = await execute(request);
    expect(response.result).toBe('success');
    expect(response.success).toBeDefined();
    expect(response.brep_ref).toBeDefined();
    expect(response.brep_ref.format).toBe('FORMAT_STEP');
    expect(response.brep_ref.data).toBeDefined();

    const stepData = Buffer.from(response.brep_ref.data as Uint8Array).toString('utf-8');
    expect(stepData.length).toBeGreaterThan(0);
    expect(stepData).toContain('FILE_NAME');
    expect(stepData).toContain('END-ISO-10303-21;');
  });

  it('step_export on missing entity returns failure', async () => {
    const request = {
      header: {
        session_id: 'test-session-phase1',
        request_id: 'test-req-step-missing',
        client_seq: 4,
        document_id: '',
      },
      include_brep: false,
      step_export: {
        entity_id: 'nonexistent_shape',
      },
    };
    const response = await execute(request);
    expect(response.result).toBe('failure');
    expect(response.failure).toBeDefined();
    expect(response.failure.code).toBe(1); // EXECUTION_FAILURE_CODE_MISSING_ENTITY
    expect(response.failure.message).toContain('Shape not found in cache');
  });

  it('create_box with second entity_id returns a second shape_id', async () => {
    const request = {
      header: {
        session_id: 'test-session-phase1',
        request_id: 'test-req-second-box',
        client_seq: 5,
        document_id: '',
      },
      include_brep: false,
      create_box: {
        x: 5, y: 5, z: 5,
        dx: 10, dy: 10, dz: 10,
        deflection: 0.1,
        entity_id: 'box_2',
      },
    };
    const response = await execute(request);
    expect(response.result).toBe('success');
    expect(response.success).toBeDefined();
    expect(response.success.shape_id).toBe('box_2');
  });
});
```

**Note on test 6 (metrics):** The `ExecuteResponse`/`BoxResult` proto does not expose volume or surface area directly — golden parity (volume ≈ 1000, surfaceArea ≈ 600) is covered by WC-EC-09 codec tests. This test verifies a second independent `create_box` succeeds instead, which is honest to what the protocol exposes.

- [ ] **Step 2: Run the new test to verify it passes**

Run:
```
npx vitest run tests/harness/kernel-docker-phase1.integration.test.ts
```
Expected: 6/6 tests pass. If connection refused, ensure Docker container `ef253d77` is running (`docker start ef253d77`).

- [ ] **Step 3: Commit the new test file**

```bash
git add tests/harness/kernel-docker-phase1.integration.test.ts
git commit -m "feat(test): add WC-EC phase 1 Docker kernel integration test

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

Note: Pushes to `elahakimz/webcad` have been blocked by 403 (no write access); commit locally if push fails.

---

## Chunk 2: Full verify

### Task 2: Run full verify suite

- [ ] **Step 1: Run `npm run verify`**

Run:
```
npm run verify
```
Expected: lint ✅, test ✅ (~564/564 including new 6; confirm exact count at run time — baseline was 558/558 after WC-EC-11), buf:lint ✅, buf:breaking ✅.
typecheck ⚠️ has 3 pre-existing unrelated errors in `codec.test.ts` ×2 and `KernelGrpcTransport.ts` ×1 (pre-WC-EC-11, not caused by this change); no new typecheck errors introduced.

- [ ] **Step 2: Commit any fixes if needed**

If verify passes cleanly (aside from pre-existing typecheck errors), no further commit needed — Task 1 Step 3 already committed the test. If a fix is needed, commit it separately with the same `Co-authored-by` trailer.

---

**Plan complete and saved to `docs/superpowers/plans/2026-11-21-wc-ec-phase1-integration-plan.md`. Ready to execute?**
