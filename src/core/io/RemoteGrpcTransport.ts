import { OCCTransport } from './OCCTransport.js';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import {
  EngineGatewayService,
  OpenSessionRequest,
  ExecuteRequest,
  ExecuteResponse,
  SubscribeRequest,
  SessionEvent,
  InitOp,
  ClearCacheOp,
  ReleaseShapesOp,
  CheckValidityOp,
  ExportBRepOp,
  ImportBRepOp,
  ExtractFaceProfileOp,
  CreateBoxOp,
  CreateCylinderOp,
  CreateSphereOp,
  CreateConeOp,
  CreateFrustumOp,
  CreateTorusOp,
  CreateWedgeOp,
  CreatePyramidOp,
  CreatePolyhedronOp,
  CreateConvexHullOp,
  CreateExtrudeOp,
  CreateRevolveOp,
  CreateCompoundOp,
  CreateSweepOp,
  CreateLoftOp,
  CreateBooleanOp,
  MultMatrixShapeOp,
  TransformShapeOp,
  RotateShapeOp,
  MirrorShapeOp,
  ScaleShapeOp,
  FilletSolidOp,
  ChamferSolidOp,
  FilletSolidFaceOp,
  ChamferSolidFaceOp,
  MakeThickSolidOp,
  DraftSolidFacesOp,
} from '../../generated/proto/webcad/engine/v1/engine_pb.js';
import { CommandHeader, MeshData, BrepReference, ExecutionFailureCode } from '../../generated/proto/webcad/engine/v1/common_pb.js';

export interface RemoteGrpcTransportConfig {
  gatewayUrl: string;
  sessionId?: string;
  includeBrep?: boolean;
  timeoutMs?: number;
}

class GrpcTransportError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'GrpcTransportError';
  }
}

type OpCase =
  | 'init' | 'clearCache' | 'releaseShapes' | 'checkValidity' | 'exportBrep' | 'importBrep'
  | 'extractFaceProfile' | 'createBox' | 'createCylinder' | 'createSphere' | 'createCone'
  | 'createFrustum' | 'createTorus' | 'createWedge' | 'createPyramid' | 'createPolyhedron'
  | 'createConvexHull' | 'createExtrude' | 'createRevolve' | 'createCompound' | 'createSweep'
  | 'createLoft' | 'createBoolean' | 'multMatrixShape' | 'transformShape' | 'rotateShape'
  | 'mirrorShape' | 'scaleShape' | 'filletSolid' | 'chamferSolid' | 'filletSolidFace'
  | 'chamferSolidFace' | 'makeThickSolid' | 'draftSolidFaces';

export class RemoteGrpcTransport implements OCCTransport {
  private config: Required<RemoteGrpcTransportConfig>;
  private client: any = null;
  private sessionId: string;
  private clientSeq = 0n;
  private pendingCountValue = 0;
  private subscribed = false;
  private eventListeners = new Set<(event: SessionEvent) => void>();

  constructor(config: RemoteGrpcTransportConfig) {
    this.config = {
      gatewayUrl: config.gatewayUrl,
      sessionId: config.sessionId ?? crypto.randomUUID(),
      includeBrep: config.includeBrep ?? true,
      timeoutMs: config.timeoutMs ?? 120_000,
    };
    this.sessionId = this.config.sessionId;
  }

  private get clientOrThrow() {
    if (!this.client) {
      throw new GrpcTransportError('FAILED_PRECONDITION', 'Transport not initialized. Call init() first.');
    }
    return this.client;
  }

  private header(requestId?: string): CommandHeader {
    return {
      sessionId: this.sessionId,
      requestId: requestId ?? crypto.randomUUID(),
      clientSeq: ++this.clientSeq,
      documentId: '',
    };
  }

  private async execute<C extends OpCase>(
    opName: C,
    payload: unknown,
    requestId?: string,
  ): Promise<ExecuteResponse> {
    const reqId = requestId ?? crypto.randomUUID();

    this.pendingCountValue++;

    try {
      const request: ExecuteRequest = {
        header: this.header(reqId),
        includeBrep: this.config.includeBrep,
        op: { case: opName as ExecuteRequest['op']['case'], value: payload } as ExecuteRequest['op'],
      };

      const response = await this.clientOrThrow.execute(request, {
        headers: { 'x-session-id': this.sessionId },
        responseTimeout: this.config.timeoutMs,
      });

      if (response.result?.case === 'failure') {
        const f = response.result.value;
        throw new GrpcTransportError(
          ExecutionFailureCode[f.code] ?? 'UNKNOWN',
          `Execution failure (${f.code}): ${f.message}`,
        );
      }

      return response;
    } finally {
      this.pendingCountValue--;
    }
  }

