// src/core/sketcher/Solver.ts

import {ConstraintBase} from "./Constraint";

export enum SolveResult {
  SOLVED_OKAY        = 0,
  DIDNT_CONVERGE     = 1,
  SINGULAR_JACOBIAN  = 2,  // over-constrained
  TOO_MANY_UNKNOWNS  = 3,
}

export interface SolveOutput {
  result: SolveResult;
  dof: number;                  // degrees of freedom remaining
  redundant: ConstraintBase[];  // constraints to remove
  freeParams: number[];         // params with no binding constraint
}
