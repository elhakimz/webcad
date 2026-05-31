// src/core/sketcher/constraints/ArcPointsOnCircle.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class ArcPointsOnCircle extends ConstraintBase {
  readonly type = 'ArcPointsOnCircle';

  constructor(public arc: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const ent = model.entities.get(this.arc);
    if (!ent || ent.type !== 'ARC_OF_CIRCLE' || ent.distance === undefined) return [];

    const pC = model.points.get(ent.point[0])!; // center
    const pS = model.points.get(ent.point[1])!; // start
    const pE = model.points.get(ent.point[2])!; // end
    const r  = Expr.param(ent.distance);

    // Equation 1: dist(C, S)^2 - r^2 = 0
    const dxS = Expr.param(pS.px).minus(Expr.param(pC.px));
    const dyS = Expr.param(pS.py).minus(Expr.param(pC.py));
    const eqS = dxS.square().plus(dyS.square()).minus(r.square());

    // Equation 2: dist(C, E)^2 - r^2 = 0
    const dxE = Expr.param(pE.px).minus(Expr.param(pC.px));
    const dyE = Expr.param(pE.py).minus(Expr.param(pC.py));
    const eqE = dxE.square().plus(dyE.square()).minus(r.square());

    return [
      { expr: eqS, tag: 0, owner: this },
      { expr: eqE, tag: 0, owner: this }
    ];
  }

  modifyToSatisfy(_model: SketchModel): void {}
}
