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
type KernelServiceClass = typeof engineProto.KernelService;

export interface KernelClient {
  execute(request: unknown): Promise<unknown>;
  executeWithProgress(request: unknown, onProgress: (progress: unknown) => void): Promise<unknown>;
  restore(request: unknown): Promise<unknown>;
  putBlob(chunks: AsyncIterable<unknown>): Promise<unknown>;
  streamResult(request: unknown, onChunk: (chunk: unknown) => void): Promise<unknown>;
  health(request: unknown): Promise<unknown>;
  close(): void;
}

export class GrpcKernelClient implements KernelClient {
  private client: InstanceType<KernelServiceClass>;

  constructor(kernelAddress: string) {
    this.client = new engineProto.KernelService(kernelAddress, grpc.credentials.createInsecure());
  }

  execute(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.client.Execute(request, (err: grpc.ServiceError | null, response: unknown) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  executeWithProgress(request: unknown, onProgress: (progress: unknown) => void): Promise<unknown> {
    const call = this.client.ExecuteWithProgress(request);
    let finalResult: unknown = null;

    call.on('data', (chunk: unknown) => {
      if (chunk && typeof chunk === 'object' && 'progress' in chunk) {
        onProgress(chunk);
      } else {
        finalResult = chunk;
      }
    });

    return new Promise((resolve, reject) => {
      call.on('end', () => resolve(finalResult));
      call.on('error', (err: grpc.ServiceError) => reject(err));
    });
  }

  restore(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.client.Restore(request, (err: grpc.ServiceError | null, response: unknown) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  putBlob(chunks: AsyncIterable<unknown>): Promise<unknown> {
    const call = this.client.PutBlob((err: grpc.ServiceError | null, response: unknown) => {
      if (err) throw err;
    });

    return new Promise((resolve, reject) => {
      (async () => {
        try {
          for await (const chunk of chunks) {
            call.write(chunk);
          }
          call.end();
        } catch (err) {
          call.end();
          reject(err);
        }
      })();

      call.on('end', () => resolve(undefined));
      call.on('error', (err: grpc.ServiceError) => reject(err));
    });
  }

  streamResult(request: unknown, onChunk: (chunk: unknown) => void): Promise<unknown> {
    const call = this.client.StreamResult(request);

    return new Promise((resolve, reject) => {
      call.on('data', (chunk: unknown) => onChunk(chunk));
      call.on('end', () => resolve(undefined));
      call.on('error', (err: grpc.ServiceError) => reject(err));
    });
  }

  health(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.client.Health(request, (err: grpc.ServiceError | null, response: unknown) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  close(): void {
    this.client.close();
  }
}
