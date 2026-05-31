// src/core/sketcher/constraints/Radius.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Radius extends ConstraintBase {
  readonly type = 'Radius';

  constructor(public circle: hEntity, public value: number) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const ent = model.entities.get(this.circle);
    if (!ent || (ent.type !== 'CIRCLE' && ent.type !== 'ARC_OF_CIRCLE') || ent.distance === undefined) return [];

    // r - value = 0
    return [{ expr: Expr.param(ent.distance).minus(Expr.const_(this.value)), tag: 0, owner: this }];
  }

  modifyToSatisfy(model: SketchModel): void {
    const ent = model.entities.get(this.circle);
    if (ent && ent.distance !== undefined) {
        this.value = model.params.get(ent.distance).val;
    }
  }
}
