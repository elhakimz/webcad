import { OCCTransport } from './OCCTransport.js';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { create } from '@bufbuild/protobuf';
import {
  EngineGatewayService,
  OpenSessionRequestSchema,
  CloseSessionRequestSchema,
  ExecuteRequestSchema,
  type ExecuteRequest,
  type ExecuteResponse,
  SubscribeRequestSchema,
  SessionEvent,
  ReleaseShapesOpSchema,
  CheckValidityOpSchema,
  ExportBRepOpSchema,
  ImportBRepOpSchema,
  ExtractFaceProfileOpSchema,
  CreateBoxOpSchema,
  CreateCylinderOpSchema,
  CreateSphereOpSchema,
  CreateConeOpSchema,
  CreateFrustumOpSchema,
  CreateTorusOpSchema,
  CreateWedgeOpSchema,
  CreatePyramidOpSchema,
  CreatePolyhedronOpSchema,
  CreateConvexHullOpSchema,
  CreateExtrudeOpSchema,
  CreateRevolveOpSchema,
  CreateCompoundOpSchema,
  CreateSweepOpSchema,
  CreateLoftOpSchema,
  CreateBooleanOpSchema,
  MultMatrixShapeOpSchema,
  TransformShapeOpSchema,
  RotateShapeOpSchema,
  MirrorShapeOpSchema,
  ScaleShapeOpSchema,
  FilletSolidOpSchema,
  ChamferSolidOpSchema,
  FilletSolidFaceOpSchema,
  ChamferSolidFaceOpSchema,
  MakeThickSolidOpSchema,
  DraftSolidFacesOpSchema,
  RestoreRequestSchema,
  RestoreItemSchema,
} from '../../generated/proto/webcad/engine/v1/engine_pb.js';
import { CommandHeader, CommandHeaderSchema, MeshData, BrepReference, BrepReferenceSchema, BrepReference_Format, ExecutionFailureCode } from '../../generated/proto/webcad/engine/v1/common_pb.js';

export interface RemoteGrpcTransportConfig {
  gatewayUrl: string;
  sessionId?: string;
  includeBrep?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  jitter?: number;
  queueSize?: number;
  deadlineMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatMissedThreshold?: number;
}

export class GrpcTransportError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'GrpcTransportError';
  }
}

// Retryable per the gRPC design ADR: network errors, UNAVAILABLE, kernel restarting.
const RETRYABLE_CODES = new Set(['UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED', 'ABORTED']);
// Non-retryable: never retry these.
const NON_RETRYABLE_CODES = new Set([
  'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED',
  'INVALID_PARAMETER',
  'MISSING_ENTITY',
  'INVALID_PROFILE',
  'UNSUPPORTED',
  'GEOMETRY_EMPTY',
  'IMPORT_FAILED',
  'EXPORT_FAILED',
  'SESSION_NOT_FOUND',
  'UPLOAD_NOT_FOUND',
  'RESULT_NOT_FOUND',
  'QUOTA_EXCEEDED',
]);

type OpCase =
  | 'init' | 'clearCache' | 'releaseShapes' | 'checkValidity' | 'exportBrep' | 'importBrep'
  | 'extractFaceProfile' | 'createBox' | 'createCylinder' | 'createSphere' | 'createCone'
  | 'createFrustum' | 'createTorus' | 'createWedge' | 'createPyramid' | 'createPolyhedron'
  | 'createConvexHull' | 'createExtrude' | 'createRevolve' | 'createCompound' | 'createSweep'
  | 'createLoft' | 'createBoolean' | 'multMatrixShape' | 'transformShape' | 'rotateShape'
  | 'mirrorShape' | 'scaleShape' | 'filletSolid' | 'chamferSolid' | 'filletSolidFace'
  | 'chamferSolidFace' | 'makeThickSolid' | 'draftSolidFaces';

export enum ConnectionState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  REHYDRATING = 'REHYDRATING',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR',
}

export interface StateChangeEventDetail {
  state: ConnectionState;
  previous?: ConnectionState;
  reason?: string;
}

export interface TokenExpiredEventDetail {
  reason: string;
}

export interface RehydrateNeededEventDetail {
  reason: string;
  sessionId: string;
}

