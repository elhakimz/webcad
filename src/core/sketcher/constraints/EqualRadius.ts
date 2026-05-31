// src/core/sketcher/constraints/EqualRadius.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class EqualRadius extends ConstraintBase {
  readonly type = 'EqualRadius';

  constructor(public circleA: hEntity, public circleB: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const rA = Expr.param(model.entities.get(this.circleA)!.distance!);
    const rB = Expr.param(model.entities.get(this.circleB)!.distance!);
    return [{ expr: rA.minus(rB), tag: 0, owner: this }];
  }

  modifyToSatisfy(_model: SketchModel) {}
}
