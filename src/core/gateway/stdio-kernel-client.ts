import { spawn, ChildProcess } from 'node:child_process';
import { KernelClient } from './kernel-client.js';

const LENGTH_PREFIX_SIZE = 4;

export class StdioKernelClient implements KernelClient {
  private process: ChildProcess;
  private stdin: NodeJS.WriteStream;
  private stdout: NodeJS.ReadStream;
  private pendingResolve: ((value: unknown) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private buffer = Buffer.alloc(0);
  private closed = false;
  private progressCallback: ((progress: unknown) => void) | null = null;
  private chunkCallback: ((chunk: unknown) => void) | null = null;

  constructor(kernelAddress: string) {
    const program = kernelAddress.replace(/^stdio:/, '');
    this.process = spawn(program, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.stdin = this.process.stdin as NodeJS.WriteStream;
    this.stdout = this.process.stdout as NodeJS.ReadStream;

    this.stdout.on('data', (chunk: Buffer) => this.handleStdoutData(chunk));
    this.stdout.on('error', (err: Error) => this.failPending(err));
    this.process.on('exit', () => this.failPending(new Error('Kernel process exited')));
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[Kernel PID ${this.process.pid}] ${data}`);
    });
  }

  private handleStdoutData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= LENGTH_PREFIX_SIZE) {
      const bodyLength = this.buffer.readUInt32BE(0);
      if (this.buffer.length < LENGTH_PREFIX_SIZE + bodyLength) break;
      const body = this.buffer.subarray(LENGTH_PREFIX_SIZE, LENGTH_PREFIX_SIZE + bodyLength);
      this.buffer = this.buffer.subarray(LENGTH_PREFIX_SIZE + bodyLength);
      const message = JSON.parse(body.toString('utf-8'));
      if (message && typeof message === 'object' && 'progress' in message && this.progressCallback) {
        this.progressCallback(message);
      } else if (message && typeof message === 'object' && 'chunk' in message && this.chunkCallback) {
        this.chunkCallback(message);
      } else {
        this.resolvePending(message);
      }
    }
  }

  private resolvePending(value: unknown): void {
    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingReject = null;
      resolve(value);
    }
  }

  private failPending(err: Error): void {
    if (this.pendingReject) {
      const reject = this.pendingReject;
      this.pendingResolve = null;
      this.pendingReject = null;
      reject(err);
    }
  }

  private sendRequest(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.pendingResolve || this.pendingReject) {
        reject(new Error('StdioKernelClient: request already in flight'));
        return;
      }
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      const body = Buffer.from(JSON.stringify(request));
      const lengthPrefix = Buffer.alloc(LENGTH_PREFIX_SIZE);
      lengthPrefix.writeUInt32BE(body.length, 0);
      this.stdin.write(Buffer.concat([lengthPrefix, body]));
    });
  }

  execute(request: unknown): Promise<unknown> {
    return this.sendRequest(request);
  }

  executeWithProgress(request: unknown, onProgress: (progress: unknown) => void): Promise<unknown> {
    this.progressCallback = onProgress;
    return this.sendRequest(request).finally(() => {
      this.progressCallback = null;
    });
  }

  restore(request: unknown): Promise<unknown> {
    return this.sendRequest(request);
  }

  putBlob(chunks: AsyncIterable<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          for await (const chunk of chunks) {
            const body = Buffer.from(JSON.stringify(chunk));
            const lengthPrefix = Buffer.alloc(LENGTH_PREFIX_SIZE);
            lengthPrefix.writeUInt32BE(body.length, 0);
            this.stdin.write(Buffer.concat([lengthPrefix, body]));
          }
          this.stdin.end();
          resolve(undefined);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });
  }

  streamResult(request: unknown, onChunk: (chunk: unknown) => void): Promise<unknown> {
    this.chunkCallback = onChunk;
    return this.sendRequest(request).finally(() => {
      this.chunkCallback = null;
    });
  }

  health(request: unknown): Promise<unknown> {
    return this.sendRequest(request);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.stdin.end(); } catch { /* ignore */ }
    try { this.process.kill(); } catch { /* ignore */ }
    if (this.pendingReject) {
      this.pendingReject(new Error('StdioKernelClient closed'));
      this.pendingResolve = null;
      this.pendingReject = null;
    }
  }
}
