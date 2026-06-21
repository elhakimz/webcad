// src/core/sketcher/constraints/Horizontal.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Horizontal extends ConstraintBase {
  readonly type = 'Horizontal';

  constructor(public ptA: hEntity, public ptB: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const pA = model.points.get(this.ptA);
    const pB = model.points.get(this.ptB);
    if (!pA || !pB) return [];

    // yA - yB = 0
    return [{ expr: Expr.param(pA.py).minus(Expr.param(pB.py)), tag: 0, owner: this }];
  }

  modifyToSatisfy(model: SketchModel): void {
    const pA = model.points.get(this.ptA);
    const pB = model.points.get(this.ptB);
    if (pA && pB) {
        // Move pB.y to match pA.y
        const val = model.params.get(pA.py).val;
        model.params.get(pB.py).val = val;
    }
  }
}
