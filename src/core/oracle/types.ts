import { Script, ScriptTolerances } from '../harness/kernel-adapter';

export interface ExpectedMetrics {
  volume: number;
  surfaceArea: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  faceCount: number;
  edgeCount: number;
  vertexCount: number;
  isValid: boolean;
}

export interface ReferencePart {
  id: string;
  name: string;
  description: string;
  script: Script;
  expected: ExpectedMetrics;
  tolerances: ScriptTolerances;
}

export interface MetricDiff {
  metric: string;
  expected: unknown;
  actual: unknown;
  delta: number;
  tolerance: number;
  passed: boolean;
  message?: string;
}

export interface OraclePartEvaluation {
  partId: string;
  passed: boolean;
  diffs: Record<string, MetricDiff>;
  errors: string[];
}

export interface OracleReport {
  totalParts: number;
  passedParts: number;
  failedParts: number;
  timestamp: string;
  results: OraclePartEvaluation[];
}
