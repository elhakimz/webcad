import { createServer } from 'node:http';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { EngineGatewayService, KernelService } from '../../generated/proto/webcad/engine/v1/engine_connect.js';
import { sessionManager } from './session-manager.js';
import { dedupeCache } from './dedupe.js';
import { ordererRegistry } from './ordering.js';
import type { DescService, DescMethod } from '@bufbuild/protobuf';
import { CommandRegistry } from './command-registry.js';
import { BoxCommand } from './commands/box.js';

export const commandRegistry = new CommandRegistry();
commandRegistry.register(BoxCommand);

/**
 * Convert a v1.x connect-es generated service object to a DescService-compatible
 * shape for @connectrpc/connect v2.x router.service().
 * The v1.x codegen produces `methods` as a keyed object without `localName`;
 * DescService requires `methods` as an array with `localName` on each entry.
 */
function toDescService(svc: {
  typeName: string;
  methods: Record<string, { name: string; I: unknown; O: unknown; kind: unknown }>;
}): DescService {
  const entries = Object.entries(svc.methods);

  const methodsArray: DescMethod[] = entries.map(([localName, m]) => ({
    kind: "rpc",
    name: m.name,
    localName,
    parent: undefined as unknown as DescService,
    methodKind: (m.kind as any) === 1 ? "unary" : "server_streaming",
    input: m.I as any,
    output: m.O as any,
    idempotency: 0,
    deprecated: false,
    proto: undefined as any,
    toString: () => localName,
  })) as DescMethod[];

  const service: DescService = {
    kind: "service",
    typeName: svc.typeName,
    name: svc.typeName.split(".").pop() ?? svc.typeName,
    file: undefined as any,
    methods: methodsArray,
    method: Object.fromEntries(methodsArray.map(m => [m.localName, m])),
    deprecated: false,
    proto: undefined as any,
    toString: () => svc.typeName,
  };

  // parent is readonly on DescMethod, so set it via Object.defineProperty
  for (const m of methodsArray) {
    Object.defineProperty(m, 'parent', { value: service, configurable: true });
  }

  return service;
}

const EngineGatewayServiceDesc = toDescService(EngineGatewayService as any);
const KernelServiceDesc = toDescService(KernelService as any);

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
          throw new Error("UNIMPLEMENTED: kernel Execute");
        },
        executeWithProgress: async function* (req: any) {
          throw new Error("UNIMPLEMENTED: kernel ExecuteWithProgress");
        },
        restore: async (req: any) => {
          throw new Error("UNIMPLEMENTED: kernel Restore");
        },
        putBlob: async function (req: any) {
          throw new Error("UNIMPLEMENTED: kernel PutBlob");
        },
        streamResult: async function* (req: any) {
          throw new Error("UNIMPLEMENTED: kernel StreamResult");
        },
        health: async (req: any) => ({ status: "SERVING" }),
      } as any);
    },
  });

  const server = createServer(handler);

  const port = config.port ?? 8080;
  server.listen(port, () => {
    console.log(`[Gateway] Listening on http://localhost:${port}`);
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
    const session = sessionManager.createSession(
      (req as any)?.clientVersion ?? '',
      req.header?.sessionId
    );

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

    const existing = dedupeCache.lookup(requestId);
    if (existing && existing.status === 'completed') {
      return { requestId, resultRef: existing.resultRef, status: 'completed' };
    }

    const isNew = dedupeCache.markPending(requestId, sessionId);
    if (!isNew) {
      await new Promise((r) => setTimeout(r, 100));
      const completed = dedupeCache.lookup(requestId);
      if (completed?.status === 'completed') {
        return { requestId, resultRef: completed.resultRef, status: 'completed' };
      }
      throw new Error('ABORTED: duplicate request_id while in-flight');
    }

    const orderer = ordererRegistry.getOrCreate(sessionId);
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
      dedupeCache.fail(requestId, 0, err instanceof Error ? err.message : 'ordering error');
      throw err;
    }

    try {
      const result = await this.executeOnKernel(sessionId, req);
      orderer.advance();
      dedupeCache.complete(requestId, result.resultRef);
      return result;
    } catch (err) {
      orderer.advance();
      dedupeCache.fail(requestId, 0, err instanceof Error ? err.message : 'execution failed');
      throw err;
    }
  },

  async Restore(req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
    const sessionId = req.header?.sessionId;
    const requestId = req.header?.requestId;
    const clientSeq = req.header?.clientSeq ?? 0;

    if (!sessionId || !requestId) {
      throw new Error('INVALID_ARGUMENT: missing session_id or request_id');
    }

    const existing = dedupeCache.lookup(requestId);
    if (existing && existing.status === 'completed') {
      return { requestId, resultRef: existing.resultRef, status: 'restored' };
    }

    const isNew = dedupeCache.markPending(requestId, sessionId);
    if (!isNew) {
      await new Promise((r) => setTimeout(r, 100));
      const completed = dedupeCache.lookup(requestId);
      if (completed?.status === 'completed') {
        return { requestId, resultRef: completed.resultRef, status: 'restored' };
      }
      throw new Error('ABORTED: duplicate request_id while in-flight');
    }

    const orderer = ordererRegistry.getOrCreate(sessionId);
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
      dedupeCache.fail(requestId, 0, err instanceof Error ? err.message : 'ordering error');
      throw err;
    }

    try {
      const result = await this.restoreOnKernel(sessionId, req);
      orderer.advance();
      dedupeCache.complete(requestId, result.resultRef);
      return result;
    } catch (err) {
      orderer.advance();
      dedupeCache.fail(requestId, 0, err instanceof Error ? err.message : 'restore failed');
      throw err;
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
    const orderer = ordererRegistry.getOrCreate(sessionId);
    orderer.cancelQueued();
    return { success: true };
  },

  async CloseSession(req: ExecuteRequestInput) {
    const sessionId = req.header?.sessionId;
    if (sessionId) {
      ordererRegistry.remove(sessionId);
      sessionManager.closeSession(sessionId);
    }
    return { success: true };
  },

  async *StreamResult(req: ExecuteRequestInput) {
    const resultId = (req as any)?.resultId;
    yield { chunkIndex: 0, data: new Uint8Array(), resultId };
  },

  async executeOnKernel(sessionId: string, req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
    return {
      requestId: req.header?.requestId,
      status: 'completed',
    };
  },

  async restoreOnKernel(sessionId: string, req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
    return {
      requestId: req.header?.requestId,
      status: 'restored',
    };
  },
};
