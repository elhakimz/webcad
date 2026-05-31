// src/core/sketcher/System.ts
import { Param, hParam } from "./Param";
import { Equation } from "./Constraint";
import { SketchModel } from "./SketchModel";
import { SolveResult, SolveOutput } from "./Solver";
import { Expr, ExprOp } from "./Expr";

const MAX_UNKNOWNS    = 1024;
const CONVERGE_TOL    = 1e-10;
const RANK_MAG_TOL    = 1e-4;
const MAX_ITER        = 50;

export class System {
  private params:    Param[]    = [];
  private equations: Equation[] = [];

  private mat = {
    param: new Int32Array(MAX_UNKNOWNS),
    m: 0, n: 0,
    A: {
      sym: [] as Expr[][],
      num: [] as Float64Array[],
    },
    B: {
      sym: [] as Expr[],
      num: new Float64Array(MAX_UNKNOWNS),
    },
    X:     new Float64Array(MAX_UNKNOWNS),
    scale: new Float64Array(MAX_UNKNOWNS),
    AAt:   [] as Float64Array[],
    Z:     new Float64Array(MAX_UNKNOWNS),
  };

  private dragged = new Set<hParam>();

  constructor() {
    for (let i = 0; i < MAX_UNKNOWNS; i++) {
      this.mat.A.sym[i] = new Array(MAX_UNKNOWNS);
      this.mat.A.num[i] = new Float64Array(MAX_UNKNOWNS);
      this.mat.AAt[i]   = new Float64Array(MAX_UNKNOWNS);
    }
  }

  static solve(model: SketchModel, _constraints: any[]): SolveOutput {
    // Statics for compatibility with Solid3DReevaluator
    const system = new System();
    return system.solve(model);
  }

  setDragged(params: hParam[]) {
    this.dragged = new Set(params);
  }

  solve(model: SketchModel): SolveOutput {
    this.params    = model.params.getAll().filter(p => !p.known);
    this.equations = [];
    for (const c of model.constraints) {
      this.equations.push(...c.generate(model));
    }

    model.params.clearTags();
    this.solveBySubstitution();

    this.writeJacobian(0, model);
    if (this.mat.m > MAX_UNKNOWNS || this.mat.n > MAX_UNKNOWNS) {
      return { result: SolveResult.TOO_MANY_UNKNOWNS, dof: 0, redundant: [], freeParams: [] };
    }

    this.evalJacobian();
    const rank = this.calculateRank();

    if (this.mat.m > 0 && rank !== this.mat.m) {
      return { result: SolveResult.SINGULAR_JACOBIAN, dof: 0, redundant: [], freeParams: [] };
    }

    const dof = this.mat.n - this.mat.m;

    if (this.mat.m > 0 && !this.newtonSolve(0)) {
      return { result: SolveResult.DIDNT_CONVERGE, dof, redundant: [], freeParams: [] };
    }

    const freeParams = this.findFreeParams();

    return { result: SolveResult.SOLVED_OKAY, dof, redundant: [], freeParams };
  }

  private solveBySubstitution() {
    for (const eq of this.equations) {
      const expr = eq.expr;
      if (expr.op !== ExprOp.MINUS) continue;
      if (expr.a?.op !== ExprOp.PARAM) continue;
      if (expr.b?.op !== ExprOp.PARAM) continue;

      let a = expr.a.param;
      let b = expr.b.param;

      if (this.dragged.has(a)) { const t = a; a = b; b = t; }

      for (const e2 of this.equations) {
        e2.expr.substitute(a, b);
      }
      eq.tag = -1;
    }
  }

