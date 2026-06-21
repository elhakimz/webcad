// src/core/sketcher/Constraint.ts
import { Expr } from "./Expr";
import { SketchModel } from "./SketchModel";

export interface Equation {
  expr: Expr;    // equation = 0 (i.e. f(params) = 0)
  tag:  number;  // used by the solver to track substituted/solved eqs
  owner: ConstraintBase; // back-reference to the constraint that generated this equation
}

export abstract class ConstraintBase {
  abstract readonly type: string;
  tag = 0;  // solver bookkeeping

  abstract generate(model: SketchModel): Equation[];

  protected addEq(eqs: Equation[], expr: Expr): void {
    eqs.push({ expr, tag: 0, owner: this });
  }

  // Modify the constraint's stored value so it matches current geometry
  // (used when applying a dimension to already-drawn geometry)
  abstract modifyToSatisfy(model: SketchModel): void;
}
