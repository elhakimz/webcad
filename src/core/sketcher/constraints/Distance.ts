// src/core/sketcher/constraints/Distance.ts
import { ConstraintBase, Equation } from "../Constraint";
import { SketchModel } from "../SketchModel";
import { hEntity } from "../SketchPoint";
import { Expr } from "../Expr";

export class Distance extends ConstraintBase {
  readonly type = 'Distance';

  constructor(public ptA: hEntity, public ptB: hEntity, public value: number) {
    super();
  }

  generate(model: SketchModel): Equation[] {
    const pA = model.points.get(this.ptA);
    const pB = model.points.get(this.ptB);
    if (!pA || !pB) return [];

    // (xA-xB)^2 + (yA-yB)^2 - value^2 = 0
    const dx = Expr.param(pA.px).minus(Expr.param(pB.px));
    const dy = Expr.param(pA.py).minus(Expr.param(pB.py));
    const eq = dx.square().plus(dy.square()).minus(Expr.const_(this.value ** 2));
    
    return [{ expr: eq, tag: 0, owner: this }];
  }

  modifyToSatisfy(model: SketchModel): void {
    const pA = model.points.get(this.ptA);
    const pB = model.points.get(this.ptB);
    if (pA && pB) {
        const valA = pA.getNum(model.params);
        const valB = pB.getNum(model.params);
        this.value = Math.sqrt((valA.x - valB.x) ** 2 + (valA.y - valB.y) ** 2);
    }
  }
}
