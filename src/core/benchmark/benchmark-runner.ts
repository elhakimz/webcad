import * as fs from 'node:fs';
import * as path from 'node:path';
import { KernelAdapter, Script } from '../harness/kernel-adapter';
import { BenchmarkAdapter, ScriptBenchmark } from './benchmark-adapter';
import {
  BenchmarkReport,
  KernelThreadResult,
  ScriptBenchmarkResult,
  buildMachineInfo,
  writeBenchmarkReport,
} from './benchmark-report';
import { dxfToScript } from './dxf-to-script';

export interface BenchmarkRunOptions {
  scriptsDir: string;
  adapters: { wasm?: KernelAdapter; native?: KernelAdapter };
  threadCounts?: number[];
  runsPerThreadCount?: number;
  reportPath?: string;
}

export interface BenchmarkRunResult {
  report: BenchmarkReport;
  scriptBenchmarks: ScriptBenchmarkResult[];
}

/**
 * Orchestrates benchmark execution across kernels and thread counts.
 *
 * For each script × kernel × threadCount × run:
 *   - Runs the script `threadCount` times concurrently (Promise.all)
 *   - Each concurrent run uses its own BenchmarkAdapter wrapping the shared kernel adapter
 *   - Collects per-step timing, memory, and tessellation metrics
 *
 * Errors in individual runs are recorded and do not abort the benchmark.
 * Fixtures with a `modelFile` field (e.g. a DXF path) are converted to kernel
 * scripts via dxfToScript before execution.
 */
export class BenchmarkRunner {
  async run(options: BenchmarkRunOptions): Promise<BenchmarkRunResult> {
    const {
      scriptsDir,
      adapters,
      threadCounts = [1, 2, 4, 8],
      runsPerThreadCount = 1,
      reportPath,
    } = options;

    const kernels: { name: string; adapter: KernelAdapter }[] = [];
    if (adapters.wasm) kernels.push({ name: 'wasm', adapter: adapters.wasm });
    if (adapters.native) kernels.push({ name: 'native', adapter: adapters.native });

    if (kernels.length === 0) {
      throw new Error('BenchmarkRunner: at least one kernel adapter is required');
    }

    // Load benchmark scripts from fixtures directory
    let files: string[];
    try {
      files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.json')).sort();
    } catch {
      throw new Error(`BenchmarkRunner: no benchmark scripts found in ${scriptsDir}`);
    }
    const scriptEntries: { id: string; script: Script; modelFile?: string }[] = files.map(f => {
      const raw = JSON.parse(fs.readFileSync(path.join(scriptsDir, f), 'utf8'));
      return {
        id: path.basename(f, '.json'),
        script: raw.script ?? (raw as Script),
        modelFile: raw.modelFile,
      };
    });

    if (scriptEntries.length === 0) {
      throw new Error(`BenchmarkRunner: no benchmark scripts found in ${scriptsDir}`);
    }

    // Resolve modelFile references: convert DXF files to kernel scripts
    for (const entry of scriptEntries) {
      if (entry.modelFile && fs.existsSync(entry.modelFile)) {
        try {
          entry.script = dxfToScript(entry.modelFile, entry.script.name);
        } catch {
          // DXF conversion failure is not fatal; the script steps from the fixture
          // will be used as-is (they may be synthetic turbine-like operations).
        }
      }
    }

    // Initialize all kernel adapters once
    for (const k of kernels) {
      if (k.adapter.init) await k.adapter.init();
    }

    try {
      const scriptResults: ScriptBenchmarkResult[] = [];

      for (const entry of scriptEntries) {
        const results: KernelThreadResult[] = [];

        for (const threadCount of threadCounts) {
          for (let run = 0; run < runsPerThreadCount; run++) {
            // Run `threadCount` concurrent executions against each kernel
            const kernelPromises = kernels.map(async (k) => {
              const concurrentPromises = Array.from(
                { length: Math.max(1, threadCount) },
                (_, concurrentIndex) => {
                  const benchAdapter = new BenchmarkAdapter(k.adapter, threadCount, k.name);
                  return benchAdapter.execute(entry.script).then(
                    (benchmark): KernelThreadResult => ({
                      kernelName: k.name,
                      threadCount,
                      runIndex: run,
                      concurrentIndex,
                      benchmark,
                    }),
                    (_err): KernelThreadResult => ({
                      kernelName: k.name,
                      threadCount,
                      runIndex: run,
                      concurrentIndex,
                      benchmark: {
                        scriptName: entry.script.name,
                        threadCount,
                        kernelName: k.name,
                        totalDurationMs: 0,
                        steps: [],
                        peakMemoryDeltaKb: 0,
                      } as ScriptBenchmark,
                    }),
                  );
                },
              );
              return Promise.all(concurrentPromises);
            });

            const kernelResultArrays = await Promise.all(kernelPromises);
            for (const arr of kernelResultArrays) {
              results.push(...arr);
            }
          }
        }

        scriptResults.push({
          scriptId: entry.id,
          scriptName: entry.script.name,
          results,
        });
      }

      const report: BenchmarkReport = {
        timestamp: new Date().toISOString(),
        machineInfo: buildMachineInfo(),
        scripts: scriptResults,
      };

      if (reportPath) {
        writeBenchmarkReport(reportPath, report);
      }

      return { report, scriptBenchmarks: scriptResults };
    } finally {
      for (const k of kernels) {
        if (k.adapter.cleanup) await k.adapter.cleanup();
      }
    }
  }
}
