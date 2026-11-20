import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParityHarness } from '../../src/core/harness/parity-harness';
import { KernelAdapter, Script, KernelResult } from '../../src/core/harness/kernel-adapter';
import { writeParityReport } from '../../src/core/harness/parity-report';

vi.mock('../../src/core/harness/parity-report', () => ({
  writeParityReport: vi.fn(),
}));

const mockWasAdapterExecute = vi.fn();
const mockNatAdapterExecute = vi.fn();

const mockWasmAdapter: KernelAdapter = {
  name: 'wasm',
  init: vi.fn().mockResolvedValue(undefined),
  execute: mockWasAdapterExecute,
  cleanup: vi.fn().mockResolvedValue(undefined),
} as unknown as KernelAdapter;

const mockNativeAdapter: KernelAdapter = {
  name: 'native',
  init: vi.fn().mockResolvedValue(undefined),
  execute: mockNatAdapterExecute,
  cleanup: vi.fn().mockResolvedValue(undefined),
} as unknown as KernelAdapter;

const mockWriteReport = vi.mocked(writeParityReport);

describe('ParityHarness', () => {
  const baseScript: Script = {
    name: 'test_script',
    tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
    steps: [
      { name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } },
    ],
  };

  const wasmResult: KernelResult = {
    stepIndex: 0,
    stepName: 'create_box',
    shapeId: 'wasm_box_1',
    metrics: { volume: 1000, surfaceArea: 600, valid: true },
    success: true,
  };

  const nativeResult: KernelResult = {
    stepIndex: 0,
    stepName: 'create_box',
    shapeId: 'native_box_1',
    metrics: { volume: 1000, surfaceArea: 600, valid: true },
    success: true,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockWasAdapterExecute.mockResolvedValue([wasmResult]);
    mockNatAdapterExecute.mockResolvedValue([nativeResult]);
    mockWriteReport.mockReturnValue({
      scriptName: 'test_script',
      kernelPair: ['wasm', 'native'],
      tolerances: baseScript.tolerances,
      steps: [],
      summary: { totalSteps: 1, passedSteps: 1, failedSteps: 0, erroredSteps: 0 },
      knownDifferences: [],
    } as any);
  });

  it('runs both adapters and produces a report', async () => {
    const harness = new ParityHarness();
    const result = await harness.run({
      script: baseScript,
      wasmAdapter: mockWasmAdapter,
      nativeAdapter: mockNativeAdapter,
      reportPath: '/tmp/test-parity-report.json',
    });

    expect(mockWasmAdapter.init).toHaveBeenCalled();
    expect(mockNativeAdapter.init).toHaveBeenCalled();
    expect(mockWasAdapterExecute).toHaveBeenCalledWith(baseScript);
    expect(mockNatAdapterExecute).toHaveBeenCalledWith(baseScript);
    expect(mockWasmAdapter.cleanup).toHaveBeenCalled();
    expect(mockNativeAdapter.cleanup).toHaveBeenCalled();
    expect(mockWriteReport).toHaveBeenCalled();
    expect(result.wasmResults).toEqual([wasmResult]);
    expect(result.nativeResults).toEqual([nativeResult]);
    expect(result.stepComparisons).toHaveLength(1);
    expect(result.stepComparisons[0].passed).toBe(true);
    expect(result.report.summary.passedSteps).toBe(1);
  });

  it('cleans up adapters even when execution throws', async () => {
    mockWasAdapterExecute.mockRejectedValue(new Error('Wasm adapter failed'));

    const harness = new ParityHarness();
    await expect(harness.run({
      script: baseScript,
      wasmAdapter: mockWasmAdapter,
      nativeAdapter: mockNativeAdapter,
    })).rejects.toThrow('Wasm adapter failed');

    expect(mockWasmAdapter.cleanup).toHaveBeenCalled();
    expect(mockNativeAdapter.cleanup).toHaveBeenCalled();
  });

  it('uses default report path when none provided', async () => {
    const harness = new ParityHarness();
    await harness.run({
      script: baseScript,
      wasmAdapter: mockWasmAdapter,
      nativeAdapter: mockNativeAdapter,
    });

    const reportCall = mockWriteReport.mock.calls[0];
    expect(reportCall[0]).toContain('parity-test_script.json');
  });
});
