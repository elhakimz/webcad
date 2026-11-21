import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { StdioKernelClient } from '../../src/core/gateway/stdio-kernel-client.js';

const mockStdoutHandlers = new Map<string, Set<(chunk: Buffer) => void>>();
const exitHandlers: Array<(code: number | null, signal: string | null) => void> = [];

const mockProcess = {
  pid: 1234,
  stdout: {
    on: vi.fn((event: string, handler: (chunk: Buffer) => void) => {
      if (!mockStdoutHandlers.has(event)) {
        mockStdoutHandlers.set(event, new Set());
      }
      mockStdoutHandlers.get(event)!.add(handler);
    }),
  },
  stdin: {
    write: vi.fn(),
    end: vi.fn(),
  },
  stderr: { on: vi.fn() },
  on: vi.fn((_event: string, handler: () => void) => {
    exitHandlers.push(handler as (code: number | null, signal: string | null) => void);
  }),
  kill: vi.fn(),
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => mockProcess),
}));

function triggerStdoutData(chunk: Buffer): void {
  const handlers = mockStdoutHandlers.get('data');
  if (handlers) {
    for (const handler of handlers) {
      handler(chunk);
    }
  }
}

function triggerExit(code: number | null, signal: string | null): void {
  for (const handler of exitHandlers) {
    handler(code, signal);
  }
}

function makeLengthPrefixedBody(body: unknown): Buffer {
  const json = JSON.stringify(body);
  const buf = Buffer.from(json, 'utf-8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

describe('StdioKernelClient', () => {
  let client: StdioKernelClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStdoutHandlers.clear();
    exitHandlers.length = 0;
    client = new StdioKernelClient('stdio:./build/kernel_worker');
  });

  afterEach(() => {
    client.close();
  });

  it('spawns kernel with stdio transport and no socket args', () => {
    const spawnMock = vi.mocked(spawn);
    expect(spawnMock).toHaveBeenCalledWith('./build/kernel_worker', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });

  it('execute sends length-prefixed request and receives response', async () => {
    const response = { status: 'completed', resultRef: 'ref-1' };
    const executePromise = client.execute({ op: 'createBox' });

    triggerStdoutData(makeLengthPrefixedBody(response));

    const result = await executePromise;
    expect(result).toEqual(response);
  });

  it('health sends health request and receives response', async () => {
    const response = { status: 'SERVING' };
    const healthPromise = client.health({ service: 'KernelService' });
    triggerStdoutData(makeLengthPrefixedBody(response));
    const result = await healthPromise;
    expect(result).toEqual(response);
  });

  it('close ends stdin and kills process', () => {
    client.close();
    expect(mockProcess.stdin.end).toHaveBeenCalled();
    expect(mockProcess.kill).toHaveBeenCalled();
  });

  it('executeWithProgress calls progress callback', async () => {
    const progress = { progress: 50 };
    const finalResult = { status: 'completed' };
    const progressCalls: unknown[] = [];
    const promise = client.executeWithProgress(
      { op: 'createBox' },
      (p: unknown) => progressCalls.push(p),
    );
    triggerStdoutData(makeLengthPrefixedBody(progress));
    triggerStdoutData(makeLengthPrefixedBody(finalResult));
    const result = await promise;
    expect(result).toEqual(finalResult);
    expect(progressCalls).toEqual([progress]);
  });

  it('streamResult calls chunk callback', async () => {
    const chunk1 = { chunk: { data: [1, 2, 3] } };
    const chunk2 = { chunk: { data: [4, 5, 6] } };
    const finalResult = { status: 'completed' };
    const chunkCalls: unknown[] = [];
    const promise = client.streamResult(
      { resultId: 'r1' },
      (c: unknown) => chunkCalls.push(c),
    );
    triggerStdoutData(makeLengthPrefixedBody(chunk1));
    triggerStdoutData(makeLengthPrefixedBody(chunk2));
    triggerStdoutData(makeLengthPrefixedBody(finalResult));
    const result = await promise;
    expect(result).toEqual(finalResult);
    expect(chunkCalls).toEqual([chunk1, chunk2]);
  });

  it('rejects when process exits during pending request', async () => {
    const promise = client.execute({ op: 'createBox' });
    triggerExit(1, null);
    await expect(promise).rejects.toThrow(/exited/);
  });
});
