// src/core/sketcher/constraints/EqualLength.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { lineLength } from "../Expr";

export class EqualLength extends ConstraintBase {
  readonly type = 'EqualLength';

  constructor(public entityA: hEntity, public entityB: hEntity) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const entA = model.entities.get(this.entityA)!;
    const entB = model.entities.get(this.entityB)!;
    const lenA = lineLength(entA.point, model);
    const lenB = lineLength(entB.point, model);
    return [{ expr: lenA.minus(lenB), tag: 0, owner: this }];
  }

  modifyToSatisfy(_model: SketchModel) {}
}
