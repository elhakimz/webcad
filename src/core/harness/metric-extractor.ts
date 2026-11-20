import { KernelResult, KernelMetric } from './kernel-adapter';

export function extractMetrics(result: KernelResult): KernelMetric {
  return {
    volume: result.metrics.volume,
    surfaceArea: result.metrics.surfaceArea,
    bbox: result.metrics.bbox,
    faceCount: result.metrics.faceCount,
    edgeCount: result.metrics.edgeCount,
    vertexCount: result.metrics.vertexCount,
    valid: result.metrics.valid,
  };
}
