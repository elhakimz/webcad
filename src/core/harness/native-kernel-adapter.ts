import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import * as path from 'node:path';
import { KernelAdapter, Script, KernelResult, KernelMetric, MeshData } from './kernel-adapter';

const PROTO_ROOT = path.resolve(process.cwd(), 'proto');
const PROTO_PATH = path.resolve(PROTO_ROOT, 'webcad/engine/v1/engine.proto');

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
      includeDirs: [PROTO_ROOT],
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
      create_frustum: 'create_frustum',
      create_wedge: 'create_wedge',
      create_pyramid: 'create_pyramid',
      create_polyhedron: 'create_polyhedron',
      create_convex_hull: 'create_convex_hull',
      create_extrude: 'create_extrude',
      create_revolve: 'create_revolve',
      create_compound: 'create_compound',
      create_boolean: 'create_boolean',
      fillet_solid: 'fillet_solid',
      chamfer_solid: 'chamfer_solid',
      fillet_solid_face: 'fillet_solid_face',
      chamfer_solid_face: 'chamfer_solid_face',
      make_thick_solid: 'make_thick_solid',
      draft_solid_faces: 'draft_solid_faces',
      extract_face_profile: 'extract_face_profile',
      mult_matrix_shape: 'mult_matrix_shape',
      transform_shape: 'transform_shape',
      rotate_shape: 'rotate_shape',
      mirror_shape: 'mirror_shape',
      scale_shape: 'scale_shape',
      step_export: 'step_export',
    };

    const opField = opMap[step.name];

    // Read include_brep from step parameters (opt-in tessellation output).
    // Remove it from params so it doesn't leak into the gRPC op message.
    const includeBrep = step.parameters.include_brep === true;
    const params: Record<string, unknown> = { ...step.parameters };
    delete params.include_brep;

    const request: any = { header, include_brep: includeBrep };

    if (opField) {
      // Protobuf-es serializes using proto field names (snake_case). Convert
      // `points` (array of [x,y,z]) → `points_inline` (array of {x,y,z}) and
      // `faces` entries keep `vertex_indices` (already snake_case).
      if (opField === 'create_polyhedron' || opField === 'create_convex_hull') {
        if (Array.isArray(params.points)) {
          params.points_inline = (params.points as [number, number, number][]).map(([x, y, z]) => ({
            x,
            y,
            z,
          }));
          delete params.points;
        }
      }

      // Normalize `points` for extrude/revolve: [[x,y,z], ...] or [{x,y,z}, ...] → points
      // (proto field is `points`, not `points_inline` — those are for polyhedron/convex_hull only)
      if (opField === 'create_extrude' || opField === 'create_revolve') {
        if (Array.isArray(params.points)) {
          params.points = (params.points as Array<[number, number, number] | { x: number; y: number; z: number }>).map((p) => {
            if (Array.isArray(p)) return { x: p[0], y: p[1], z: p[2] };
            return p as { x: number; y: number; z: number };
          });
        }
      }

      // Normalize axis_point and axis_dir for revolve: [x,y,z] → {x,y,z}
      if (opField === 'create_revolve') {
        if (Array.isArray(params.axis_point)) {
          const [x, y, z] = params.axis_point as [number, number, number];
          params.axis_point = { x, y, z };
        }
        if (Array.isArray(params.axis_dir)) {
          const [x, y, z] = params.axis_dir as [number, number, number];
          params.axis_dir = { x, y, z };
        }
      }

      // Normalize childrenIds → children_ids for compound
      if (opField === 'create_compound') {
        if (Array.isArray(params.children_ids)) {
          // already correct
        } else if (Array.isArray(params.childrenIds)) {
          params.children_ids = params.childrenIds as string[];
          delete params.childrenIds;
        }
      }

      // Normalize `distance` → `radius` for chamfer ops (proto field is `radius`)
      if (opField === 'chamfer_solid' || opField === 'chamfer_solid_face') {
        if (params.distance !== undefined && params.radius === undefined) {
          params.radius = params.distance;
          delete params.distance;
        }
      }

      request[opField] = { ...params };
      if (!request[opField].entity_id) {
        request[opField].entity_id = `shape_${step.name}_${opField}`;
      }
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

    const result: KernelResult = {
      stepIndex,
      stepName,
      shapeId,
      metrics,
      success: true,
    };

    // Parse ExtractFaceProfileResult loops (2D loops, not shape metrics)
    const efp = success.extract_face_profile;
    if (efp && Array.isArray(efp.loops)) {
      result.loops = efp.loops.map((loop: any) => ({
        points: (loop.points || []).map((p: any) => ({
          x: p.x,
          y: p.y,
          bulge: p.bulge ?? 0,
        })),
      }));
    }

    // Parse MeshData (opt-in tessellation output, bytes fields)
    const mesh = response.mesh;
    if (mesh) {
      const decodeFloat32 = (buf: Uint8Array) => {
        const len = buf.byteLength / 4;
        const out = new Float32Array(len);
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        for (let i = 0; i < len; i++) out[i] = view.getFloat32(i * 4, true);
        return out;
      };
      const decodeUint32 = (buf: Uint8Array) => {
        const len = buf.byteLength / 4;
        const out = new Uint32Array(len);
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        for (let i = 0; i < len; i++) out[i] = view.getUint32(i * 4, true);
        return out;
      };
      const decodeInt32 = (buf: Uint8Array) => {
        const len = buf.byteLength / 4;
        const out = new Int32Array(len);
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        for (let i = 0; i < len; i++) out[i] = view.getInt32(i * 4, true);
        return out;
      };

      const m: MeshData = {} as MeshData;
      if (mesh.positions) m.positions = decodeFloat32(mesh.positions as Uint8Array);
      if (mesh.indices) m.indices = decodeUint32(mesh.indices as Uint8Array);
      if (mesh.face_mapping) m.faceMapping = decodeInt32(mesh.face_mapping as Uint8Array);
      if (mesh.edge_offsets) m.edgeOffsets = decodeUint32(mesh.edge_offsets as Uint8Array);
      if (mesh.edge_lines) m.edgeLines = decodeFloat32(mesh.edge_lines as Uint8Array);
      result.mesh = m;
    }

    if (response.brep_ref) {
      result.brepRef = {
        format: response.brep_ref.format,
        data: response.brep_ref.data,
      };
    }

    return result;
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}
