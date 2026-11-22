// KernelGrpcTransport: server-side transport that routes OCC operations
// to the native OCCT kernel via gRPC over UDS, managed by KernelSupervisor.
//
// Browser-side clients do NOT use this directly — they use RemoteGrpcTransport
// to the gateway, which forwards to KernelGrpcTransport internally.
//
// See docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md
// for architecture and error handling.

import { OCCTransport } from './OCCTransport.js';
import { create } from '@bufbuild/protobuf';
import type { KernelClient } from '../gateway/kernel-client.js';
import type { CommandHeader } from '../../generated/proto/webcad/engine/v1/common_pb.js';
import { CommandHeaderSchema } from '../../generated/proto/webcad/engine/v1/common_pb.js';

export class KernelGrpcTransport implements OCCTransport {
  private sessionId: string;
  private client: KernelClient | null = null;
  private initialized = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  private header(requestId: string): CommandHeader {
    return create(CommandHeaderSchema, {
      sessionId: this.sessionId,
      requestId,
      clientSeq: 0n,
      documentId: '',
    });
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

  async clearCache(): Promise<{ success: boolean }> {
    await this.init();
    const result = await this.client!.execute({ header: this.header(crypto.randomUUID()), clear_cache: {} });
    return { success: (result as { success?: boolean })?.success ?? false };
  }

  async releaseShapes(entityIds: string[]): Promise<void> {
    await this.init();
    await this.client!.execute({ header: this.header(crypto.randomUUID()), release_shapes: { entity_ids: entityIds } });
  }

  async checkValidity(entityId: string): Promise<{ isValid: boolean; faceCount: number; errorMsg: string }> {
    await this.init();
    const result = await this.client!.execute({ header: this.header(crypto.randomUUID()), check_validity: { entity_id: entityId } });
    return result as { isValid: boolean; faceCount: number; errorMsg: string };
  }

  async exportBRep(entityId: string): Promise<Uint8Array> {
    await this.init();
    const result = await this.client!.execute({ header: this.header(crypto.randomUUID()), export_brep: { entity_id: entityId } });
    return result as Uint8Array;
  }

  async importBRep(entityId: string, brepBytes: Uint8Array, deflection?: number): Promise<any> {
    await this.init();
    return await this.client!.execute({ header: this.header(crypto.randomUUID()), import_brep: { entity_id: entityId, brep_bytes: brepBytes, deflection: deflection ?? 0 } });
  }

  async extractFaceProfile(entityId: string, faceIndex: number, deflection?: number): Promise<{ loops: { x: number; y: number; bulge: number }[][] }> {
    await this.init();
    const result = await this.client!.execute({ header: this.header(crypto.randomUUID()), extract_face_profile: { entity_id: entityId, face_index: faceIndex, deflection: deflection ?? 0 } });
    return result as { loops: { x: number; y: number; bulge: number }[][] };
  }

  async createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_box: { x, y, z, dx, dy, dz, deflection: deflection ?? 0, entityId: entityId ?? '' },
    });
  }

  async createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_cylinder: { x, y, z, r, h, deflection: deflection ?? 0, entityId: entityId ?? '' },
    });
  }

  async createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_sphere: { x, y, z, r, deflection: deflection ?? 0, entityId: entityId ?? '' },
    });
  }

  async createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_cone: { x, y, z, r, h, deflection: deflection ?? 0, entityId: entityId ?? '' },
    });
  }

  async createFrustum(x: number, y: number, z: number, r1: number, r2: number, h: number, deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_frustum: { x, y, z, r1, r2, h, deflection: deflection ?? 0, entityId: entityId ?? '' },
    });
  }

  async createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_torus: { x, y, z, r1, r2, deflection: deflection ?? 0, entityId: entityId ?? '' },
    });
  }

  async createWedge(x1: number, y1: number, z1: number, x2: number, y2: number, height: number, ltx: number, deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_wedge: { x1, y1, z1, x2, y2, height, ltx, deflection: deflection ?? 0, entityId: entityId ?? '' },
    });
  }

  async createPyramid(x: number, y: number, z: number, sides: number, radius: number, h: number, deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_pyramid: { x, y, z, sides, radius, h, deflection: deflection ?? 0, entityId: entityId ?? '' },
    });
  }

  async createPolyhedron(points: any[], faces: number[][], deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_polyhedron: {
        pointsInline: points.map((p: any) => ({ x: p.x, y: p.y, z: p.z })),
        faces: faces.map((f: number[]) => ({ vertexIndices: f })),
        deflection: deflection ?? 0,
        entityId: entityId ?? '',
      },
    });
  }

  async createConvexHull(points?: any[], shapeIds?: string[], deflection?: number, entityId?: string): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_convex_hull: {
        shapeIds: shapeIds ?? [],
        pointsInline: points?.map((p: any) => ({ x: p.x, y: p.y, z: p.z })) ?? [],
        deflection: deflection ?? 0,
        entityId: entityId ?? '',
      },
    });
  }

  async createExtrude(points: any[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string, vector?: number[]): Promise<any> {
    await this.init();
    return await this.client!.execute({
      header: this.header(crypto.randomUUID()),
      create_extrude: {
        points: points.map((p: any) => ({ x: p.x, y: p.y, z: p.z })),
        height,
        thickness: thickness ?? 0,
        deflection: deflection ?? 0,
        isClosed: isClosed ?? false,
        entityId: entityId ?? '',
        vector: vector ?? [],
      },
    });
  }

  async createRevolve(points: any[], axisPoint: { x: number; y: number; z: number }, axisDir: { x: number; y: number; z: number }, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<any> {
    throw new Error('createRevolve not yet implemented on KernelGrpcTransport');
  }

  async createCompound(childrenIds: string[], entityId: string, deflection?: number): Promise<any> {
    throw new Error('createCompound not yet implemented on KernelGrpcTransport');
  }

  async createSweep(profilePoints: { x: number; y: number; z: number }[], spinePoints: { x: number; y: number; z: number }[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<any> {
    throw new Error('createSweep not yet implemented on KernelGrpcTransport');
  }

  async createLoft(profiles: { id: string; points: { x: number; y: number; z: number }[]; closed: boolean }[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<any> {
    throw new Error('createLoft not yet implemented on KernelGrpcTransport');
  }

  async createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: { x: number; y: number; z: number }, rotB?: { x: number; y: number; z: number }, centerA?: { x: number; y: number; z: number }, centerB?: { x: number; y: number; z: number }): Promise<any> {
    throw new Error('createBoolean not yet implemented on KernelGrpcTransport');
  }

  async multMatrixShape(entityId: string, m: number[], targetEntityId?: string, deflection?: number): Promise<any> {
    throw new Error('multMatrixShape not yet implemented on KernelGrpcTransport');
  }

  async transformShape(entityId: string, dx: number, dy: number, dz: number, targetEntityId?: string, deflection?: number): Promise<any> {
    throw new Error('transformShape not yet implemented on KernelGrpcTransport');
  }

  async rotateShape(entityId: string, rx: number, ry: number, rz: number, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number): Promise<any> {
    throw new Error('rotateShape not yet implemented on KernelGrpcTransport');
  }

  async mirrorShape(entityId: string, p1: { x: number; y: number; z?: number } | undefined, p2: { x: number; y: number; z?: number } | undefined, targetEntityId?: string, deflection?: number, normal?: { x: number; y: number; z?: number }): Promise<any> {
    throw new Error('mirrorShape not yet implemented on KernelGrpcTransport');
  }

  async scaleShape(entityId: string, factor: number | undefined, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number, factorX?: number, factorY?: number, factorZ?: number): Promise<any> {
    throw new Error('scaleShape not yet implemented on KernelGrpcTransport');
  }

  async filletSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<any> {
    throw new Error('filletSolid not yet implemented on KernelGrpcTransport');
  }

  async chamferSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<any> {
    throw new Error('chamferSolid not yet implemented on KernelGrpcTransport');
  }

  async filletSolidFace(entityId: string, faceIndex: number, radius: number): Promise<any> {
    throw new Error('filletSolidFace not yet implemented on KernelGrpcTransport');
  }

  async chamferSolidFace(entityId: string, faceIndex: number, radius: number): Promise<any> {
    throw new Error('chamferSolidFace not yet implemented on KernelGrpcTransport');
  }

  async makeThickSolid(entityId: string, faceIndices: number[], thickness: number, removeFaces?: boolean): Promise<any> {
    throw new Error('makeThickSolid not yet implemented on KernelGrpcTransport');
  }

  async draftSolidFaces(entityId: string, faceIndices: number[], neutralFaceIndex: number, angleRad: number): Promise<any> {
    throw new Error('draftSolidFaces not yet implemented on KernelGrpcTransport');
  }
}