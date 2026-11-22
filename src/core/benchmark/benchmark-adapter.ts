import { KernelAdapter, Script, KernelResult } from '../harness/kernel-adapter';

export interface StepBenchmark {
  stepIndex: number;
  stepName: string;
  durationMs: number;
  memoryBeforeKb: number;
  memoryAfterKb: number;
  memoryDeltaKb: number;
  success: boolean;
  error?: string;
}

export interface ScriptBenchmark {
  scriptName: string;
  threadCount: number;
  kernelName: string;
  totalDurationMs: number;
  steps: StepBenchmark[];
  peakMemoryDeltaKb: number;
  tessellationTimeMs?: number;
}

/**
 * Wraps a KernelAdapter and instruments each step with timing and memory.
 * Executes one step at a time through the underlying adapter to get
 * per-step duration and RSS delta measurements.
 */
export class BenchmarkAdapter {
  private readonly kernelName: string;
  private readonly threadCount: number;

  constructor(
    private readonly adapter: KernelAdapter,
    threadCount: number,
    kernelName?: string,
  ) {
    this.threadCount = threadCount;
    this.kernelName = kernelName ?? adapter.name;
  }

  async init(): Promise<void> {
    if (this.adapter.init) await this.adapter.init();
  }

  async execute(script: Script): Promise<ScriptBenchmark> {
    const totalStart = performance.now();
    const initialMemoryKb = this.getMemoryKb();
    let peakMemoryKb = initialMemoryKb;
    const steps: StepBenchmark[] = [];
    let tessellationTimeMs = 0;

    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      const stepStart = performance.now();
      const memBefore = this.getMemoryKb();

      let kernelResult: KernelResult;
      try {
        const singleStepScript: Script = {
          name: `${script.name}:step-${i}`,
          tolerances: script.tolerances,
          steps: [step],
        };
        const results = await this.adapter.execute(singleStepScript);
        kernelResult = results[0] ?? {
          stepIndex: i,
          stepName: step.name,
          metrics: {},
          success: false,
          error: 'No result returned',
        };
      } catch (err) {
        kernelResult = {
          stepIndex: i,
          stepName: step.name,
          metrics: {},
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const stepEnd = performance.now();
      const memAfter = this.getMemoryKb();
      if (memAfter > peakMemoryKb) peakMemoryKb = memAfter;

      if (kernelResult.mesh) {
        tessellationTimeMs += stepEnd - stepStart;
      }

      steps.push({
        stepIndex: i,
        stepName: step.name,
        durationMs: stepEnd - stepStart,
        memoryBeforeKb: memBefore,
        memoryAfterKb: memAfter,
        memoryDeltaKb: memAfter - memBefore,
        success: kernelResult.success,
        error: kernelResult.error,
      });
    }

    const totalEnd = performance.now();

    return {
      scriptName: script.name,
      threadCount: this.threadCount,
      kernelName: this.kernelName,
      totalDurationMs: totalEnd - totalStart,
      steps,
      peakMemoryDeltaKb: Math.max(0, peakMemoryKb - initialMemoryKb),
      tessellationTimeMs: tessellationTimeMs > 0 ? tessellationTimeMs : undefined,
    };
  }

  async cleanup(): Promise<void> {
    if (this.adapter.cleanup) await this.adapter.cleanup();
  }

  private getMemoryKb(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().rss / 1024;
    }
    return 0;
  }
}
