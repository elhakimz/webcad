// src/core/sketcher/constraints/Perpendicular.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Perpendicular extends ConstraintBase {
  readonly type = 'Perpendicular';

  constructor(public lineA: hEntity, public lineB: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const entA = model.entities.get(this.lineA);
    const entB = model.entities.get(this.lineB);
    if (!entA || !entB || entA.type !== 'LINE_SEGMENT' || entB.type !== 'LINE_SEGMENT') return [];

    const pA1 = model.points.get(entA.point[0])!;
    const pA2 = model.points.get(entA.point[1])!;
    const pB1 = model.points.get(entB.point[0])!;
    const pB2 = model.points.get(entB.point[1])!;

    // Vector A: (xA2 - xA1, yA2 - yA1)
    // Vector B: (xB2 - xB1, yB2 - yB1)
    // Perpendicular if dot product = 0: dxA * dxB + dyA * dyB = 0
    const dxA = Expr.param(pA2.px).minus(Expr.param(pA1.px));
    const dyA = Expr.param(pA2.py).minus(Expr.param(pA1.py));
    const dxB = Expr.param(pB2.px).minus(Expr.param(pB1.px));
    const dyB = Expr.param(pB2.py).minus(Expr.param(pB1.py));

    return [{ expr: dxA.times(dxB).plus(dyA.times(dyB)), tag: 0, owner: this }];
  }

  modifyToSatisfy(_model: SketchModel): void {}
}
