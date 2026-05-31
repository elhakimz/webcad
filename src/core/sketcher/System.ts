// src/core/sketcher/System.ts
import { Param, hParam } from "./Param";
import { ConstraintBase, Equation } from "./Constraint";
import { SketchModel } from "./SketchModel";
import { SolveResult, SolveOutput } from "./Solver";
import { Expr, ExprOp } from "./Expr";

const MAX_UNKNOWNS    = 1024;
const CONVERGE_TOL    = 1e-10;
const RANK_MAG_TOL    = 1e-4;
const MAX_ITER        = 50;
const DRAG_SCALE      = 0.05;
const PIVOT_THRESHOLD = 1e-20;
const DIVERGE_LIMIT   = 1000.0;

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

  constructor() {}

  private ensureMatrixSize(m: number, n: number) {
    if (m > MAX_UNKNOWNS || n > MAX_UNKNOWNS) return;
    
    for (let i = 0; i < m; i++) {
        if (!this.mat.A.sym[i]) this.mat.A.sym[i] = new Array(MAX_UNKNOWNS);
        if (!this.mat.A.num[i]) this.mat.A.num[i] = new Float64Array(MAX_UNKNOWNS);
        if (!this.mat.AAt[i])   this.mat.AAt[i]   = new Float64Array(MAX_UNKNOWNS);
    }
  }

  static solve(model: SketchModel): SolveOutput {
    const system = new System();
    return system.solve(model);
  }

  solve(model: SketchModel): SolveOutput {
    this.params    = model.params.getAll().filter(p => !p.known);
    this.equations = [];
    for (const c of model.constraints) {
      this.equations.push(...c.generate(model));
    }

    this.solveBySubstitution(model);

    // Rebuild params list after substitution (some params may have been marked known)
    this.params = model.params.getAll().filter(p => !p.known);

    // ── Stage 2: Single-equation pre-solve ───────────────────────────
    // Any equation that references exactly one free param: solve immediately
    let aloneTag = 1;
    for (const eq of this.equations) {
      if (eq.tag !== 0) continue;
      const hp = this.referencedSingleParam(eq.expr, model);
      if (hp === null) continue;
      const p = model.params.get(hp);
      if (p.known) continue;  // already solved — rank test will catch inconsistency

      // Solve this 1x1 system directly: x -= f(x) / df/dx
      const f = eq.expr.foldConstants().deepCopyWithPtrs(model.params);
      const df = f.partialWrt(hp).foldConstants().deepCopyWithPtrs(model.params);
      const fx = f.eval();
      const dfx = df.eval();
      if (Math.abs(dfx) < 1e-20) continue; // singular, leave for Newton

      p.val -= fx / dfx;
      p.known = true;
      eq.tag = aloneTag;
      aloneTag++;
    }

    // Rebuild params list after Stage 2 (some params may have been marked known)
    this.params = model.params.getAll().filter(p => !p.known);

    // ── Stage 3: Rank test + full Newton ─────────────────────────────
    const activeEqs = this.equations.filter(e => e.tag === 0);
    this.mat.m = activeEqs.length;
    this.mat.n = this.params.length;

    if (this.mat.m > MAX_UNKNOWNS || this.mat.n > MAX_UNKNOWNS) {
      return { result: SolveResult.TOO_MANY_UNKNOWNS, dof: 0, redundant: [], freeParams: [] };
    }

    this.ensureMatrixSize(this.mat.m, this.mat.n);
    this.writeJacobian(0, model);

    this.evalJacobian();
    const rank = this.calculateRank();

    if (this.mat.m > 0 && rank !== this.mat.m) {
      const redundant = this.findRedundant(model);
      return { result: SolveResult.SINGULAR_JACOBIAN, dof: 0, redundant, freeParams: [] };
    }

    const dof = this.mat.n - this.mat.m;

    if (this.mat.m > 0 && !this.newtonSolve(0)) {
      return { result: SolveResult.DIDNT_CONVERGE, dof, redundant: [], freeParams: [] };
    }

    const freeParams = this.findFreeParams();

    return { result: SolveResult.SOLVED_OKAY, dof, redundant: [], freeParams };
  }

  private solveBySubstitution(model: SketchModel) {
    for (const eq of this.equations) {
      const expr = eq.expr;
      // Handle PARAM - PARAM = 0 (Coincident / Alignment)
      if (expr.op === ExprOp.MINUS && expr.a?.op === ExprOp.PARAM && expr.b?.op === ExprOp.PARAM) {
        const a = expr.a.param;
        const b = expr.b.param;
        
        const pA = model.params.get(a);
        const pB = model.params.get(b);
        
        // Substitution logic:
        // 1. If one is known, it MUST be the target (replace free with known)
        // 2. Otherwise, prefer replacing non-dragged with dragged
        let target = a;
        let source = b;

        if (pA.known && !pB.known) {
            target = b; source = a;
        } else if (!pA.known && pB.known) {
            target = a; source = b;
        } else if (pA.known && pB.known) {
            continue; // Both fixed, let Newton check if they are equal
        } else {
            // Both free
            if (this.dragged.has(a) && !this.dragged.has(b)) {
                target = b; source = a;
            } else {
                target = a; source = b;
            }
        }

        // Perform substitution in all other equations
        for (const e2 of this.equations) {
          if (e2 === eq) continue;
          e2.expr.substitute(target, source);
        }
        
        // Also update the value in ParamStore immediately so future evals are correct
        model.params.get(target).val = model.params.get(source).val;
        // Mark target as known since it's now redundant (all refs replaced by source)
        model.params.get(target).known = true;
        eq.tag = -1; // Remove this equation from Newton loop
      }
    }
  }

  private writeJacobian(tag: number, model: SketchModel) {
    const freeCols: hParam[] = [];
    for (const p of this.params) {
      freeCols.push(p.h);
    }
    this.mat.n = freeCols.length;
    freeCols.forEach((h, j) => { this.mat.param[j] = h; });

    const rows = this.equations.filter(e => e.tag === tag);
    this.mat.m = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const f = rows[i].expr.foldConstants().deepCopyWithPtrs(model.params);
      const usedParams = f.paramsUsed();

      for (let j = 0; j < this.mat.n; j++) {
        const h = this.mat.param[j];
        let pd: Expr;
        if (usedParams.has(h) && f.dependsOn(h)) {
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
      // Gram-Schmidt with re-orthogonalization for numerical stability
      for (let pass = 0; pass < 2; pass++) {
        for (let iprev = 0; iprev < i; iprev++) {
          if (rowMag[iprev] <= tol) continue;
          let dot = 0;
          for (let j = 0; j < this.mat.n; j++) dot += this.mat.A.num[iprev][j] * this.mat.A.num[i][j];
          const factor = dot / rowMag[iprev];
          for (let j = 0; j < this.mat.n; j++) this.mat.A.num[i][j] -= factor * this.mat.A.num[iprev][j];
        }
      }
      let mag = 0;
      for (let j = 0; j < this.mat.n; j++) mag += this.mat.A.num[i][j] ** 2;
      if (mag > tol) rank++;
      rowMag[i] = mag;
    }
    return rank;
  }

  private newtonSolve(_tag: number): boolean {
    let lastError = Infinity;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      this.evalJacobian();
      if (!this.solveLeastSquares()) return false;

      let maxStep = 0;
      for (let j = 0; j < this.mat.n; j++) {
        const step = this.mat.X[j];
        maxStep = Math.max(maxStep, Math.abs(step));
        const p = this.getParamByColumn(j);
        p.val -= step;
      }

      // Divergence guard
      if (maxStep > DIVERGE_LIMIT) return false;

      let currentError = 0;
      let converged = true;
      for (let i = 0; i < this.mat.m; i++) {
        const val = this.mat.B.sym[i].eval();
        this.mat.B.num[i] = val;
        const err = Math.abs(val);
        currentError = Math.max(currentError, err);
        if (err > CONVERGE_TOL) converged = false;
      }

      if (converged) return true;
      if (currentError > lastError * 100) return false; 
      lastError = currentError;
    }
    return false;
  }

  private solveLeastSquares(): boolean {
    for (let c = 0; c < this.mat.n; c++) {
      const h = this.mat.param[c];
      this.mat.scale[c] = this.dragged.has(h) ? DRAG_SCALE : 1;
      for (let r = 0; r < this.mat.m; r++) this.mat.A.num[r][c] *= this.mat.scale[c];
    }

    for (let r = 0; r < this.mat.m; r++) {
      for (let c = 0; c <= r; c++) {
        let sum = 0;
        for (let k = 0; k < this.mat.n; k++) sum += this.mat.A.num[r][k] * this.mat.A.num[c][k];
        this.mat.AAt[r][c] = this.mat.AAt[c][r] = sum;
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
      if (max < PIVOT_THRESHOLD) return false;

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

  // Bisection approach: for each constraint, temporarily remove its equations,
  // rebuild the Jacobian, and check if rank recovers. If so, that constraint is redundant.
  private findRedundant(model: SketchModel): ConstraintBase[] {
    const redundant: ConstraintBase[] = [];

    // Group active equations by owner constraint
    const eqsByOwner = new Map<ConstraintBase, Equation[]>();
    for (const eq of this.equations) {
      if (eq.tag !== 0 || !eq.owner) continue;
      if (!eqsByOwner.has(eq.owner)) eqsByOwner.set(eq.owner, []);
      eqsByOwner.get(eq.owner)!.push(eq);
    }

    if (eqsByOwner.size === 0) return [];

    // Compute baseline rank with all equations present
    this.writeJacobian(0, model);
    this.evalJacobian();
    const baselineRank = this.calculateRank();
    const baselineM = this.mat.m;

    // Already full rank — nothing redundant
    if (baselineRank === baselineM) return [];

    // Try removing each constraint's equations one at a time
    for (const [owner, eqs] of eqsByOwner) {
      // Temporarily remove this constraint's equations
      for (const eq of eqs) eq.tag = -2;

      // Rebuild Jacobian and compute rank without this constraint
      this.writeJacobian(0, model);
      this.evalJacobian();
      const newRank = this.calculateRank();
      const newM = this.mat.m;

      // Restore tags
      for (const eq of eqs) eq.tag = 0;

      // If the reduced system is full rank, this constraint is redundant
      if (newM > 0 && newRank === newM) {
        redundant.push(owner);
      }
    }

    return redundant;
  }

  private findFreeParams(): hParam[] {
    return this.params.filter(p => !p.known).map(p => p.h);
  }

  // ── Stage 2 helpers ─────────────────────────────────────────────────────
  private collectParams(expr: Expr, out: hParam[] = []): hParam[] {
    if (expr.op === ExprOp.PARAM && !out.includes(expr.param)) out.push(expr.param);
    if (expr.a) this.collectParams(expr.a, out);
    if (expr.b) this.collectParams(expr.b, out);
    return out;
  }

  private referencedSingleParam(expr: Expr, model: SketchModel): hParam | null {
    const used = this.collectParams(expr);
    const free = used.filter(h => !model.params.get(h).known);
    return free.length === 1 ? free[0] : null;
  }

  private getParamByColumn(j: number): Param {
    const h = this.mat.param[j];
    return this.params.find(p => p.h === h)!;
  }
}
