import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeKernelAdapter } from '../../src/core/harness/native-kernel-adapter';
import { Script } from '../../src/core/harness/kernel-adapter';

vi.mock('@grpc/grpc-js', () => ({
  __esModule: true,
  default: {
    credentials: { createInsecure: vi.fn() },
    ServiceError: class extends Error {
      constructor(public code: number, message: string) { super(message); this.name = 'ServiceError'; }
    },
  },
  loadPackageDefinition: vi.fn(),
}));

vi.mock('@grpc/proto-loader', () => ({
  __esModule: true,
  default: {
    loadSync: vi.fn(),
  },
}));

import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const mockExecute = vi.fn();
const mockClose = vi.fn();
const mockKernelService = vi.fn(function (this: any, address: string, creds: any) {
  this.Execute = mockExecute;
  this.close = mockClose;
});

describe('NativeKernelAdapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    protoLoader.loadSync as any = vi.fn().mockReturnValue({});
    (grpc as any).loadPackageDefinition as any = vi.fn().mockReturnValue({
      webcad: { engine: { v1: { KernelService: mockKernelService } } },
    });

    mockExecute.mockReset();
    mockClose.mockReset();
  });

  it('creates a box and returns metrics', async () => {
    mockExecute.mockImplementation((request: any, callback: any) => {
      callback(null, {
        success: {
          shape_id: 'box_1',
        },
      });
      return { cancel: vi.fn() };
    });

    const adapter = new NativeKernelAdapter('localhost:50051');
    await adapter.init();

    const script: Script = {
      name: 'test_box',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    };
    const results = await adapter.execute(script);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].shapeId).toBe('box_1');
    expect(results[0].stepName).toBe('create_box');
  });

  it('fails gracefully on kernel error', async () => {
    const grpcErr = new Error('Unknown operation') as any;
    grpcErr.code = 2;
    mockExecute.mockImplementation((request: any, callback: any) => {
      callback(grpcErr, null);
      return { cancel: vi.fn() };
    });

    const adapter = new NativeKernelAdapter('localhost:50051');
    await adapter.init();

    const script: Script = {
      name: 'test_bad',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'nonexistent_op', parameters: {} }],
    };
    const results = await adapter.execute(script);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('Unknown operation');
  });

  it('handles ExecuteFailure response', async () => {
    mockExecute.mockImplementation((request: any, callback: any) => {
      callback(null, {
        failure: {
          operation: 'create_box',
          code: 5,
          message: 'Geometry operation failed',
        },
      });
      return { cancel: vi.fn() };
    });

    const adapter = new NativeKernelAdapter('localhost:50051');
    await adapter.init();

    const script: Script = {
      name: 'test_fail',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    };
    const results = await adapter.execute(script);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('Geometry operation failed');
  });
});
