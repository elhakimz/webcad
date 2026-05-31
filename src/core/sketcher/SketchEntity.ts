// src/core/sketcher/SketchEntity.ts
import { hParam } from "./Param";
import { hEntity } from "./SketchPoint";

export type SketchEntityType =
  | 'LINE_SEGMENT'
  | 'CIRCLE'
  | 'ARC_OF_CIRCLE'
  | 'CUBIC'
  | 'WORKPLANE';

export interface SketchEntity {
  h: hEntity;
  type: SketchEntityType;
  group: string;             // which feature group this belongs to
  workplane: hEntity;        // reference plane, or FREE_IN_3D sentinel
  point: hEntity[];          // [start, end] for line; [center, start, end] for arc
  normal?: hParam[];         // for workplane: quaternion params [w, vx, vy, vz]
  distance?: hParam;         // for circle: radius param
  construction: boolean;
  style: number;             // style slot (normal/selected/error/etc.)
}
