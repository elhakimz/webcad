import { describe, it, expect } from 'vitest';
import { BenchmarkRunner } from '../../src/core/benchmark/benchmark-runner';
import { KernelAdapter, Script } from '../../src/core/harness/kernel-adapter';

class MockKernelAdapter implements KernelAdapter {
  readonly name = 'mock';
  initCalls = 0;
  cleanupCalls = 0;
  executeCalls = 0;
  stepResults: { success: boolean; stepName: string }[] = [];

  async init(): Promise<void> {
    this.initCalls++;
  }

  async execute(_script: Script): Promise<{ stepIndex: number; stepName: string; metrics: Record<string, unknown>; success: boolean; error?: string }[]> {
    this.executeCalls++;
    return this.stepResults.map((r, i) => ({
      stepIndex: i,
      stepName: r.stepName,
      metrics: {},
      success: r.success,
      error: r.success ? undefined : 'mock error',
    }));
  }

  async cleanup(): Promise<void> {
    this.cleanupCalls++;
  }
}

describe('BenchmarkRunner', () => {
  it('requires at least one kernel adapter', async () => {
    const runner = new BenchmarkRunner();
    await expect(
      runner.run({ scriptsDir: 'tests/fixtures/benchmarks', adapters: {} }),
    ).rejects.toThrow('at least one kernel adapter is required');
  });

  it('throws when no benchmark scripts found', async () => {
    const runner = new BenchmarkRunner();
    await expect(
      runner.run({
        scriptsDir: 'tests/fixtures/benchmarks/nonexistent',
        adapters: { wasm: new MockKernelAdapter() },
      }),
    ).rejects.toThrow('no benchmark scripts found');
  });

  it('runs benchmarks across thread counts and kernels', async () => {
    const wasmAdapter = new MockKernelAdapter();
    wasmAdapter.stepResults = [{ success: true, stepName: 'create_box' }];
    const nativeAdapter = new MockKernelAdapter();
    nativeAdapter.stepResults = [{ success: true, stepName: 'create_box' }];

    const runner = new BenchmarkRunner();
    const result = await runner.run({
      scriptsDir: 'tests/fixtures/benchmarks',
      adapters: { wasm: wasmAdapter, native: nativeAdapter },
      threadCounts: [1, 2],
      runsPerThreadCount: 1,
    });

    expect(result.report.timestamp).toBeDefined();
    expect(result.report.machineInfo.cpus).toBeGreaterThan(0);
    expect(result.report.scripts).toHaveLength(3); // turbine-01, composite_box, composite_cylinder

    for (const scriptResult of result.report.scripts) {
      const kernelThreadCombos = new Set(
        scriptResult.results.map(r => `${r.kernelName}:${r.threadCount}`),
      );
      expect(kernelThreadCombos.has('wasm:1')).toBe(true);
      expect(kernelThreadCombos.has('wasm:2')).toBe(true);
      expect(kernelThreadCombos.has('native:1')).toBe(true);
      expect(kernelThreadCombos.has('native:2')).toBe(true);

      for (const r of scriptResult.results) {
        expect(r.benchmark.scriptName).toBeDefined();
        expect(r.benchmark.totalDurationMs).toBeGreaterThanOrEqual(0);
        expect(r.benchmark.peakMemoryDeltaKb).toBeGreaterThanOrEqual(0);
      }
    }

    expect(wasmAdapter.initCalls).toBe(1);
    expect(wasmAdapter.cleanupCalls).toBe(1);
    expect(nativeAdapter.initCalls).toBe(1);
    expect(nativeAdapter.cleanupCalls).toBe(1);
  });

  it('continues on individual run errors', async () => {
    const wasmAdapter = new MockKernelAdapter();
    wasmAdapter.stepResults = [{ success: false, stepName: 'create_box' }];
    const nativeAdapter = new MockKernelAdapter();
    nativeAdapter.stepResults = [{ success: true, stepName: 'create_box' }];

    const runner = new BenchmarkRunner();
    const result = await runner.run({
      scriptsDir: 'tests/fixtures/benchmarks',
      adapters: { wasm: wasmAdapter, native: nativeAdapter },
      threadCounts: [1],
      runsPerThreadCount: 1,
    });

    for (const scriptResult of result.report.scripts) {
      expect(scriptResult.results.length).toBeGreaterThan(0);
      const nativeSuccess = scriptResult.results.some(
        r => r.kernelName === 'native' && r.benchmark.steps.every(s => s.success),
      );
      expect(nativeSuccess).toBe(true);
    }
  });

  it('writes report to file when reportPath is provided', async () => {
    const wasmAdapter = new MockKernelAdapter();
    wasmAdapter.stepResults = [{ success: true, stepName: 'create_box' }];
    const runner = new BenchmarkRunner();

    const reportPath = 'tests/benchmark/reports/test-report.json';
    await runner.run({
      scriptsDir: 'tests/fixtures/benchmarks',
      adapters: { wasm: wasmAdapter },
      threadCounts: [1],
      runsPerThreadCount: 1,
      reportPath,
    });

    const fs = await import('node:fs');
    expect(fs.existsSync(reportPath)).toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    const report = JSON.parse(content);
    expect(report.timestamp).toBeDefined();
    expect(report.scripts).toBeDefined();

    fs.unlinkSync(reportPath);
  });
});
