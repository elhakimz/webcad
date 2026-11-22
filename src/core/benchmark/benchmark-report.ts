import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ScriptBenchmark } from './benchmark-adapter';

export interface KernelThreadResult {
  kernelName: string;
  threadCount: number;
  runIndex: number;
  concurrentIndex: number;
  benchmark: ScriptBenchmark;
}

export interface ScriptBenchmarkResult {
  scriptId: string;
  scriptName: string;
  results: KernelThreadResult[];
}

export interface MachineInfo {
  platform: string;
  cpus: number;
  totalMemKb: number;
}

export interface BenchmarkReport {
  timestamp: string;
  machineInfo: MachineInfo;
  scripts: ScriptBenchmarkResult[];
}

export interface KernelComparison {
  scriptId: string;
  scriptName: string;
  threadCount: number;
  metric: string;
  wasmValue: number;
  nativeValue: number;
  ratio: number;
}

export function buildMachineInfo(): MachineInfo {
  return {
    platform: process.platform,
    cpus: os.cpus().length,
    totalMemKb: Math.floor(os.totalmem() / 1024),
  };
}

export function writeBenchmarkReport(reportPath: string, report: BenchmarkReport): BenchmarkReport {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

export function compareKernels(report: BenchmarkReport): KernelComparison[] {
  const comparisons: KernelComparison[] = [];

  for (const scriptResult of report.scripts) {
    const byKernel = new Map<string, KernelThreadResult[]>();
    for (const result of scriptResult.results) {
      const key = `${result.kernelName}:${result.threadCount}`;
      const list = byKernel.get(key) ?? [];
      list.push(result);
      byKernel.set(key, list);
    }

    const threadCounts = [...new Set(scriptResult.results.map(r => r.threadCount))].sort((a, b) => a - b);

    for (const threadCount of threadCounts) {
      const wasmResults = byKernel.get(`wasm:${threadCount}`) ?? [];
      const nativeResults = byKernel.get(`native:${threadCount}`) ?? [];

      for (const wasm of wasmResults) {
        const native = nativeResults.find(
          n => n.runIndex === wasm.runIndex && n.concurrentIndex === wasm.concurrentIndex,
        );
        if (!native) continue;

        const metrics = [
          { name: 'totalDurationMs', w: wasm.benchmark.totalDurationMs, n: native.benchmark.totalDurationMs },
          { name: 'peakMemoryDeltaKb', w: wasm.benchmark.peakMemoryDeltaKb, n: native.benchmark.peakMemoryDeltaKb },
        ];

        if (wasm.benchmark.tessellationTimeMs !== undefined && native.benchmark.tessellationTimeMs !== undefined) {
          metrics.push({
            name: 'tessellationTimeMs',
            w: wasm.benchmark.tessellationTimeMs,
            n: native.benchmark.tessellationTimeMs,
          });
        }

        for (const m of metrics) {
          if (m.w > 0 && m.n > 0) {
            comparisons.push({
              scriptId: scriptResult.scriptId,
              scriptName: scriptResult.scriptName,
              threadCount,
              metric: m.name,
              wasmValue: m.w,
              nativeValue: m.n,
              ratio: m.n / m.w,
            });
          }
        }
      }
    }
  }

  return comparisons;
}