  async init(): Promise<void> {
    const transport = createConnectTransport({
      baseUrl: this.config.gatewayUrl,
    });
    this.client = createClient(EngineGatewayService, transport);

    const request: OpenSessionRequest = {
      header: {
        sessionId: this.sessionId,
        requestId: crypto.randomUUID(),
        clientSeq: 0n,
        documentId: '',
      },
      clientVersion: '1.0.0',
      includeBrep: this.config.includeBrep,
    };

    await this.clientOrThrow.openSession(request);
  }

  get pendingCount(): number {
    return this.pendingCountValue;
  }

  async clearCache(): Promise<{ success: boolean }> {
    await this.execute('clearCache', {});
    return { success: true };
  }

  async releaseShapes(entityIds: string[]): Promise<void> {
    const op: ReleaseShapesOp = { entityIds };
    await this.execute('releaseShapes', op);
  }

  async checkValidity(entityId: string): Promise<{ isValid: boolean; faceCount: number; errorMsg: string }> {
    const op: CheckValidityOp = { entityId };
    await this.execute('checkValidity', op);
    return { isValid: true, faceCount: 0, errorMsg: '' };
  }

  async exportBRep(entityId: string): Promise<Uint8Array> {
    const op: ExportBRepOp = { entityId };
    const response = await this.execute('exportBrep', op);
    const brepRef = response.brepRef;
    if (brepRef?.data) {
      return new Uint8Array(brepRef.data);
    }
    throw new GrpcTransportError('NOT_FOUND', `No B-rep data for entity ${entityId}`);
  }

  async importBRep(
    entityId: string,
    brepBytes: Uint8Array,
    deflection?: number,
  ): Promise<any> {
    const op: ImportBRepOp = { entityId, brepSource: { case: 'brepBytes', value: brepBytes }, deflection: deflection ?? 0.1 };
    await this.execute('importBrep', op);
    return { success: true };
  }

  async extractFaceProfile(
    entityId: string,
    faceIndex: number,
    deflection?: number,
  ): Promise<{ loops: { x: number; y: number; bulge: number }[][] }> {
    const op: ExtractFaceProfileOp = { entityId, faceIndex, deflection: deflection ?? 0.1 };
    await this.execute('extractFaceProfile', op);
    return { loops: [] };
  }

  private meshDataToResult(
    mesh: MeshData | undefined,
    brepRef: BrepReference | undefined,
  ): { positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array } {
    const positions: number[] = [];
    const indices: number[] = [];
    let faceMapping: number[] | undefined;
    let edgeLines: number[][] | undefined;
    let brepBytes: Uint8Array | undefined;

    if (mesh) {
      if (mesh.positions) {
        const f32 = new Float32Array(mesh.positions.byteLength / 4);
        const dv = new DataView(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength);
        for (let i = 0; i < f32.length; i++) f32[i] = dv.getFloat32(i * 4, true);
        for (let i = 0; i < f32.length; i++) positions.push(f32[i]);
      }
      if (mesh.indices) {
        const u32 = new Uint32Array(mesh.indices.byteLength / 4);
        const dv = new DataView(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength);
        for (let i = 0; i < u32.length; i++) u32[i] = dv.getUint32(i * 4, true);
        for (let i = 0; i < u32.length; i++) indices.push(u32[i]);
      }
      if (mesh.faceMapping) {
        const i32 = new Int32Array(mesh.faceMapping.byteLength / 4);
        const dv = new DataView(mesh.faceMapping.buffer, mesh.faceMapping.byteOffset, mesh.faceMapping.byteLength);
        for (let i = 0; i < i32.length; i++) i32[i] = dv.getInt32(i * 4, true);
        faceMapping = Array.from(i32);
      }
      if (mesh.edgeOffsets && mesh.edgeLines) {
        const offCount = mesh.edgeOffsets.byteLength / 4;
        const offsets = new Uint32Array(offCount);
        const offDv = new DataView(mesh.edgeOffsets.buffer, mesh.edgeOffsets.byteOffset, mesh.edgeOffsets.byteLength);
        for (let i = 0; i < offCount; i++) offsets[i] = offDv.getUint32(i * 4, true);

        const lineCount = mesh.edgeLines.byteLength / 4;
        const lines = new Float32Array(lineCount);
        const lineDv = new DataView(mesh.edgeLines.buffer, mesh.edgeLines.byteOffset, mesh.edgeLines.byteLength);
        for (let i = 0; i < lineCount; i++) lines[i] = lineDv.getFloat32(i * 4, true);

        edgeLines = [];
        for (let i = 0; i < offsets.length - 1; i++) {
          const start = offsets[i] * 4;
          const end = offsets[i + 1] * 4;
          edgeLines.push(Array.from(lines.subarray(start / 4, end / 4)));
        }
      }
    }

    if (brepRef?.data) {
      brepBytes = new Uint8Array(brepRef.data);
    }

    return { positions, indices, faceMapping, edgeLines, brepBytes };
  }

