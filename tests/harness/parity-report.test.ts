import { describe, it, expect } from 'vitest';
import { writeParityReport } from '../../src/core/harness/parity-report';
import { ParityStepResult } from '../../src/core/harness/comparator';
import { KernelResult } from '../../src/core/harness/kernel-adapter';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('ParityReport', () => {
  const tmpDir = path.join(process.cwd(), 'tests/harness/.tmp-report');

  it('writes a JSON report with correct structure', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const reportPath = path.join(tmpDir, 'report.json');

    const stepResult: ParityStepResult = {
      stepIndex: 0,
      stepName: 'create_box',
      passed: true,
      diffs: {},
      errors: [],
    };

    const wasmResult: KernelResult = { stepIndex: 0, stepName: 'create_box', metrics: { volume: 1000 }, success: true };
    const nativeResult: KernelResult = { stepIndex: 0, stepName: 'create_box', metrics: { volume: 1000 }, success: true };

    writeParityReport(reportPath, {
      scriptName: 'test_group',
      kernelPair: ['wasm', 'native'],
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [stepResult],
      wasmResults: [wasmResult],
      nativeResults: [nativeResult],
      knownDifferences: [],
    });

    const content = fs.readFileSync(reportPath, 'utf-8');
    const report = JSON.parse(content);
    expect(report.scriptName).toBe('test_group');
    expect(report.kernelPair).toEqual(['wasm', 'native']);
    expect(report.summary.totalSteps).toBe(1);
    expect(report.summary.passedSteps).toBe(1);
    expect(report.summary.failedSteps).toBe(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
