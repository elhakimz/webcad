// src/core/sketcher/constraints/ArcLineTangent.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr, ExprVector, lineDir } from "../Expr";

export class ArcLineTangent extends ConstraintBase {
  readonly type = 'ArcLineTangent';

  constructor(public arc: hEntity, public line: hEntity, public atStart: boolean) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const arcEnt  = model.entities.get(this.arc)!;
    const lineEnt = model.entities.get(this.line)!;

    // Arc tangent at start = perpendicular to radius-to-start
    const ctr  = model.points.get(arcEnt.point[0])!;
    const endPt = model.points.get(arcEnt.point[this.atStart ? 1 : 2])!;

    // Radial vector from center to endpoint
    const radial = new ExprVector(
      Expr.param(endPt.px).minus(Expr.param(ctr.px)),
      Expr.param(endPt.py).minus(Expr.param(ctr.py)),
    );
    // Tangent = perpendicular to radial: (-ry, rx)
    const tangent = new ExprVector(radial.y.negate(), radial.x);

    // Line direction
    const lineDirVec = lineDir(lineEnt.point, model);

    // Tangent × linedir = 0  (parallel condition)
    return [{ expr: tangent.cross2d(lineDirVec), tag: 0, owner: this }];
  }

  modifyToSatisfy(_model: SketchModel) {}
}