  async createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateBoxOp = { x, y, z, dx, dy, dz, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createBox', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateCylinderOp = { x, y, z, r, h, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createCylinder', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateSphereOp = { x, y, z, r, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createSphere', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateConeOp = { x, y, z, r, h, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createCone', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createFrustum(x: number, y: number, z: number, r1: number, r2: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateFrustumOp = { x, y, z, r1, r2, h, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createFrustum', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateTorusOp = { x, y, z, r1, r2, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createTorus', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createWedge(x1: number, y1: number, z1: number, x2: number, y2: number, height: number, ltx: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateWedgeOp = { x1, y1, z1, x2, y2, height, ltx, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createWedge', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createPyramid(x: number, y: number, z: number, sides: number, radius: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreatePyramidOp = { x, y, z, sides, radius, h, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createPyramid', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createPolyhedron(points: any[], faces: number[][], deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array; nakedLines?: number[][]; isSolid?: boolean }> {
    const op: CreatePolyhedronOp = { pointsInline: points, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createPolyhedron', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createConvexHull(points?: { x: number; y: number; z: number }[], shapeIds?: string[], deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array; isSolid?: boolean }> {
    const op: CreateConvexHullOp = { pointsInline: points ?? [], shapeIds: shapeIds ?? [], deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createConvexHull', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createExtrude(points: { x: number; y: number; z: number }[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string, vector?: number[]): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateExtrudeOp = { points, height, thickness: thickness ?? 0, deflection: deflection ?? 0.1, isClosed: isClosed ?? false, entityId: entityId ?? '', vector: vector ?? [] };
    const response = await this.execute('createExtrude', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createRevolve(points: { x: number; y: number; z: number }[], axisPoint: { x: number; y: number; z: number }, axisDir: { x: number; y: number; z: number }, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateRevolveOp = { points, axisPoint, axisDir, angle, thickness: thickness ?? 0, deflection: deflection ?? 0.1, isClosed: isClosed ?? false, entityId: entityId ?? '' };
    const response = await this.execute('createRevolve', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createCompound(childrenIds: string[], entityId: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateCompoundOp = { childrenIds, entityId, deflection: deflection ?? 0.1 };
    const response = await this.execute('createCompound', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createSweep(profilePoints: { x: number; y: number; z: number }[], spinePoints: { x: number; y: number; z: number }[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateSweepOp = { profilePoints, spinePoints, isSolid, deflection: deflection ?? 0.1, entityId: entityId ?? '', profileCount: profileCount ?? 0, cornerMode: cornerMode ?? '', isEllipse: isEllipse ?? false };
    const response = await this.execute('createSweep', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createLoft(profiles: { id: string; points: { x: number; y: number; z: number }[]; closed: boolean }[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateLoftOp = { profiles: profiles.map(p => ({ id: p.id, points: p.points, closed: p.closed })), isSolid, isRuled, deflection: deflection ?? 0.1, entityId: entityId ?? '' };
    const response = await this.execute('createLoft', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: { x: number; y: number; z: number }, rotB?: { x: number; y: number; z: number }, centerA?: { x: number; y: number; z: number }, centerB?: { x: number; y: number; z: number }): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: CreateBooleanOp = { operation, idA, idB, entityId, deflection: deflection ?? 0.1, rotA: rotA ?? { x: 0, y: 0, z: 0 }, rotB: rotB ?? { x: 0, y: 0, z: 0 }, centerA: centerA ?? { x: 0, y: 0, z: 0 }, centerB: centerB ?? { x: 0, y: 0, z: 0 } };
    const response = await this.execute('createBoolean', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async multMatrixShape(entityId: string, m: number[], targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: MultMatrixShapeOp = { entityId, m, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1 };
    const response = await this.execute('multMatrixShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async transformShape(entityId: string, dx: number, dy: number, dz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: TransformShapeOp = { entityId, dx, dy, dz, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1 };
    const response = await this.execute('transformShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async rotateShape(entityId: string, rx: number, ry: number, rz: number, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: RotateShapeOp = { entityId, rx, ry, rz, cx, cy, cz, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1 };
    const response = await this.execute('rotateShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async mirrorShape(entityId: string, p1: { x: number; y: number; z?: number } | undefined, p2: { x: number; y: number; z?: number } | undefined, targetEntityId?: string, deflection?: number, normal?: { x: number; y: number; z?: number }): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const toPt = (p: { x: number; y: number; z?: number }) => ({ x: p.x, y: p.y, z: p.z ?? 0 });
    const op: MirrorShapeOp = { entityId, p1: p1 ? toPt(p1) : { x: 0, y: 0, z: 0 }, p2: p2 ? toPt(p2) : { x: 0, y: 0, z: 0 }, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1, normal: normal ? toPt(normal) : { x: 0, y: 0, z: 0 } };
    const response = await this.execute('mirrorShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async scaleShape(entityId: string, factor: number | undefined, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number, factorX?: number, factorY?: number, factorZ?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: ScaleShapeOp = { entityId, factor: factor ?? 1, cx, cy, cz, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1, factorX: factorX ?? 1, factorY: factorY ?? 1, factorZ: factorZ ?? 1 };
    const response = await this.execute('scaleShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async filletSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: FilletSolidOp = { entityId, edgeIndex, radius, deflection: deflection ?? 0.1, visualP1: visualP1 ?? { x: 0, y: 0 }, visualP2: visualP2 ?? { x: 0, y: 0 } };
    const response = await this.execute('filletSolid', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async chamferSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: ChamferSolidOp = { entityId, edgeIndex, radius, deflection: deflection ?? 0.1, visualP1: visualP1 ?? { x: 0, y: 0 }, visualP2: visualP2 ?? { x: 0, y: 0 } };
    const response = await this.execute('chamferSolid', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async filletSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: FilletSolidFaceOp = { entityId, faceIndex, radius };
    const response = await this.execute('filletSolidFace', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async chamferSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: ChamferSolidFaceOp = { entityId, faceIndex, radius };
    const response = await this.execute('chamferSolidFace', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async makeThickSolid(entityId: string, faceIndices: number[], thickness: number, removeFaces?: boolean): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: MakeThickSolidOp = { entityId, faceIndices, thickness, removeFaces: removeFaces ?? false };
    const response = await this.execute('makeThickSolid', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async draftSolidFaces(entityId: string, faceIndices: number[], neutralFaceIndex: number, angleRad: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op: DraftSolidFacesOp = { entityId, faceIndices, neutralFaceIndex, angleRad };
    const response = await this.execute('draftSolidFaces', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async closeSession(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.closeSession({ header: this.header() });
    } finally {
      this.client = null;
      this.subscribed = false;
    }
  }

  async subscribe(onEvent: (event: SessionEvent) => void): Promise<void> {
    if (!this.client) {
      throw new GrpcTransportError('FAILED_PRECONDITION', 'Transport not initialized');
    }
    this.eventListeners.add(onEvent);

    if (this.subscribed) return;
    this.subscribed = true;

    const request: SubscribeRequest = { header: this.header(), lastEventId: 0n };

    try {
      const stream = this.client.subscribe(request, {
        headers: { 'x-session-id': this.sessionId },
        responseTimeout: 0,
      });

      for await (const event of stream) {
        this.eventListeners.forEach((listener) => listener(event));
      }
    } catch (err) {
      this.subscribed = false;
      throw err;
    }
  }

  unsubscribe(onEvent: (event: SessionEvent) => void): void {
    this.eventListeners.delete(onEvent);
  }
}