  private writeJacobian(tag: number, model: SketchModel) {
    const freeCols: hParam[] = [];
    for (const p of this.params) {
      if (p.known) continue;
      freeCols.push(p.h);
    }
    this.mat.n = freeCols.length;
    freeCols.forEach((h, j) => { this.mat.param[j] = h; });

    const rows = this.equations.filter(e => e.tag === tag);
    this.mat.m = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const f = rows[i].expr.foldConstants().deepCopyWithPtrs(model.params);
      const scoreboard = f.paramsUsed();

      for (let j = 0; j < this.mat.n; j++) {
        const h = this.mat.param[j];
        let pd: Expr;
        if ((scoreboard & (1n << BigInt(h % 61))) !== 0n && f.dependsOn(h)) {
          pd = f.partialWrt(h).foldConstants();
        } else {
          pd = Expr.const_(0);
        }
        this.mat.A.sym[i][j] = pd.deepCopyWithPtrs(model.params);
      }
      this.mat.B.sym[i] = f;
    }
  }

  private evalJacobian() {
    for (let i = 0; i < this.mat.m; i++) {
      for (let j = 0; j < this.mat.n; j++) {
        this.mat.A.num[i][j] = this.mat.A.sym[i][j].eval();
      }
    }
  }

  private calculateRank(): number {
    const tol = RANK_MAG_TOL * RANK_MAG_TOL;
    const rowMag = new Float64Array(this.mat.m);
    let rank = 0;

    for (let i = 0; i < this.mat.m; i++) {
      for (let iprev = 0; iprev < i; iprev++) {
        if (rowMag[iprev] <= tol) continue;
        let dot = 0;
        for (let j = 0; j < this.mat.n; j++) dot += this.mat.A.num[iprev][j] * this.mat.A.num[i][j];
        for (let j = 0; j < this.mat.n; j++) this.mat.A.num[i][j] -= (dot / rowMag[iprev]) * this.mat.A.num[iprev][j];
      }
      let mag = 0;
      for (let j = 0; j < this.mat.n; j++) mag += this.mat.A.num[i][j] ** 2;
      if (mag > tol) rank++;
      rowMag[i] = mag;
    }
    return rank;
  }

  private newtonSolve(_tag: number): boolean {
    for (let i = 0; i < this.mat.m; i++) {
      this.mat.B.num[i] = this.mat.B.sym[i].eval();
    }

    for (let iter = 0; iter < MAX_ITER; iter++) {
      this.evalJacobian();
      if (!this.solveLeastSquares()) return false;

      for (let j = 0; j < this.mat.n; j++) {
        const p = this.getParamByColumn(j);
        p.val -= this.mat.X[j];
      }

      let converged = true;
      for (let i = 0; i < this.mat.m; i++) {
        this.mat.B.num[i] = this.mat.B.sym[i].eval();
        if (Math.abs(this.mat.B.num[i]) > CONVERGE_TOL) converged = false;
      }
      if (converged) return true;
    }
    return false;
  }

  private solveLeastSquares(): boolean {
    for (let c = 0; c < this.mat.n; c++) {
      const h = this.mat.param[c];
      this.mat.scale[c] = this.dragged.has(h) ? 0.05 : 1;
      for (let r = 0; r < this.mat.m; r++) this.mat.A.num[r][c] *= this.mat.scale[c];
    }

    for (let r = 0; r < this.mat.m; r++) {
      for (let c = 0; c < this.mat.m; c++) {
        let sum = 0;
        for (let k = 0; k < this.mat.n; k++) sum += this.mat.A.num[r][k] * this.mat.A.num[c][k];
        this.mat.AAt[r][c] = sum;
      }
    }

    if (!this.solveLinear(this.mat.Z, this.mat.AAt, this.mat.B.num, this.mat.m)) return false;

    for (let c = 0; c < this.mat.n; c++) {
      let sum = 0;
      for (let r = 0; r < this.mat.m; r++) sum += this.mat.A.num[r][c] * this.mat.Z[r];
      this.mat.X[c] = sum * this.mat.scale[c];
    }
    return true;
  }

  private solveLinear(X: Float64Array, A: Float64Array[], B: Float64Array, n: number): boolean {
    const Ac = A.map(row => Float64Array.from(row));
    const Bc = Float64Array.from(B);

    for (let i = 0; i < n; i++) {
      let imax = i, max = Math.abs(Ac[i][i]);
      for (let ip = i + 1; ip < n; ip++) {
        if (Math.abs(Ac[ip][i]) > max) { max = Math.abs(Ac[ip][i]); imax = ip; }
      }
      if (max < 1e-20) return false;

      const tmp = Ac[i]; Ac[i] = Ac[imax]; Ac[imax] = tmp;
      const bt = Bc[i]; Bc[i] = Bc[imax]; Bc[imax] = bt;

      for (let ip = i + 1; ip < n; ip++) {
        const f = Ac[ip][i] / Ac[i][i];
        for (let jp = i; jp < n; jp++) Ac[ip][jp] -= f * Ac[i][jp];
        Bc[ip] -= f * Bc[i];
      }
    }

    for (let i = n - 1; i >= 0; i--) {
      let s = Bc[i];
      for (let j = i + 1; j < n; j++) s -= X[j] * Ac[i][j];
      X[i] = s / Ac[i][i];
    }
    return true;
  }

  private findFreeParams(): hParam[] {
    return this.params.filter(p => !p.known).map(p => p.h);
  }

  private getParamByColumn(j: number): Param {
    const h = this.mat.param[j];
    return this.params.find(p => p.h === h)!;
  }
}
