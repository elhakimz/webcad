import { KernelAdapter, Script, KernelResult, ScriptTolerances } from './kernel-adapter';
import { compareStepResults, ParityStepResult } from './comparator';
import { writeParityReport, ParityReportInput, ParityReportOutput } from './parity-report';

export interface ParityHarnessOptions {
  script: Script;
  wasmAdapter: KernelAdapter;
  nativeAdapter: KernelAdapter;
  reportPath?: string;
  knownDifferences?: string[];
}

export interface ParityHarnessResult {
  report: ParityReportOutput;
  wasmResults: KernelResult[];
  nativeResults: KernelResult[];
  stepComparisons: ParityStepResult[];
}

export class ParityHarness {
  async run(options: ParityHarnessOptions): Promise<ParityHarnessResult> {
    const { script, wasmAdapter, nativeAdapter, reportPath, knownDifferences = [] } = options;

    if (wasmAdapter.init) await wasmAdapter.init();
    if (nativeAdapter.init) await nativeAdapter.init();

    try {
      const wasmResults = await wasmAdapter.execute(script);
      const nativeResults = await nativeAdapter.execute(script);

      const stepComparisons: ParityStepResult[] = [];
      for (let i = 0; i < script.steps.length; i++) {
        const step = script.steps[i];
        const comparison = compareStepResults(
          i,
          step.name,
          wasmResults[i] || { stepIndex: i, stepName: step.name, metrics: {}, success: false, error: 'Missing wasm result' },
          nativeResults[i] || { stepIndex: i, stepName: step.name, metrics: {}, success: false, error: 'Missing native result' },
          script.tolerances,
        );
        stepComparisons.push(comparison);
      }

      const reportInput: ParityReportInput = {
        scriptName: script.name,
        kernelPair: [wasmAdapter.name, nativeAdapter.name],
        tolerances: script.tolerances,
        steps: stepComparisons,
        wasmResults,
        nativeResults,
        knownDifferences,
      };

      let report: ParityReportOutput;
      if (reportPath) {
        report = writeParityReport(reportPath, reportInput);
      } else {
        report = writeParityReport(`reports/parity-${script.name}.json`, reportInput);
      }

      return {
        report,
        wasmResults,
        nativeResults,
        stepComparisons,
      };
    } finally {
      if (wasmAdapter.cleanup) await wasmAdapter.cleanup();
      if (nativeAdapter.cleanup) await nativeAdapter.cleanup();
    }
  }
}
