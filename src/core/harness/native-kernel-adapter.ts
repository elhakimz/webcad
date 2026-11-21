import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import * as path from 'node:path';
import { KernelAdapter, Script, KernelResult, KernelMetric } from './kernel-adapter';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/webcad/engine/v1/engine.proto');

export class NativeKernelAdapter implements KernelAdapter {
  readonly name = 'native';
  private client: any = null;
  private kernelAddress: string;

  constructor(kernelAddress?: string) {
    this.kernelAddress = kernelAddress || process.env.KERNEL_ADDRESS || 'localhost:50051';
  }

  async init(): Promise<void> {
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const grpcObject = (grpc as unknown as { loadPackageDefinition: (def: any) => any }).loadPackageDefinition(packageDefinition);
    const engineProto = grpcObject.webcad.engine.v1;
    this.client = new engineProto.KernelService(this.kernelAddress, grpc.credentials.createInsecure());
  }

  async execute(script: Script): Promise<KernelResult[]> {
    if (!this.client) throw new Error('NativeKernelAdapter not initialized');
    const results: KernelResult[] = [];

    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      const request = this.buildExecuteRequest(step);

      let response: any;
      try {
        response = await new Promise<any>((resolve, reject) => {
          this.client.Execute(request, (err: grpc.ServiceError | null, res: any) => {
            if (err) reject(err);
            else resolve(res);
          });
        });
      } catch (err) {
        results.push({
          stepIndex: i,
          stepName: step.name,
          metrics: {},
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      results.push(this.parseExecuteResponse(i, step.name, response));
    }

    return results;
  }

  private buildExecuteRequest(step: { name: string; parameters: Record<string, unknown> }): any {
    const header = {
      session_id: 'parity-harness',
      request_id: `step-${step.name}`,
      client_seq: 1,
      document_id: '',
    };

    const opMap: Record<string, string> = {
      create_box: 'create_box',
      create_cylinder: 'create_cylinder',
      create_sphere: 'create_sphere',
      create_cone: 'create_cone',
      create_torus: 'create_torus',
    };

    const opField = opMap[step.name];
    const request: any = { header, include_brep: false };

    if (opField) {
      request[opField] = { ...step.parameters, entity_id: `shape_${step.name}_${opField}` };
    }

    return request;
  }

  private parseExecuteResponse(stepIndex: number, stepName: string, response: any): KernelResult {
    if (!response) {
      return {
        stepIndex,
        stepName,
        metrics: {},
        success: false,
        error: 'Empty response from kernel',
      };
    }

    const failure = response.failure;
    if (failure) {
      return {
        stepIndex,
        stepName,
        metrics: {},
        success: false,
        error: failure.message || `Kernel failure: ${failure.operation || 'unknown'}`,
      };
    }

    const success = response.success;
    if (!success) {
      return {
        stepIndex,
        stepName,
        metrics: {},
        success: false,
        error: 'No success or failure in response',
      };
    }

    const metrics: KernelMetric = {};
    const shapeId = success.shape_id;

    // Parse ShapeMetrics from ExecuteResponse.metrics (populated by native kernel)
    const m = response.metrics;
    if (m) {
      if (typeof m.volume === 'number') metrics.volume = m.volume;
      if (typeof m.surface_area === 'number') metrics.surfaceArea = m.surface_area;
      if (m.bbox && typeof m.bbox.min_x === 'number' && typeof m.bbox.max_x === 'number') {
        metrics.bbox = {
          min: [m.bbox.min_x, m.bbox.min_y, m.bbox.min_z],
          max: [m.bbox.max_x, m.bbox.max_y, m.bbox.max_z],
        };
      }
      if (typeof m.face_count === 'number') metrics.faceCount = m.face_count;
      if (typeof m.edge_count === 'number') metrics.edgeCount = m.edge_count;
      if (typeof m.vertex_count === 'number') metrics.vertexCount = m.vertex_count;
      if (typeof m.is_valid === 'boolean') metrics.valid = m.is_valid;
    }

    return {
      stepIndex,
      stepName,
      shapeId,
      metrics,
      success: true,
    };
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}
