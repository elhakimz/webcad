// src/core/sketcher/constraints/Tangent.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Tangent extends ConstraintBase {
  readonly type = 'Tangent';

  constructor(public line: hEntity, public circle: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const entLine = model.entities.get(this.line);
    const entCirc = model.entities.get(this.circle);
    if (!entLine || !entCirc || entLine.type !== 'LINE_SEGMENT' || entCirc.type !== 'CIRCLE') return [];

    const pL1 = model.points.get(entLine.point[0])!;
    const pL2 = model.points.get(entLine.point[1])!;
    const pC  = model.points.get(entCirc.point[0])!;
    const r   = Expr.param(entCirc.distance!);

    const dxL = Expr.param(pL2.px).minus(Expr.param(pL1.px));
    const dyL = Expr.param(pL2.py).minus(Expr.param(pL1.py));
    
    const dxC = Expr.param(pC.px).minus(Expr.param(pL1.px));
    const dyC = Expr.param(pC.py).minus(Expr.param(pL1.py));

    // Area of parallelogram formed by (L2-L1) and (C-L1)
    // Cross product: dxL * dyC - dyL * dxC
    // Distance squared = Area^2 / Base^2
    const cross = dxL.times(dyC).minus(dyL.times(dxC));
    const distSq = cross.square();
    const baseSq = dxL.square().plus(dyL.square());

    // distSq - r^2 * baseSq = 0
    return [{ expr: distSq.minus(r.square().times(baseSq)), tag: 0, owner: this }];
  }

  modifyToSatisfy(_model: SketchModel): void {}
}
