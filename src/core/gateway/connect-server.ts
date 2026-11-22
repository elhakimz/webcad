import { createServer } from 'node:http';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { EngineGatewayService, KernelService } from '../../generated/proto/webcad/engine/v1/engine_pb.js';
import { sessionManager } from './session-manager.js';
import { dedupeCache } from './dedupe.js';
import { ordererRegistry } from './ordering.js';
import { CommandRegistry } from './command-registry.js';
import { kernelSupervisor } from './kernel-supervisor.js';
import { authInterceptor } from './auth-interceptor.js';
import { authenticator } from './auth.js';
import { logger } from './logger.js';
import { sessionsCreated, sessionsActive, opsExecuted, opLatencyMs } from './metrics.js';
import {
  BoxCommand, CylinderCommand, SphereCommand, ConeCommand, FrustumCommand,
  TorusCommand, WedgeCommand, PyramidCommand, PolyhedronCommand, ConvexHullCommand,
  ExtrudeCommand, RevolveCommand, CompoundCommand, SweepCommand, LoftCommand,
  BooleanCommand, StepExportCommand, MultMatrixCommand, TransformCommand,
  RotateCommand, MirrorCommand, ScaleCommand, FilletCommand, ChamferCommand,
  FilletFaceCommand, ChamferFaceCommand, ThickSolidCommand, DraftFacesCommand,
  InitCommand, ClearCacheCommand, ReleaseShapesCommand, CheckValidityCommand,
  ExportBRepCommand, ImportBRepCommand, ExtractFaceProfileCommand,
} from './commands/index.js';

export const commandRegistry = new CommandRegistry();
commandRegistry.register(BoxCommand);
commandRegistry.register(CylinderCommand);
commandRegistry.register(SphereCommand);
commandRegistry.register(ConeCommand);
commandRegistry.register(FrustumCommand);
commandRegistry.register(TorusCommand);
commandRegistry.register(WedgeCommand);
commandRegistry.register(PyramidCommand);
commandRegistry.register(PolyhedronCommand);
commandRegistry.register(ConvexHullCommand);
commandRegistry.register(ExtrudeCommand);
commandRegistry.register(RevolveCommand);
commandRegistry.register(CompoundCommand);
commandRegistry.register(SweepCommand);
commandRegistry.register(LoftCommand);
commandRegistry.register(BooleanCommand);
commandRegistry.register(StepExportCommand);
commandRegistry.register(MultMatrixCommand);
commandRegistry.register(TransformCommand);
commandRegistry.register(RotateCommand);
commandRegistry.register(MirrorCommand);
commandRegistry.register(ScaleCommand);
commandRegistry.register(FilletCommand);
commandRegistry.register(ChamferCommand);
commandRegistry.register(FilletFaceCommand);
commandRegistry.register(ChamferFaceCommand);
commandRegistry.register(ThickSolidCommand);
commandRegistry.register(DraftFacesCommand);
commandRegistry.register(InitCommand);
commandRegistry.register(ClearCacheCommand);
commandRegistry.register(ReleaseShapesCommand);
commandRegistry.register(CheckValidityCommand);
commandRegistry.register(ExportBRepCommand);
commandRegistry.register(ImportBRepCommand);
commandRegistry.register(ExtractFaceProfileCommand);

// WC-EC-32: Per-session concurrent operation tracking (quota)
const concurrentOps = new Map<string, number>();

// WC-EC-32: Frame limit constants (mirrors ServerLimits returned by OpenSession)
const MAX_INLINE_REQUEST_BYTES = 4 * 1024 * 1024;   // 4 MiB
const MAX_INLINE_RESPONSE_BYTES = 4 * 1024 * 1024;  // 4 MiB
const MAX_CONCURRENT_OPS_PER_SESSION = 16;

const EngineGatewayServiceDesc = EngineGatewayService;
const KernelServiceDesc = KernelService;

export interface GatewayConfig {
  port?: number;
}

