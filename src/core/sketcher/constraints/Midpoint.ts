// src/core/sketcher/constraints/Midpoint.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Midpoint extends ConstraintBase {
  readonly type = 'Midpoint';

  constructor(public pt: hEntity, public entityA: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const p   = model.points.get(this.pt)!;
    const ent = model.entities.get(this.entityA)!;
    const pS  = model.points.get(ent.point[0])!;
    const pE  = model.points.get(ent.point[1])!;
    const midX = Expr.param(pS.px).plus(Expr.param(pE.px)).div(Expr.const_(2));
    const midY = Expr.param(pS.py).plus(Expr.param(pE.py)).div(Expr.const_(2));
    return [
      { expr: Expr.param(p.px).minus(midX), tag: 0, owner: this },
      { expr: Expr.param(p.py).minus(midY), tag: 0, owner: this },
    ];
  }

  modifyToSatisfy(_model: SketchModel) {}
}
