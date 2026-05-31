// src/core/sketcher/constraints/WhereDragged.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class WhereDragged extends ConstraintBase {
  readonly type = 'WhereDragged';

  constructor(public pt: hEntity, public tx: number, public ty: number) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const p = model.points.get(this.pt)!;
    return [
      { expr: Expr.param(p.px).minus(Expr.const_(this.tx)), tag: 0, owner: this },
      { expr: Expr.param(p.py).minus(Expr.const_(this.ty)), tag: 0, owner: this },
    ];
  }

  modifyToSatisfy(_model: SketchModel) {}
}
