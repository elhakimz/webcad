// src/core/sketcher/Expr.ts
import { hParam, Param, ParamStore } from "./Param";
import { SketchPoint } from "./SketchPoint";

export const enum ExprOp {
  PARAM    = 0,
  CONSTANT = 1,
  PLUS  = 10, MINUS  = 11, TIMES  = 12, DIV    = 13,
  NEGATE= 14, SQRT   = 15, SQUARE = 16,
  SIN   = 17, COS    = 18, ASIN   = 19, ACOS   = 20,
}

export class Expr {
  op:  ExprOp = ExprOp.CONSTANT;
  a?:  Expr;
  b?:  Expr;
  val: number = 0;      // CONSTANT value
  param: hParam = 0;    // PARAM handle
  paramPtr?: Param;     // resolved pointer (fast path after DeepCopyWithPtrs)

  // ── factories ──────────────────────────────────────────────────────────
  static param(h: hParam):  Expr { const e = new Expr(); e.op = ExprOp.PARAM;    e.param = h; return e; }
  static const_(v: number): Expr { const e = new Expr(); e.op = ExprOp.CONSTANT; e.val   = v; return e; }

  // ── arithmetic builder API ─────────────────────────────────────────────
  plus  (b: Expr): Expr { return this.binop(ExprOp.PLUS,   b); }
  minus (b: Expr): Expr { return this.binop(ExprOp.MINUS,  b); }
  times (b: Expr): Expr { return this.binop(ExprOp.TIMES,  b); }
  div   (b: Expr): Expr { return this.binop(ExprOp.DIV,    b); }
  square():  Expr { return this.unop(ExprOp.SQUARE); }
  sqrt():    Expr { return this.unop(ExprOp.SQRT);   }
  negate():  Expr { return this.unop(ExprOp.NEGATE); }
  sin():     Expr { return this.unop(ExprOp.SIN);    }
  cos():     Expr { return this.unop(ExprOp.COS);    }
  asin():    Expr { return this.unop(ExprOp.ASIN);   }
  acos():    Expr { return this.unop(ExprOp.ACOS);   }

  private binop(op: ExprOp, b: Expr): Expr {
    const e = new Expr(); e.op = op; e.a = this; e.b = b; return e;
  }
  private unop(op: ExprOp): Expr {
    const e = new Expr(); e.op = op; e.a = this; return e;
  }

  // ── evaluation ─────────────────────────────────────────────────────────
  eval(): number {
    switch (this.op) {
      case ExprOp.PARAM:    return this.paramPtr ? this.paramPtr.val : 0;
      case ExprOp.CONSTANT: return this.val;
      case ExprOp.PLUS:     return this.a!.eval() + this.b!.eval();
      case ExprOp.MINUS:    return this.a!.eval() - this.b!.eval();
      case ExprOp.TIMES:    return this.a!.eval() * this.b!.eval();
      case ExprOp.DIV:      return this.a!.eval() / this.b!.eval();
      case ExprOp.NEGATE:   return -this.a!.eval();
      case ExprOp.SQUARE:   { const v = this.a!.eval(); return v * v; }
      case ExprOp.SQRT:     return Math.sqrt(this.a!.eval());
      case ExprOp.SIN:      return Math.sin(this.a!.eval());
      case ExprOp.COS:      return Math.cos(this.a!.eval());
      case ExprOp.ASIN:     return Math.asin(this.a!.eval());
      case ExprOp.ACOS:     return Math.acos(this.a!.eval());
      default: return 0;
    }
  }

  // ── automatic differentiation ─────────────────────────────────────────
  // Returns dExpr/d(param h) as a new Expr tree
  partialWrt(h: hParam): Expr {
    const ZERO = Expr.const_(0);
    const ONE  = Expr.const_(1);

    switch (this.op) {
      case ExprOp.PARAM:
        return (this.param === h) ? ONE : ZERO;
      case ExprOp.CONSTANT:
        return ZERO;
      case ExprOp.PLUS:
        return this.a!.partialWrt(h).plus(this.b!.partialWrt(h));
      case ExprOp.MINUS:
        return this.a!.partialWrt(h).minus(this.b!.partialWrt(h));
      case ExprOp.TIMES: {
        // product rule: da/dh * b + a * db/dh
        const da = this.a!.partialWrt(h);
        const db = this.b!.partialWrt(h);
        return da.times(this.b!).plus(this.a!.times(db));
      }
      case ExprOp.DIV: {
        // quotient rule: (da*b - a*db) / b²
        const da = this.a!.partialWrt(h);
        const db = this.b!.partialWrt(h);
        return (da.times(this.b!).minus(this.a!.times(db)))
                 .div(this.b!.square());
      }
      case ExprOp.NEGATE:
        return this.a!.partialWrt(h).negate();
      case ExprOp.SQUARE:
        // d(a²)/dh = 2a * da/dh
        return Expr.const_(2).times(this.a!).times(this.a!.partialWrt(h));
      case ExprOp.SQRT:
        // d(√a)/dh = da/dh / (2√a)
        return this.a!.partialWrt(h)
                 .div(Expr.const_(2).times(this.a!.sqrt()));
      case ExprOp.SIN:
        return this.a!.cos().times(this.a!.partialWrt(h));
      case ExprOp.COS:
        return this.a!.sin().negate().times(this.a!.partialWrt(h));
      case ExprOp.ASIN:
        // d(asin(a))/dh = da/dh / √(1-a²)
        return this.a!.partialWrt(h)
                 .div(Expr.const_(1).minus(this.a!.square()).sqrt());
      case ExprOp.ACOS:
        return this.a!.partialWrt(h).negate()
                 .div(Expr.const_(1).minus(this.a!.square()).sqrt());
      default: return ZERO;
    }
  }

