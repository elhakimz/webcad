export type EvaluatedGeometry =
  | { type: "Primitive"; name: string; params: Record<string, any> }
  | { type: "Transform"; name: string; params: Record<string, any>; children: EvaluatedGeometry[] }
  | { type: "Boolean"; name: string; children: EvaluatedGeometry[] }
  | { type: "Group"; children: EvaluatedGeometry[] };

export interface EvaluationResult {
  geometry: EvaluatedGeometry[];
}
