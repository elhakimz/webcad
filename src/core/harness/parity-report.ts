import * as fs from 'node:fs';
import * as path from 'node:path';
import { ParityStepResult } from './comparator';
import { KernelResult, ScriptTolerances } from './kernel-adapter';

export interface ParityReportInput {
  scriptName: string;
  kernelPair: string[];
  tolerances: ScriptTolerances;
  steps: ParityStepResult[];
  wasmResults: KernelResult[];
  nativeResults: KernelResult[];
  knownDifferences: string[];
}

export interface ParityReportOutput {
  scriptName: string;
  kernelPair: string[];
  tolerances: ScriptTolerances;
  steps: ParityStepResult[];
  summary: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    erroredSteps: number;
  };
  knownDifferences: string[];
}

export function writeParityReport(filePath: string, input: ParityReportInput): ParityReportOutput {
  const passedSteps = input.steps.filter(s => s.passed).length;
  const failedSteps = input.steps.filter(s => !s.passed && s.errors.length === 0).length;
  const erroredSteps = input.steps.filter(s => !s.passed && s.errors.length > 0).length;

  const output: ParityReportOutput = {
    scriptName: input.scriptName,
    kernelPair: input.kernelPair,
    tolerances: input.tolerances,
    steps: input.steps,
    summary: {
      totalSteps: input.steps.length,
      passedSteps,
      failedSteps,
      erroredSteps,
    },
    knownDifferences: input.knownDifferences,
  };

  const dir = path.dirname(filePath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2));

  return output;
}
