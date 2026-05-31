// src/core/sketcher/constraints/Angle.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Angle extends ConstraintBase {
  readonly type = 'Angle';

  constructor(public lineA: hEntity, public lineB: hEntity, public angleDeg: number) {
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

    const dxA = Expr.param(pA2.px).minus(Expr.param(pA1.px));
    const dyA = Expr.param(pA2.py).minus(Expr.param(pA1.py));
    const dxB = Expr.param(pB2.px).minus(Expr.param(pB1.px));
    const dyB = Expr.param(pB2.py).minus(Expr.param(pB1.py));

    const angleRad = (this.angleDeg * Math.PI) / 180;
    const cosVal = Math.cos(angleRad);

    // dot(A, B) = |A||B| cos(theta)
    // (dxA*dxB + dyA*dyB)^2 = (dxA^2 + dyA^2) * (dxB^2 + dyB^2) * cos(theta)^2
    const dot = dxA.times(dxB).plus(dyA.times(dyB));
    const magASq = dxA.square().plus(dyA.square());
    const magBSq = dxB.square().plus(dyB.square());

    return [{ expr: dot.square().minus(magASq.times(magBSq).times(Expr.const_(cosVal * cosVal))), tag: 0 }];
  }

  modifyToSatisfy(_model: SketchModel): void {}
}
