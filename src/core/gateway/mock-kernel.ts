import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/webcad/engine/v1/engine.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const grpcObject = (grpc as unknown as { loadPackageDefinition: (def: any) => any }).loadPackageDefinition(packageDefinition);
const engineProto = grpcObject.webcad.engine.v1;

const KERNEL_ADDRESS = process.env.KERNEL_ADDRESS || 'unix:/tmp/webcad-kernel.sock';

type GrpcCall = { request?: unknown; write?: (msg: unknown) => void; end?: () => void; on?: (event: string, handler: (chunk: unknown) => void) => void; send?: (msg: unknown) => void };
type GrpcCallback = (err: Error | null, response?: unknown) => void;

function startMockKernel() {
  const server = new grpc.Server();

  server.addService(engineProto.KernelService.service, {
    Execute: (call: GrpcCall, callback: GrpcCallback) => {
      const request = (call.request as { header?: { requestId?: string } }) ?? {};
      console.log(`[MockKernel] Execute: ${request.header?.requestId || 'unknown'}`);
      callback(null, {
        requestId: request.header?.requestId,
        status: 'completed',
      });
    },

    ExecuteWithProgress: (call: GrpcCall) => {
      const request = (call.request as { header?: { requestId?: string } }) ?? {};
      console.log(`[MockKernel] ExecuteWithProgress: ${request.header?.requestId || 'unknown'}`);

      // Send progress messages
      call.write?.({ progress: 25, message: 'Starting operation' });
      call.write?.({ progress: 50, message: 'Computing geometry' });
      call.write?.({ progress: 75, message: 'Tessellating' });

      // Final result
      call.write?.({ requestId: request.header?.requestId, status: 'completed' });
      call.end?.();
    },

    Restore: (call: GrpcCall, callback: GrpcCallback) => {
      const request = (call.request as { header?: { requestId?: string } }) ?? {};
      console.log(`[MockKernel] Restore: ${request.header?.requestId || 'unknown'}`);
      callback(null, {
        requestId: request.header?.requestId,
        status: 'restored',
      });
    },

    PutBlob: (call: GrpcCall) => {
      call.on?.('data', (_chunk: unknown) => {
        console.log(`[MockKernel] PutBlob chunk received`);
      });
      call.on?.('end', () => {
        call.send?.({ status: 'uploaded' });
      });
    },

    StreamResult: (call: GrpcCall) => {
      const request = (call.request as { resultId?: string }) ?? {};
      console.log(`[MockKernel] StreamResult: ${request.resultId || 'unknown'}`);
      call.write?.({ chunkIndex: 0, data: Buffer.alloc(0), resultId: request.resultId });
      call.end?.();
    },

    Health: (_call: unknown, callback: GrpcCallback) => {
      callback(null, { status: 'SERVING' });
    },
  });

  server.bindAsync(KERNEL_ADDRESS, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('[MockKernel] Failed to bind:', err);
      process.exit(1);
    }
    console.log(`[MockKernel] Listening on ${KERNEL_ADDRESS}`);
    server.start();
  });

  process.on('SIGTERM', () => {
    console.log('[MockKernel] Shutting down...');
    server.forceShutdown();
    process.exit(0);
  });
}

startMockKernel();
