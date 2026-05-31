// src/core/sketcher/constraints/Vertical.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Vertical extends ConstraintBase {
  readonly type = 'Vertical';

  constructor(public ptA: hEntity, public ptB: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const pA = model.points.get(this.ptA);
    const pB = model.points.get(this.ptB);
    if (!pA || !pB) return [];

    // xA - xB = 0
    return [{ expr: Expr.param(pA.px).minus(Expr.param(pB.px)), tag: 0 }];
  }

  modifyToSatisfy(model: SketchModel): void {
    const pA = model.points.get(this.ptA);
    const pB = model.points.get(this.ptB);
    if (pA && pB) {
        // Move pB.x to match pA.x
        const val = model.params.get(pA.px).val;
        model.params.get(pB.px).val = val;
    }
  }
}
