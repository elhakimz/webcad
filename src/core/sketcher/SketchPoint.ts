// src/core/sketcher/SketchPoint.ts
import { hParam, ParamStore } from "./Param";

export type hEntity = number;

export class SketchPoint {
  constructor(
    public readonly h: hEntity,
    public readonly px: hParam,  // x coordinate param
    public readonly py: hParam,  // y coordinate param
    public construction: boolean = false,
    public fixed: boolean = false,  // anchor point — params marked known=true
  ) {}

  getNum(params: ParamStore): { x: number; y: number } {
    return { x: params.get(this.px).val, y: params.get(this.py).val };
  }

  forceToNum(x: number, y: number, params: ParamStore) {
    params.get(this.px).val = x;
    params.get(this.py).val = y;
  }
}
