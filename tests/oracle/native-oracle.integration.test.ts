import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import { NativeKernelAdapter } from '../../src/core/harness/native-kernel-adapter';
import { OracleRunner } from '../../src/core/oracle/oracle-runner';

describe('Native kernel oracle integration (localhost:50051)', () => {
  let adapter: NativeKernelAdapter;
  let runner: OracleRunner;

  beforeAll(async () => {
    adapter = new NativeKernelAdapter('localhost:50051');
    runner = new OracleRunner();
    runner.loadFixtures(path.resolve(__dirname, '../../tests/fixtures/oracle'));
  });

  afterAll(async () => {
    if (adapter.cleanup) await adapter.cleanup();
  });

  it('all reference parts pass against native kernel', async () => {
    const report = await runner.run(adapter);
    expect(report.failedParts).toBe(0);
    expect(report.passedParts).toBe(report.totalParts);
    expect(report.totalParts).toBe(4);
    for (const result of report.results) {
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  }, 60000);
});