  // ── substitution ───────────────────────────────────────────────────────
  substitute(oldH: hParam, newH: hParam) {
    if (this.op === ExprOp.PARAM && this.param === oldH) {
      this.param = newH;
      this.paramPtr = undefined;
    }
    if (this.a) this.a.substitute(oldH, newH);
    if (this.b) this.b.substitute(oldH, newH);
  }

  // ── constant folding ───────────────────────────────────────────────────
  // Collapse (2 * 3) → 6 before the Newton loop to reduce Eval() work
  foldConstants(): Expr {
    if (this.op === ExprOp.CONSTANT || this.op === ExprOp.PARAM) return this;
    const fa = this.a?.foldConstants();
    const fb = this.b?.foldConstants();

    // If both operands are constants, evaluate immediately
    if (fa?.op === ExprOp.CONSTANT && fb?.op === ExprOp.CONSTANT) {
      const e = new Expr();
      e.op = ExprOp.CONSTANT;
      e.a = fa; e.b = fb;
      e.val = e.eval();
      return e;
    }
    if (fa?.op === ExprOp.CONSTANT && !fb) {
      const e = new Expr(); e.op = ExprOp.CONSTANT; e.a = fa;
      e.val = e.eval(); return e;
    }
    const r = new Expr(); r.op = this.op; r.a = fa; r.b = fb; return r;
  }

  // ── hot-path pointer resolution ────────────────────────────────────────
  // Walk tree once before Newton loop, replacing hParam lookups with
  // direct Param* pointers — eliminates Map.get() on every Eval() call
  deepCopyWithPtrs(store: ParamStore): Expr {
    const e = new Expr();
    e.op  = this.op;
    e.val = this.val;
    e.param = this.param;
    if (this.op === ExprOp.PARAM) {
      e.paramPtr = store.get(this.param);
    }
    if (this.a) e.a = this.a.deepCopyWithPtrs(store);
    if (this.b) e.b = this.b.deepCopyWithPtrs(store);
    return e;
  }

  // ── 61-bit params-used scoreboard ─────────────────────────────────────
  // Quick check: does this expr reference param h at all?
  // If not, skip PartialWrt entirely (returns zero trivially).
  paramsUsed(): bigint {
    if (this.op === ExprOp.PARAM) return 1n << BigInt(this.param % 61);
    const a = this.a?.paramsUsed() ?? 0n;
    const b = this.b?.paramsUsed() ?? 0n;
    return a | b;
  }

  dependsOn(h: hParam): boolean {
    if (this.op === ExprOp.PARAM) return this.param === h;
    return (this.a?.dependsOn(h) ?? false) || (this.b?.dependsOn(h) ?? false);
  }
}

// ── ExprVector helper: vector operations on expression trees ─────────────
export class ExprVector {
  constructor(public x: Expr, public y: Expr) {}

  static fromPoint(pt: SketchPoint, _ps: ParamStore): ExprVector {
    return new ExprVector(Expr.param(pt.px), Expr.param(pt.py));
  }

  plus (b: ExprVector): ExprVector { return new ExprVector(this.x.plus(b.x),  this.y.plus(b.y)); }
  minus(b: ExprVector): ExprVector { return new ExprVector(this.x.minus(b.x), this.y.minus(b.y)); }
  dot  (b: ExprVector): Expr { return this.x.times(b.x).plus(this.y.times(b.y)); }

  cross2d(b: ExprVector): Expr {
    // z-component of 2D cross: x1*y2 - y1*x2
    return this.x.times(b.y).minus(this.y.times(b.x));
  }

  magnitude(): Expr {
    return this.x.square().plus(this.y.square()).sqrt();
  }

  scaledBy(s: Expr): ExprVector {
    return new ExprVector(this.x.times(s), this.y.times(s));
  }

  withMagnitude(s: Expr): ExprVector {
    return this.scaledBy(s.div(this.magnitude()));
  }

  eval(): { x: number; y: number } {
    return { x: this.x.eval(), y: this.y.eval() };
  }
}