export class RemoteGrpcTransport implements OCCTransport {
  private config: Required<RemoteGrpcTransportConfig>;
  private client: any = null;
  private sessionId: string;
  private clientSeq = 0n;
  private pendingCountValue = 0;
  private subscribed = false;
  private eventListeners = new Set<(event: SessionEvent) => void>();
  private stateValue: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectingGeneration = 0;
  private eventTarget = new EventTarget();
  private pendingCalls = new Map<string, {
    resolve: (value: ExecuteResponse) => void;
    reject: (reason: any) => void;
    requestId: string;
    deadline: number;
    attempt: number;
    opName: string;
    payload: unknown;
  }>();
  private callQueue: Array<{ opName: string; payload: unknown; requestId?: string; resolve: (v: ExecuteResponse) => void; reject: (r: any) => void }> = [];
  private subscribeStream: any = null;
  private heartbeatTimer: any = null;
  private lastHeartbeat = 0;
  private reconnectTimer: any = null;
  private token: string | undefined;
  private gettingToken = false;

  constructor(config: RemoteGrpcTransportConfig) {
    this.config = {
      gatewayUrl: config.gatewayUrl,
      sessionId: config.sessionId ?? crypto.randomUUID(),
      includeBrep: config.includeBrep ?? true,
      timeoutMs: config.timeoutMs ?? 120_000,
      maxRetries: config.maxRetries ?? 10,
      baseBackoffMs: config.baseBackoffMs ?? 1000,
      maxBackoffMs: config.maxBackoffMs ?? 30_000,
      jitter: config.jitter ?? 0.25,
      queueSize: config.queueSize ?? 50,
      deadlineMs: config.deadlineMs ?? 120_000,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 15_000,
      heartbeatMissedThreshold: config.heartbeatMissedThreshold ?? 3,
    };
    this.sessionId = this.config.sessionId;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.attemptReconnect('browser online'));
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.attemptReconnect('tab visible');
      });
    }
  }

  get state(): ConnectionState {
    return this.stateValue;
  }

  private setState(next: ConnectionState, reason?: string): void {
    const prev = this.stateValue;
    if (prev === next) return;
    this.stateValue = next;
    this.eventTarget.dispatchEvent(
      new CustomEvent('statechange', {
        detail: { state: next, previous: prev, reason },
      }),
    );
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.eventTarget.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.eventTarget.removeEventListener(type, listener);
  }

  private dispatchTokenExpired(reason: string): void {
    this.eventTarget.dispatchEvent(
      new CustomEvent('token-expired', { detail: { reason } }),
    );
  }

  private dispatchRehydrateNeeded(reason: string): void {
    this.eventTarget.dispatchEvent(
      new CustomEvent('rehydrate-needed', {
        detail: { reason, sessionId: this.sessionId },
      }),
    );
  }

  private get clientOrThrow() {
    if (!this.client) {
      throw new GrpcTransportError('FAILED_PRECONDITION', 'Transport not initialized. Call init() first.');
    }
    return this.client;
  }

  private header(requestId?: string): CommandHeader {
    return create(CommandHeaderSchema, {
      sessionId: this.sessionId,
      requestId: requestId ?? crypto.randomUUID(),
      clientSeq: ++this.clientSeq,
      documentId: '',
    });
  }

  private async execute<C extends OpCase>(
    opName: C,
    payload: unknown,
    requestId?: string,
  ): Promise<ExecuteResponse> {
    const reqId = requestId ?? crypto.randomUUID();

    // If reconnecting, queue the call (bounded).
    if (this.stateValue === ConnectionState.RECONNECTING) {
      if (this.callQueue.length >= this.config.queueSize) {
        throw new GrpcTransportError('RESOURCE_EXHAUSTED', 'Reconnect queue full');
      }
      return new Promise((resolve, reject) => {
        this.callQueue.push({ opName, payload, requestId: reqId, resolve, reject });
      });
    }

    const deadline = Date.now() + this.config.deadlineMs;
    const pending: {
      resolve: (value: ExecuteResponse) => void;
      reject: (reason: any) => void;
      requestId: string;
      deadline: number;
      attempt: number;
      opName: string;
      payload: unknown;
    } = { resolve: () => {}, reject: () => {}, requestId: reqId, deadline, attempt: 0, opName, payload };

    const run = async (): Promise<ExecuteResponse> => {
      pending.attempt++;
      this.pendingCalls.set(reqId, pending);
      this.pendingCountValue++;

      try {
        const request = create(ExecuteRequestSchema, {
          header: this.header(reqId),
          includeBrep: this.config.includeBrep,
          op: { case: opName as ExecuteRequest['op']['case'], value: payload } as ExecuteRequest['op'],
        });

        const response = await this.clientOrThrow.execute(request, {
          headers: { 'x-session-id': this.sessionId },
          responseTimeout: this.config.timeoutMs,
        });

        if (response.result?.case === 'failure') {
          const f = response.result.value;
          const code = ExecutionFailureCode[f.code] ?? 'UNKNOWN';
          throw new GrpcTransportError(code, `Execution failure (${f.code}): ${f.message}`);
        }

        pending.resolve(response);
        return response;
      } catch (err) {
        return this.handleExecuteError(err, pending, run);
      } finally {
        this.pendingCalls.delete(reqId);
        this.pendingCountValue--;
      }
    };

    let rejectFn: (reason: any) => void;
    const promise = new Promise<ExecuteResponse>((resolve, reject) => {
      rejectFn = reject;
      run().then(resolve, reject);
    });

    // Per-operation deadline: Cancel on timeout.
    const deadlineTimer = setTimeout(() => {
      if (!this.client) return;
      this.client.cancel(reqId).catch(() => {});
      rejectFn(new GrpcTransportError('DEADLINE_EXCEEDED', `DEADLINE_EXCEEDED: Operation ${opName} timed out`));
    }, Math.max(0, deadline - Date.now()));

    promise.finally(() => clearTimeout(deadlineTimer));
    return promise;
  }

  private async handleExecuteError(
    err: any,
    pending: { resolve: (v: ExecuteResponse) => void; reject: (r: any) => void; requestId: string; deadline: number; attempt: number; opName: string; payload: unknown },
    run: () => Promise<ExecuteResponse>,
  ): Promise<ExecuteResponse> {
    const code = err instanceof GrpcTransportError ? err.code : 'UNKNOWN';
    const isNetwork = !(err instanceof GrpcTransportError);

    // Token refresh: UNAUTHENTICATED -> get fresh token, reconnect, retry once.
    if (code === 'UNAUTHENTICATED') {
      this.dispatchTokenExpired('token expired');
      if (!this.gettingToken) {
        this.gettingToken = true;
        try {
          await this.refreshToken();
        } finally {
          this.gettingToken = false;
        }
        this.attemptReconnect('token expired');
        if (pending.attempt < 2) {
          return run();
        }
      }
      pending.reject(err);
      throw err;
    }

    // Session/kernel lost (NOT_FOUND after gateway restart): abort, signal rehydrate.
    // Must come BEFORE NON_RETRYABLE_CODES check so rehydrate-needed is dispatched.
    if (code === 'SESSION_NOT_FOUND' || code === 'NOT_FOUND') {
      this.setState(ConnectionState.REHYDRATING, 'session lost');
      this.dispatchRehydrateNeeded('session lost — kernel state cleared');
      this.attemptReconnect('session lost');
      pending.reject(err);
      throw err;
    }

    // Non-retryable: reject immediately.
    if (NON_RETRYABLE_CODES.has(code)) {
      pending.reject(err);
      throw err;
    }

    // Retryable: network errors or retryable gRPC codes. Retry with same requestId (dedupe).
    if (isNetwork || RETRYABLE_CODES.has(code)) {
      if (pending.attempt < this.config.maxRetries) {
        this.setState(ConnectionState.RECONNECTING, code);
        const backoff = this.backoffDelay(pending.attempt);
        await new Promise((r) => setTimeout(r, backoff));
        this.setState(ConnectionState.CONNECTED);
        return run();
      }
      this.setState(ConnectionState.ERROR, 'max retries exceeded');
      pending.reject(err);
      throw err;
    }

    pending.reject(err);
    throw err;
  }

  private backoffDelay(attempt: number): number {
    const base = this.config.baseBackoffMs;
    const cap = this.config.maxBackoffMs;
    const exp = Math.min(base * Math.pow(2, attempt), cap);
    const jitter = exp * this.config.jitter * Math.random();
    return exp + jitter;
  }

  async setToken(token: string): Promise<void> {
    this.token = token;
    if (this.stateValue === ConnectionState.CONNECTED) {
      this.attemptReconnect('token refreshed');
    }
  }

  async refreshToken(): Promise<void> {
    // Subclasses / OpenCascadeService override this to fetch a fresh token.
    throw new GrpcTransportError('UNAUTHENTICATED', 'No token refresh handler configured');
  }

  private async attemptReconnect(reason: string): Promise<void> {
    if (this.reconnectTimer) return; // single-flight
    const gen = ++this.reconnectingGeneration;
    this.setState(ConnectionState.RECONNECTING, reason);

    try {
      const delay = this.backoffDelay(this.reconnectAttempts);
      await new Promise((r) => setTimeout(r, delay));

      // Reuse the same session_id; resume via Subscribe(last_event_id).
      await this.init();
      this.reconnectAttempts = 0;
      this.setState(ConnectionState.CONNECTED, 'reconnected');

      // Replay queued calls in order.
      await this.processQueue();
    } catch (err) {
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.config.maxRetries) {
        this.setState(ConnectionState.ERROR, 'max reconnect attempts');
      } else {
        this.setState(ConnectionState.RECONNECTING, 'reconnect failed, retrying');
        // Schedule next attempt.
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.attemptReconnect('retry');
        }, this.backoffDelay(this.reconnectAttempts));
      }
      throw err;
    } finally {
      if (gen === this.reconnectingGeneration) {
        this.reconnectTimer = null;
      }
    }
  }

  private async processQueue(): Promise<void> {
    const queue = this.callQueue.splice(0, this.callQueue.length);
    for (const item of queue) {
      try {
        const res = await this.execute(item.opName as OpCase, item.payload, item.requestId);
        item.resolve(res);
      } catch (err) {
        item.reject(err);
      }
    }
  }

  private startHeartbeatWatchdog(): void {
    this.stopHeartbeatWatchdog();
    this.lastHeartbeat = Date.now();
    this.heartbeatTimer = setInterval(() => {
      const missed = Date.now() - this.lastHeartbeat;
      const threshold = this.config.heartbeatIntervalMs * this.config.heartbeatMissedThreshold;
      if (missed > threshold && this.stateValue === ConnectionState.CONNECTED) {
        this.stopHeartbeatWatchdog();
        this.attemptReconnect('heartbeat timeout');
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeatWatchdog(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async init(): Promise<void> {
    this.setState(ConnectionState.CONNECTING, 'initializing');
    const transport = createConnectTransport({
      baseUrl: this.config.gatewayUrl,
    });
    this.client = createClient(EngineGatewayService, transport);

    const request = create(OpenSessionRequestSchema, {
      header: create(CommandHeaderSchema, {
        sessionId: this.sessionId,
        requestId: crypto.randomUUID(),
        clientSeq: 0n,
        documentId: '',
      }),
      clientVersion: '1.0.0',
      includeBrep: this.config.includeBrep,
    });

    await this.clientOrThrow.openSession(request);
    this.setState(ConnectionState.CONNECTED);
    this.startHeartbeatWatchdog();
    this.reconnectAttempts = 0;
  }

  get pendingCount(): number {
    return this.pendingCountValue;
  }

  async clearCache(): Promise<{ success: boolean }> {
    await this.execute('clearCache', {});
    return { success: true };
  }

  async releaseShapes(entityIds: string[]): Promise<void> {
    const op = create(ReleaseShapesOpSchema, { entityIds });
    await this.execute('releaseShapes', op);
  }

  async checkValidity(entityId: string): Promise<{ isValid: boolean; faceCount: number; errorMsg: string }> {
    const op = create(CheckValidityOpSchema, { entityId });
    await this.execute('checkValidity', op);
    return { isValid: true, faceCount: 0, errorMsg: '' };
  }

  async exportBRep(entityId: string): Promise<Uint8Array> {
    const op = create(ExportBRepOpSchema, { entityId });
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
    const op = create(ImportBRepOpSchema, { entityId, brepSource: { case: 'brepBytes', value: brepBytes }, deflection: deflection ?? 0.1 });
    await this.execute('importBrep', op);
    return { success: true };
  }

  async extractFaceProfile(
    entityId: string,
    faceIndex: number,
    deflection?: number,
  ): Promise<{ loops: { x: number; y: number; bulge: number }[][] }> {
    const op = create(ExtractFaceProfileOpSchema, { entityId, faceIndex, deflection: deflection ?? 0.1 });
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
    const op = create(CreateBoxOpSchema, { x, y, z, dx, dy, dz, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createBox', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateCylinderOpSchema, { x, y, z, r, h, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createCylinder', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateSphereOpSchema, { x, y, z, r, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createSphere', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateConeOpSchema, { x, y, z, r, h, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createCone', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createFrustum(x: number, y: number, z: number, r1: number, r2: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateFrustumOpSchema, { x, y, z, r1, r2, h, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createFrustum', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateTorusOpSchema, { x, y, z, r1, r2, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createTorus', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createWedge(x1: number, y1: number, z1: number, x2: number, y2: number, height: number, ltx: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateWedgeOpSchema, { x1, y1, z1, x2, y2, height, ltx, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createWedge', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createPyramid(x: number, y: number, z: number, sides: number, radius: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreatePyramidOpSchema, { x, y, z, sides, radius, h, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createPyramid', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createPolyhedron(points: any[], faces: number[][], deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array; nakedLines?: number[][]; isSolid?: boolean }> {
    const op = create(CreatePolyhedronOpSchema, { pointsInline: points, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createPolyhedron', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createConvexHull(points?: { x: number; y: number; z: number }[], shapeIds?: string[], deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array; isSolid?: boolean }> {
    const op = create(CreateConvexHullOpSchema, { pointsInline: points ?? [], shapeIds: shapeIds ?? [], deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createConvexHull', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createExtrude(points: { x: number; y: number; z: number }[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string, vector?: number[]): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateExtrudeOpSchema, { points, height, thickness: thickness ?? 0, deflection: deflection ?? 0.1, isClosed: isClosed ?? false, entityId: entityId ?? '', vector: vector ?? [] });
    const response = await this.execute('createExtrude', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createRevolve(points: { x: number; y: number; z: number }[], axisPoint: { x: number; y: number; z: number }, axisDir: { x: number; y: number; z: number }, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateRevolveOpSchema, { points, axisPoint, axisDir, angle, thickness: thickness ?? 0, deflection: deflection ?? 0.1, isClosed: isClosed ?? false, entityId: entityId ?? '' });
    const response = await this.execute('createRevolve', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createCompound(childrenIds: string[], entityId: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateCompoundOpSchema, { childrenIds, entityId, deflection: deflection ?? 0.1 });
    const response = await this.execute('createCompound', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createSweep(profilePoints: { x: number; y: number; z: number }[], spinePoints: { x: number; y: number; z: number }[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateSweepOpSchema, { profilePoints, spinePoints, isSolid, deflection: deflection ?? 0.1, entityId: entityId ?? '', profileCount: profileCount ?? 0, cornerMode: cornerMode ?? '', isEllipse: isEllipse ?? false });
    const response = await this.execute('createSweep', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createLoft(profiles: { id: string; points: { x: number; y: number; z: number }[]; closed: boolean }[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateLoftOpSchema, { profiles: profiles.map(p => ({ id: p.id, points: p.points, closed: p.closed })), isSolid, isRuled, deflection: deflection ?? 0.1, entityId: entityId ?? '' });
    const response = await this.execute('createLoft', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: { x: number; y: number; z: number }, rotB?: { x: number; y: number; z: number }, centerA?: { x: number; y: number; z: number }, centerB?: { x: number; y: number; z: number }): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(CreateBooleanOpSchema, { operation, idA, idB, entityId, deflection: deflection ?? 0.1, rotA: rotA ?? { x: 0, y: 0, z: 0 }, rotB: rotB ?? { x: 0, y: 0, z: 0 }, centerA: centerA ?? { x: 0, y: 0, z: 0 }, centerB: centerB ?? { x: 0, y: 0, z: 0 } });
    const response = await this.execute('createBoolean', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async multMatrixShape(entityId: string, m: number[], targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(MultMatrixShapeOpSchema, { entityId, m, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1 });
    const response = await this.execute('multMatrixShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async transformShape(entityId: string, dx: number, dy: number, dz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(TransformShapeOpSchema, { entityId, dx, dy, dz, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1 });
    const response = await this.execute('transformShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async rotateShape(entityId: string, rx: number, ry: number, rz: number, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(RotateShapeOpSchema, { entityId, rx, ry, rz, cx, cy, cz, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1 });
    const response = await this.execute('rotateShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async mirrorShape(entityId: string, p1: { x: number; y: number; z?: number } | undefined, p2: { x: number; y: number; z?: number } | undefined, targetEntityId?: string, deflection?: number, normal?: { x: number; y: number; z?: number }): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const toPt = (p: { x: number; y: number; z?: number }) => ({ x: p.x, y: p.y, z: p.z ?? 0 });
    const op = create(MirrorShapeOpSchema, { entityId, p1: p1 ? toPt(p1) : { x: 0, y: 0, z: 0 }, p2: p2 ? toPt(p2) : { x: 0, y: 0, z: 0 }, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1, normal: normal ? toPt(normal) : { x: 0, y: 0, z: 0 } });
    const response = await this.execute('mirrorShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async scaleShape(entityId: string, factor: number | undefined, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number, factorX?: number, factorY?: number, factorZ?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(ScaleShapeOpSchema, { entityId, factor: factor ?? 1, cx, cy, cz, targetEntityId: targetEntityId ?? '', deflection: deflection ?? 0.1, factorX: factorX ?? 1, factorY: factorY ?? 1, factorZ: factorZ ?? 1 });
    const response = await this.execute('scaleShape', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async filletSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(FilletSolidOpSchema, { entityId, edgeIndex, radius, deflection: deflection ?? 0.1, visualP1: visualP1 ?? { x: 0, y: 0 }, visualP2: visualP2 ?? { x: 0, y: 0 } });
    const response = await this.execute('filletSolid', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async chamferSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(ChamferSolidOpSchema, { entityId, edgeIndex, radius, deflection: deflection ?? 0.1, visualP1: visualP1 ?? { x: 0, y: 0 }, visualP2: visualP2 ?? { x: 0, y: 0 } });
    const response = await this.execute('chamferSolid', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async filletSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(FilletSolidFaceOpSchema, { entityId, faceIndex, radius });
    const response = await this.execute('filletSolidFace', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async chamferSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(ChamferSolidFaceOpSchema, { entityId, faceIndex, radius });
    const response = await this.execute('chamferSolidFace', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async makeThickSolid(entityId: string, faceIndices: number[], thickness: number, removeFaces?: boolean): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(MakeThickSolidOpSchema, { entityId, faceIndices, thickness, removeFaces: removeFaces ?? false });
    const response = await this.execute('makeThickSolid', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async draftSolidFaces(entityId: string, faceIndices: number[], neutralFaceIndex: number, angleRad: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }> {
    const op = create(DraftSolidFacesOpSchema, { entityId, faceIndices, neutralFaceIndex, angleRad });
    const response = await this.execute('draftSolidFaces', op);
    return this.meshDataToResult(response.mesh, response.brepRef);
  }

  async closeSession(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.closeSession(create(CloseSessionRequestSchema, { header: this.header() }));
    } finally {
      this.client = null;
      this.subscribed = false;
    }
  }

  /**
   * Restore (rehydrate) one or more entities on the kernel via batched Restore RPC.
   * Called by OpenCascadeService/document when the gateway signals REHYDRATING / NOT_FOUND.
   * Each item carries a BrepReference (BlobRef id) for the entity's B-rep snapshot.
   */
  async restore(items: Array<{
    entityId: string;
    brepRefId: string;
  }>): Promise<string[]> {
    if (!this.client) {
      throw new GrpcTransportError('FAILED_PRECONDITION', 'Transport not initialized. Call init() first.');
    }

    const restoreItems = items.map(item =>
      create(RestoreItemSchema, {
        entityId: item.entityId,
        source: { case: 'brepRef', value: create(BrepReferenceSchema, { format: BrepReference_Format.BINARY, sha256: item.brepRefId }) },
      }),
    );

    const request = create(RestoreRequestSchema, {
      header: create(CommandHeaderSchema, {
        sessionId: this.sessionId,
        requestId: crypto.randomUUID(),
        clientSeq: ++this.clientSeq,
        documentId: '',
      }),
      items: restoreItems,
    });

    const response = await this.client.restore(request, {
      headers: { 'x-session-id': this.sessionId },
      responseTimeout: this.config.timeoutMs,
    });

    return response.restoredEntityIds ?? [];
  }

  async subscribe(onEvent: (event: SessionEvent) => void, lastEventId: bigint = 0n): Promise<void> {
    if (!this.client) {
      throw new GrpcTransportError('FAILED_PRECONDITION', 'Transport not initialized');
    }
    this.eventListeners.add(onEvent);

    if (this.subscribed) return;
    this.subscribed = true;

    const request = create(SubscribeRequestSchema, { header: this.header(), lastEventId });

    try {
      const stream = this.client.subscribe(request, {
        headers: { 'x-session-id': this.sessionId },
        responseTimeout: 0,
      });

      for await (const event of stream) {
        this.lastHeartbeat = Date.now();

        // Gateway signals kernel loss — consumer must call Restore.
        if (event.case === 'needsRehydrate') {
          this.dispatchRehydrateNeeded('gateway reported needs_rehydrate');
        }

        this.eventListeners.forEach((listener) => listener(event));
      }
    } catch (err) {
      this.subscribed = false;
      this.stopHeartbeatWatchdog();
      this.attemptReconnect('subscribe stream ended');
      throw err;
    }
  }

  unsubscribe(onEvent: (event: SessionEvent) => void): void {
    this.eventListeners.delete(onEvent);
  }
}



