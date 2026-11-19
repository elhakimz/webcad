import { chromium, type Browser, type Page } from '@playwright/test';
import * as path from 'node:path';
import { KernelAdapter, Script, KernelResult, KernelMetric } from './kernel-adapter';

export class WasmKernelAdapter implements KernelAdapter {
  readonly name = 'wasm';
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
    const hostPath = path.resolve(process.cwd(), 'tests/e2e/harness/worker-host.html');
    await this.page.goto(`file://${hostPath}`);
    await this.page.waitForFunction(() => (window as any).__workerReady, { timeout: 30000 });
  }

  async execute(script: Script): Promise<KernelResult[]> {
    if (!this.page) throw new Error('WasmKernelAdapter not initialized');
    const results: KernelResult[] = [];

    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      const msg = { type: step.name, payload: step.parameters, id: i };

      let response: any;
      try {
        response = await this.page.evaluate((m) => (window as any).__sendToWorker(m), msg);
      } catch (err) {
        results.push({
          stepIndex: i,
          stepName: step.name,
          metrics: {},
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      results.push({
        stepIndex: i,
        stepName: step.name,
        shapeId: response?.payload?.shapeId || response?.payload?.entityId,
        metrics: this.extractMetricsFromPayload(response?.payload),
        success: response?.success === true,
        error: response?.error,
      });
    }

    return results;
  }

  private extractMetricsFromPayload(payload: any): KernelMetric {
    if (!payload) return {};
    const m: KernelMetric = {};
    if (typeof payload.volume === 'number') m.volume = payload.volume;
    if (typeof payload.surfaceArea === 'number') m.surfaceArea = payload.surfaceArea;
    if (payload.bbox) m.bbox = payload.bbox;
    if (typeof payload.faceCount === 'number') m.faceCount = payload.faceCount;
    if (typeof payload.edgeCount === 'number') m.edgeCount = payload.edgeCount;
    if (typeof payload.vertexCount === 'number') m.vertexCount = payload.vertexCount;
    if (typeof payload.valid === 'boolean') m.valid = payload.valid;
    return m;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