export interface GatewayServiceImpl {
  OpenSession: (req: any) => any;
  Execute: (req: any) => any;
  Restore: (req: any) => any;
  Subscribe: (req: any) => AsyncGenerator<any>;
  UploadChunk: (req: any) => any;
  Cancel: (req: any) => any;
  CloseSession: (req: any) => any;
  StreamResult: (req: any) => AsyncGenerator<any>;
  executeOnKernel: (sessionId: string, req: any) => Promise<any>;
  restoreOnKernel: (sessionId: string, req: any) => Promise<any>;
}

export function createGatewayServer(impl: GatewayServiceImpl, config: GatewayConfig = {}) {
  const handler = connectNodeAdapter({
    interceptors: [authInterceptor],
    routes(router) {
      router.service(EngineGatewayServiceDesc, {
        openSession: async (req: any) => impl.OpenSession(req),
        execute: async (req: any) => impl.Execute(req),
        restore: async (req: any) => impl.Restore(req),
        subscribe: async function* (req: any) {
          yield* impl.Subscribe(req);
        },
        uploadChunk: async (req: any) => impl.UploadChunk(req),
        cancel: async (req: any) => impl.Cancel(req),
        closeSession: async (req: any) => impl.CloseSession(req),
        streamResult: async function* (req: any) {
          yield* impl.StreamResult(req);
        },
      } as any);
      router.service(KernelServiceDesc, {
        execute: async (req: any) => {
          const sessionId = req?.header?.sessionId;
          if (!sessionId) {
            throw new Error('INVALID_ARGUMENT: missing session_id');
          }
          const client = await kernelSupervisor.getKernelForSession(sessionId);
          return client.execute(req);
        },
        executeWithProgress: async function* (req: any) {
          const sessionId = req?.header?.sessionId;
          if (!sessionId) {
            throw new Error('INVALID_ARGUMENT: missing session_id');
          }
          const client = await kernelSupervisor.getKernelForSession(sessionId);
          const progressMessages: any[] = [];
          const result = await client.executeWithProgress(req, (progress: any) => {
            progressMessages.push(progress);
          });
          for (const p of progressMessages) {
            yield { request_id: req?.header?.requestId, percent: 0, message: p?.message ?? '' };
          }
          yield result;
        },
        restore: async (req: any) => {
          const sessionId = req?.header?.sessionId;
          if (!sessionId) {
            throw new Error('INVALID_ARGUMENT: missing session_id');
          }
          const client = await kernelSupervisor.getKernelForSession(sessionId);
          return client.restore(req);
        },
        putBlob: async function (req: any) {
          // PutBlob is client-streaming: chunks arrive via req stream
          // Collect chunks and forward to kernel for the associated session
          const chunks: any[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const uploadId = chunks[0]?.upload_id ?? chunks[0]?.uploadId ?? '';
          const totalSize = chunks.reduce((sum, c) => sum + (c?.data?.length ?? 0), 0);
          return { upload_id: uploadId, total_size: totalSize };
        },
        streamResult: async function* (req: any) {
          // StreamResult is bidi streaming: consume requests, stream chunks back
          for await (const chunk of req) {
            yield { chunkIndex: 0, data: new Uint8Array(), resultId: chunk?.resultId ?? '' };
          }
        },
        health: async (req: any) => ({ status: "SERVING" }),
      } as any);
    },
  });

  const server = createServer(handler);

  const port = config.port ?? 8080;
  server.listen(port, () => {
    logger.info(`Gateway listening on http://localhost:${port}`);
  });

  return server;
}

export interface ExecuteRequestInput {
  header?: {
    sessionId?: string;
    requestId?: string;
    clientSeq?: number;
  };
  [key: string]: unknown;
}

export interface ExecuteResponseOutput {
  requestId?: string;
  resultRef?: string;
  status?: string;
  failure?: {
    code?: number;
    message?: string;
  };
}

export const defaultGatewayImpl: GatewayServiceImpl = {
  async OpenSession(req: ExecuteRequestInput) {
    let ownerId: string | undefined;
    try {
      const authHeader = (req as any)?.header?.authorization ?? '';
      const payload = authenticator.authenticate(authHeader);
      ownerId = payload.sub;
    } catch {
      // No valid JWT - ownerId stays undefined (anonymous session)
    }

    const session = sessionManager.createSession(
      (req as any)?.clientVersion ?? '',
      req.header?.sessionId,
      ownerId
    );

    sessionsCreated.inc({ status: 'ok' });
    sessionsActive.set({}, 1);

    return {
      protocolVersion: '1.0.0',
      minimumClientVersion: '1.0.0',
      serverLimits: {
        maxInlineRequestBytes: 4 * 1024 * 1024,
        maxInlineResponseBytes: 4 * 1024 * 1024,
        maxStreamChunkBytes: 1 * 1024 * 1024,
        maxBlobSizeBytes: 16 * 1024 * 1024,
        maxSessionBlobBytes: 64 * 1024 * 1024,
      },
      heartbeatInterval: 15,
      kernelVersion: 'mock-1.0.0',
      occtVersion: 'mock-OCCT-7.7',
      supportedOperations: [
        'init', 'clearCache', 'releaseShapes', 'checkValidity', 'exportBRep', 'importBRep',
        'extractFaceProfile', 'createBox', 'createCylinder', 'createFrustum', 'createSphere',
        'createCone', 'createTorus', 'createWedge', 'createPyramid', 'createPolyhedron',
        'createConvexHull', 'createExtrude', 'createRevolve', 'createCompound', 'createSweep',
        'createLoft', 'createBoolean', 'multMatrixShape', 'transformShape', 'rotateShape',
        'mirrorShape', 'scaleShape', 'filletSolid', 'chamferSolid', 'filletSolidFace',
        'chamferSolidFace', 'makeThickSolid', 'draftSolidFaces',
      ],
    };
  },

  async Execute(req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
    const sessionId = req.header?.sessionId;
    const requestId = req.header?.requestId;
    const clientSeq = req.header?.clientSeq ?? 0;

    if (!sessionId || !requestId) {
      throw new Error('INVALID_ARGUMENT: missing session_id or request_id');
    }

    // --- WC-EC-32: Input validation ---
    const op = (req as any)?.op;
    const opName = op?.case as string | undefined;
    const params = op?.value as Record<string, unknown> | undefined;
    if (opName && params) {
      const validation = commandRegistry.validate(opName, params);
      if (!validation.valid) {
        throw new Error(`INVALID_ARGUMENT: ${validation.errors.join('; ')}`);
      }
    }

    // --- WC-EC-32: Frame limits (request size) ---
    const requestSize = Buffer.byteLength(JSON.stringify(req));
    if (requestSize > MAX_INLINE_REQUEST_BYTES) {
      throw new Error(`RESOURCE_EXHAUSTED: request size ${requestSize} exceeds max inline size ${MAX_INLINE_REQUEST_BYTES}`);
    }

    // --- WC-EC-32: Quota (concurrent ops per session) ---
    const currentOps = concurrentOps.get(sessionId) ?? 0;
    if (currentOps >= MAX_CONCURRENT_OPS_PER_SESSION) {
      throw new Error(`RESOURCE_EXHAUSTED: session ${sessionId} has ${currentOps} concurrent ops (max ${MAX_CONCURRENT_OPS_PER_SESSION})`);
    }
    concurrentOps.set(sessionId, currentOps + 1);

    const session = sessionManager.getSession(sessionId);
    const principal = session?.ownerId ?? sessionId;

    const existing = dedupeCache.lookup(principal, sessionId, requestId);
    if (existing && existing.status === 'completed') {
      return { requestId, resultRef: existing.resultRef, status: 'completed' };
    }

    const isNew = dedupeCache.markPending(principal, sessionId, requestId);
    if (!isNew) {
      await new Promise((r) => setTimeout(r, 100));
      const completed = dedupeCache.lookup(principal, sessionId, requestId);
      if (completed?.status === 'completed') {
        return { requestId, resultRef: completed.resultRef, status: 'completed' };
      }
      throw new Error('ABORTED: duplicate request_id while in-flight');
    }

    const orderer = ordererRegistry.getOrCreate(principal, sessionId);
    try {
      await orderer.submit({
        clientSeq,
        requestId,
        sessionId,
        opName: 'execute',
        payload: req,
        resolve: () => {},
        reject: () => {},
        receivedAt: Date.now(),
      });
    } catch (err) {
      concurrentOps.set(sessionId, Math.max(0, (concurrentOps.get(sessionId) ?? 1) - 1));
      dedupeCache.fail(principal, sessionId, requestId, 0, err instanceof Error ? err.message : 'ordering error');
      throw err;
    }

    try {
      const start = Date.now();
      const result = await this.executeOnKernel(sessionId, req);
      const latencyMs = Date.now() - start;
      orderer.advance();
      dedupeCache.complete(principal, sessionId, requestId, result.resultRef);

      opsExecuted.inc({ op: opName ?? 'unknown', status: 'ok' });
      opLatencyMs.observe({ op: opName ?? 'unknown' }, latencyMs);

      logger.debug('Execute completed', {
        sessionId,
        requestId,
        op: opName,
        latencyMs,
      });

      // --- WC-EC-32: Frame limits (response size) ---
      const responseSize = Buffer.byteLength(JSON.stringify(result));
      if (responseSize > MAX_INLINE_RESPONSE_BYTES) {
        throw new Error(`RESOURCE_EXHAUSTED: response size ${responseSize} exceeds max inline size ${MAX_INLINE_RESPONSE_BYTES}`);
      }

      return result;
    } catch (err) {
      orderer.advance();
      dedupeCache.fail(principal, sessionId, requestId, 0, err instanceof Error ? err.message : 'execution failed');

      opsExecuted.inc({ op: opName ?? 'unknown', status: 'error' });

      logger.warn('Execute failed', {
        sessionId,
        requestId,
        op: opName,
        err: err instanceof Error ? err : undefined,
      });
      throw err;
    } finally {
      concurrentOps.set(sessionId, Math.max(0, (concurrentOps.get(sessionId) ?? 1) - 1));
    }
  },

  async Restore(req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
    const sessionId = req.header?.sessionId;
    const requestId = req.header?.requestId;
    const clientSeq = req.header?.clientSeq ?? 0;

    if (!sessionId || !requestId) {
      throw new Error('INVALID_ARGUMENT: missing session_id or request_id');
    }

    // --- WC-EC-32: Input validation ---
    const op = (req as any)?.op;
    const opName = op?.case as string | undefined;
    const params = op?.value as Record<string, unknown> | undefined;
    if (opName && params) {
      const validation = commandRegistry.validate(opName, params);
      if (!validation.valid) {
        throw new Error(`INVALID_ARGUMENT: ${validation.errors.join('; ')}`);
      }
    }

    // --- WC-EC-32: Frame limits (request size) ---
    const requestSize = Buffer.byteLength(JSON.stringify(req));
    if (requestSize > MAX_INLINE_REQUEST_BYTES) {
      throw new Error(`RESOURCE_EXHAUSTED: request size ${requestSize} exceeds max inline size ${MAX_INLINE_REQUEST_BYTES}`);
    }

    // --- WC-EC-32: Quota (concurrent ops per session) ---
    const currentOps = concurrentOps.get(sessionId) ?? 0;
    if (currentOps >= MAX_CONCURRENT_OPS_PER_SESSION) {
      throw new Error(`RESOURCE_EXHAUSTED: session ${sessionId} has ${currentOps} concurrent ops (max ${MAX_CONCURRENT_OPS_PER_SESSION})`);
    }
    concurrentOps.set(sessionId, currentOps + 1);

    const session = sessionManager.getSession(sessionId);
    const principal = session?.ownerId ?? sessionId;

    const existing = dedupeCache.lookup(principal, sessionId, requestId);
    if (existing && existing.status === 'completed') {
      return { requestId, resultRef: existing.resultRef, status: 'restored' };
    }

    const isNew = dedupeCache.markPending(principal, sessionId, requestId);
    if (!isNew) {
      await new Promise((r) => setTimeout(r, 100));
      const completed = dedupeCache.lookup(principal, sessionId, requestId);
      if (completed?.status === 'completed') {
        return { requestId, resultRef: completed.resultRef, status: 'restored' };
      }
      throw new Error('ABORTED: duplicate request_id while in-flight');
    }

    const orderer = ordererRegistry.getOrCreate(principal, sessionId);
    try {
      await orderer.submit({
        clientSeq,
        requestId,
        sessionId,
        opName: 'restore',
        payload: req,
        resolve: () => {},
        reject: () => {},
        receivedAt: Date.now(),
      });
    } catch (err) {
      concurrentOps.set(sessionId, Math.max(0, (concurrentOps.get(sessionId) ?? 1) - 1));
      dedupeCache.fail(principal, sessionId, requestId, 0, err instanceof Error ? err.message : 'ordering error');
      throw err;
    }

    try {
      const start = Date.now();
      const result = await this.restoreOnKernel(sessionId, req);
      const latencyMs = Date.now() - start;
      orderer.advance();
      dedupeCache.complete(principal, sessionId, requestId, result.resultRef);

      opsExecuted.inc({ op: opName ?? 'unknown', status: 'ok' });
      opLatencyMs.observe({ op: opName ?? 'unknown' }, latencyMs);

      // --- WC-EC-32: Frame limits (response size) ---
      const responseSize = Buffer.byteLength(JSON.stringify(result));
      if (responseSize > MAX_INLINE_RESPONSE_BYTES) {
        throw new Error(`RESOURCE_EXHAUSTED: response size ${responseSize} exceeds max inline size ${MAX_INLINE_RESPONSE_BYTES}`);
      }

      return result;
    } catch (err) {
      orderer.advance();
      dedupeCache.fail(principal, sessionId, requestId, 0, err instanceof Error ? err.message : 'restore failed');

      opsExecuted.inc({ op: opName ?? 'unknown', status: 'error' });

      logger.warn('Restore failed', {
        sessionId,
        requestId,
        op: opName,
        err: err instanceof Error ? err : undefined,
      });
      throw err;
    } finally {
      concurrentOps.set(sessionId, Math.max(0, (concurrentOps.get(sessionId) ?? 1) - 1));
    }
  },

  async *Subscribe(req: ExecuteRequestInput) {
    const sessionId = req.header?.sessionId;
    const lastEventId = (req as any)?.lastEventId ?? 0;

    if (!sessionId) {
      throw new Error('INVALID_ARGUMENT: missing session_id');
    }

    const events = sessionManager.getEventsAfter(sessionId, lastEventId);
    for (const entry of events) {
      yield entry.event;
    }

    while (true) {
      await new Promise((r) => setTimeout(r, 15_000));
      yield {
        eventId: sessionManager.getLastEventId(sessionId),
        type: 'heartbeat',
        kernelStatus: 'CONNECTED',
        timestamp: Date.now(),
      };
    }
  },

  async UploadChunk(req: ExecuteRequestInput) {
    return { uploadId: (req as any)?.uploadId, receivedBytes: (req as any)?.data?.length ?? 0 };
  },

  async Cancel(req: ExecuteRequestInput) {
    const sessionId = req.header?.sessionId;
    if (!sessionId) {
      throw new Error('INVALID_ARGUMENT: missing session_id');
    }
    const session = sessionManager.getSession(sessionId);
    const principal = session?.ownerId ?? sessionId;
    const orderer = ordererRegistry.getOrCreate(principal, sessionId);
    orderer.cancelQueued();
    return { success: true };
  },

  async CloseSession(req: ExecuteRequestInput) {
    const sessionId = req.header?.sessionId;
    if (sessionId) {
      const session = sessionManager.getSession(sessionId);
      const principal = session?.ownerId ?? sessionId;
      ordererRegistry.remove(principal, sessionId);
      sessionManager.closeSession(sessionId);
    }
    return { success: true };
  },

  async *StreamResult(req: ExecuteRequestInput) {
    const resultId = (req as any)?.resultId;
    yield { chunkIndex: 0, data: new Uint8Array(), resultId };
  },

  async executeOnKernel(sessionId: string, req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
    const client = await kernelSupervisor.getKernelForSession(sessionId);
    return client.execute(req) as Promise<ExecuteResponseOutput>;
  },

  async restoreOnKernel(sessionId: string, req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
    const client = await kernelSupervisor.getKernelForSession(sessionId);
    return client.restore(req) as Promise<ExecuteResponseOutput>;
  },
};
