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

  it('Execute(InitOp) returns success — session init handled by kernel', async () => {
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
    expect(response.success).toBeDefined();
  });

  it('create_box returns success and shape_id', async () => {
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

  it('step_export returns valid STEP data for created box', async () => {
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
    expect(response.brep_ref.data.length).toBeGreaterThan(0);
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

  it('create_box with second entity_id returns success', async () => {
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
