import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BenchmarkAdapter } from '../../src/core/benchmark/benchmark-adapter';
import { KernelAdapter, Script, KernelResult } from '../../src/core/harness/kernel-adapter';

class MockKernelAdapter implements KernelAdapter {
  readonly name = 'mock';
  initCalls = 0;
  cleanupCalls = 0;
  executeCalls: Script[] = [];
  stepResults: KernelResult[] = [];
  shouldThrow = false;
  throwError = new Error('mock kernel failure');

  async init(): Promise<void> {
    this.initCalls++;
  }

  async execute(script: Script): Promise<KernelResult[]> {
    this.executeCalls.push(script);
    if (this.shouldThrow) {
      throw this.throwError;
    }
    return this.stepResults;
  }

  async cleanup(): Promise<void> {
    this.cleanupCalls++;
  }
}

function makeScript(steps: { name: string; parameters: Record<string, unknown> }[]): Script {
  return {
    name: 'test-script',
    tolerances: { volume: 1e-4, surfaceArea: 1e-4, bbox: 1e-3, counts: 0 },
    steps,
  };
}

function makeKernelResult(success: boolean, stepName: string, mesh?: boolean): KernelResult {
  return {
    stepIndex: 0,
    stepName,
    metrics: {},
    success,
    mesh: mesh ? { positions: new Float32Array(0), indices: new Uint32Array(0) } : undefined,
  };
}

describe('BenchmarkAdapter', () => {
  let mockAdapter: MockKernelAdapter;
  let benchAdapter: BenchmarkAdapter;

  beforeEach(() => {
    mockAdapter = new MockKernelAdapter();
    benchAdapter = new BenchmarkAdapter(mockAdapter, 1, 'mock');
  });

  afterEach(async () => {
    await benchAdapter.cleanup();
  });

  it('propagates init and cleanup to the underlying adapter', async () => {
    await benchAdapter.init();
    expect(mockAdapter.initCalls).toBe(1);

    const script = makeScript([{ name: 'create_box', parameters: {} }]);
    mockAdapter.stepResults = [makeKernelResult(true, 'create_box')];
    await benchAdapter.execute(script);

    await benchAdapter.cleanup();
    expect(mockAdapter.cleanupCalls).toBe(1);
  });

  it('records per-step timing and memory', async () => {
    mockAdapter.stepResults = [makeKernelResult(true, 'create_box')];
    const script = makeScript([{ name: 'create_box', parameters: {} }]);

    const result = await benchAdapter.execute(script);

    expect(result.scriptName).toBe('test-script');
    expect(result.threadCount).toBe(1);
    expect(result.kernelName).toBe('mock');
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].stepName).toBe('create_box');
    expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(result.steps[0].memoryBeforeKb).toBeGreaterThanOrEqual(0);
    expect(result.steps[0].memoryAfterKb).toBeGreaterThanOrEqual(0);
    expect(result.steps[0].success).toBe(true);
    expect(result.peakMemoryDeltaKb).toBeGreaterThanOrEqual(0);
  });

  it('propagates threadCount to results', async () => {
    mockAdapter.stepResults = [makeKernelResult(true, 'create_box')];
    const bench = new BenchmarkAdapter(mockAdapter, 4, 'mock');
    const script = makeScript([{ name: 'create_box', parameters: {} }]);

    const result = await bench.execute(script);
    expect(result.threadCount).toBe(4);
    await bench.cleanup();
  });

  it('uses adapter.name when kernelName not provided', async () => {
    mockAdapter.stepResults = [makeKernelResult(true, 'create_box')];
    const bench = new BenchmarkAdapter(mockAdapter, 1);
    const script = makeScript([{ name: 'create_box', parameters: {} }]);

    const result = await bench.execute(script);
    expect(result.kernelName).toBe('mock');
    await bench.cleanup();
  });

  it('records failed step with error message', async () => {
    mockAdapter.stepResults = [makeKernelResult(false, 'create_box')];
    mockAdapter.stepResults[0].error = 'Kernel failure: invalid params';
    const script = makeScript([{ name: 'create_box', parameters: {} }]);

    const result = await benchAdapter.execute(script);
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toBe('Kernel failure: invalid params');
  });

  it('continues executing after adapter throws', async () => {
    mockAdapter.shouldThrow = true;
    const script = makeScript([{ name: 'create_box', parameters: {} }]);

    const result = await benchAdapter.execute(script);
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toBe('mock kernel failure');
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('records tessellation time when mesh is present', async () => {
    mockAdapter.stepResults = [makeKernelResult(true, 'create_box', true)];
    const script = makeScript([{ name: 'create_box', parameters: {} }]);

    const result = await benchAdapter.execute(script);
    expect(result.tessellationTimeMs).toBeDefined();
    expect(result.tessellationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('does not record tessellation time when no mesh', async () => {
    mockAdapter.stepResults = [makeKernelResult(true, 'create_box')];
    const script = makeScript([{ name: 'create_box', parameters: {} }]);

    const result = await benchAdapter.execute(script);
    expect(result.tessellationTimeMs).toBeUndefined();
  });

  it('passes a single-step script to the adapter', async () => {
    mockAdapter.stepResults = [makeKernelResult(true, 'create_box')];
    const script = makeScript([
      { name: 'create_box', parameters: { dx: 10 } },
      { name: 'create_cylinder', parameters: { radius: 5 } },
    ]);

    await benchAdapter.execute(script);
    expect(mockAdapter.executeCalls).toHaveLength(2);
    expect(mockAdapter.executeCalls[0].steps).toHaveLength(1);
    expect(mockAdapter.executeCalls[0].steps[0].name).toBe('create_box');
    expect(mockAdapter.executeCalls[1].steps[0].name).toBe('create_cylinder');
  });
});
