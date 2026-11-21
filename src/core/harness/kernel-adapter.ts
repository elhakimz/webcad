export interface KernelMetric {
  volume?: number;
  surfaceArea?: number;
  bbox?: { min: [number, number, number]; max: [number, number, number] };
  faceCount?: number;
  edgeCount?: number;
  vertexCount?: number;
  valid?: boolean;
}

export interface Loop2D {
  points: Array<{ x: number; y: number; bulge: number }>;
}

export interface KernelResult {
  stepIndex: number;
  stepName: string;
  shapeId?: string;
  metrics: KernelMetric;
  success: boolean;
  error?: string;
  loops?: Loop2D[];
}

export interface ScriptStep {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ScriptTolerances {
  volume: number;
  surface: number;
  surfaceArea?: number;
  bbox: number;
  counts: number;
}

export interface Script {
  name: string;
  tolerances: ScriptTolerances;
  steps: ScriptStep[];
}

export interface KernelAdapter {
  name: string;
  init?(): Promise<void>;
  execute(script: Script): Promise<KernelResult[]>;
  cleanup?(): Promise<void>;
}

export const DEFAULT_TOLERANCES: ScriptTolerances = {
  volume: 1e-4,
  surface: 1e-4,
  surfaceArea: 1e-4,
  bbox: 1e-3,
  counts: 0,
};
