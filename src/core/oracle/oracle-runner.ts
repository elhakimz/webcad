import * as fs from 'node:fs';
import * as path from 'node:path';
import { KernelAdapter } from '../harness/kernel-adapter';
import {
  MetricDiff,
  OraclePartEvaluation,
  OracleReport,
  ReferencePart,
} from './types';
import { evaluateMetrics } from './oracle-evaluator';

export class OracleRunner {
  private parts: ReferencePart[] = [];

  loadFixtures(fixturesDir: string): ReferencePart[] {
    const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json')).sort();
    this.parts = files.map(f => {
      const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf8'));
      return raw as ReferencePart;
    });
    return this.parts;
  }

  async run(adapter: KernelAdapter, parts?: ReferencePart[]): Promise<OracleReport> {
    const targetParts = parts ?? this.parts;
    if (adapter.init) await adapter.init();

    const results: OraclePartEvaluation[] = [];
    try {
      for (const part of targetParts) {
        const errors: string[] = [];
        const diffs: Record<string, MetricDiff> = {};
        let partPassed = true;

        try {
          const kernelResults = await adapter.execute(part.script);

          for (let i = 0; i < kernelResults.length; i++) {
            const result = kernelResults[i];
            if (!result.success) {
              errors.push(`step ${i} (${result.stepName}): ${result.error || 'unknown error'}`);
              partPassed = false;
              continue;
            }

            const evalResult = evaluateMetrics(part.expected, result.metrics, part.tolerances);
            for (const [key, diff] of Object.entries(evalResult.diffs)) {
              diffs[key] = diff;
              if (!diff.passed) partPassed = false;
            }
            for (const err of evalResult.errors) {
              const alreadyReported = Object.values(diffs).some(d => d.message === err);
              if (!alreadyReported) errors.push(err);
            }
          }
        } catch (err) {
          errors.push(`adapter error: ${err instanceof Error ? err.message : String(err)}`);
          partPassed = false;
        }

        results.push({
          partId: part.id,
          passed: partPassed && errors.length === 0,
          diffs,
          errors,
        });
      }
    } finally {
      if (adapter.cleanup) await adapter.cleanup();
    }

    const passedParts = results.filter(r => r.passed).length;
    return {
      totalParts: results.length,
      passedParts,
      failedParts: results.length - passedParts,
      timestamp: new Date().toISOString(),
      results,
    };
  }
}
