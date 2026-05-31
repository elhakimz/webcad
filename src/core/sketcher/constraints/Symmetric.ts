// src/core/sketcher/constraints/Symmetric.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr, ExprVector, lineDir } from "../Expr";

export class Symmetric extends ConstraintBase {
  readonly type = 'Symmetric';

  constructor(public ptA: hEntity, public ptB: hEntity, public axisEntity: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const pA   = model.points.get(this.ptA)!;
    const pB   = model.points.get(this.ptB)!;
    const axis = model.entities.get(this.axisEntity)!;
    const aS   = model.points.get(axis.point[0])!;
    const _aE  = model.points.get(axis.point[1])!;
    // Midpoint of A and B lies on axis line (2 equations)
    // and AB is perpendicular to axis (1 equation)
    // → together: 3 scalar equations for 2D symmetry
    const midX = Expr.param(pA.px).plus(Expr.param(pB.px)).div(Expr.const_(2));
    const midY = Expr.param(pA.py).plus(Expr.param(pB.py)).div(Expr.const_(2));
    const mid  = new ExprVector(midX, midY);
    const axStart = new ExprVector(Expr.param(aS.px), Expr.param(aS.py));
    const axDir   = lineDir(axis.point, model);
    // mid lies on axis: cross(mid - axStart, axDir) = 0
    const midRel = mid.minus(axStart);
    const onAxis = midRel.cross2d(axDir);
    // AB perpendicular to axis: dot(AB, axDir) = 0
    const ab = new ExprVector(
      Expr.param(pB.px).minus(Expr.param(pA.px)),
      Expr.param(pB.py).minus(Expr.param(pA.py)),
    );
    const perp = ab.dot(axDir);
    return [
      { expr: onAxis, tag: 0, owner: this },
      { expr: perp,   tag: 0, owner: this },
    ];
  }

  modifyToSatisfy(_model: SketchModel) {}
}
