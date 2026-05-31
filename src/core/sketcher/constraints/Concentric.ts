// src/core/sketcher/constraints/Concentric.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Concentric extends ConstraintBase {
  readonly type = 'Concentric';

  constructor(public entityA: hEntity, public entityB: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const entA = model.entities.get(this.entityA);
    const entB = model.entities.get(this.entityB);
    if (!entA || !entB) return [];
    
    // Both must have at least one point (the center)
    const pA = model.points.get(entA.point[0]);
    const pB = model.points.get(entB.point[0]);
    if (!pA || !pB) return [];

    return [
      { expr: Expr.param(pA.px).minus(Expr.param(pB.px)), tag: 0, owner: this },
      { expr: Expr.param(pA.py).minus(Expr.param(pB.py)), tag: 0, owner: this }
    ];
  }

  modifyToSatisfy(_model: SketchModel): void {}
}
