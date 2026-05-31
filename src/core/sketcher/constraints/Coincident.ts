// src/core/sketcher/constraints/Coincident.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Coincident extends ConstraintBase {
  readonly type = 'Coincident';

  constructor(public ptA: hEntity, public ptB: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const pA = model.points.get(this.ptA);
    const pB = model.points.get(this.ptB);
    if (!pA || !pB) return [];

    return [
      { expr: Expr.param(pA.px).minus(Expr.param(pB.px)), tag: 0, owner: this },
      { expr: Expr.param(pA.py).minus(Expr.param(pB.py)), tag: 0, owner: this }
    ];
  }

  modifyToSatisfy(_model: SketchModel): void {
    // Point-point coincidence is purely structural or solved by substitution
  }
}
