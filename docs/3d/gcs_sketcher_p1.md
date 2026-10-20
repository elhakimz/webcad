# GCS Sketcher — Implementation Roadmap

This roadmap builds the Geometric Constraint Solver sketcher for WebCAD from scratch,
incorporating lessons from SolveSpace's architecture, the CATIA interaction model review,
and the existing WebCAD codebase analysis. Each phase is a shippable unit that produces
visible value before the next phase begins.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Sketcher Sub-mode                            │
│                                                                     │
│  ┌───────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │  Sketch UI    │   │  Constraint Model │   │   Solver Core    │  │
│  │               │   │                  │   │                  │  │
│  │ SmartPick     │──▶│ Param(id, val)    │──▶│ 1. Substitution  │  │
│  │ DoF Colors    │   │ Entity(pts[])     │   │ 2. Single-eq     │  │
│  │ Dim Handles   │   │ Constraint(eq)    │   │ 3. Rank test     │  │
│  │ Constraint    │   │ Expr tree         │   │ 4. Newton-LM     │  │
│  │  Badges       │   │                  │   │                  │  │
│  └───────────────┘   └──────────────────┘   └──────────────────┘  │
│          │                    │                       │             │
│          └────────────────────┴───────────────────────┘             │
│                               │                                     │
│                        ┌──────▼──────┐                             │
│                        │  DAG Node   │  (extrude, revolve, etc.)   │
│                        │  execute()  │                             │
│                        └─────────────┘                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Core data model: handle-based parametric entities

**Goal:** Replace coordinate-by-value sketch entities with parameter-handle entities.
This is the foundation everything else depends on. Without it, constraints cannot
bind to geometry in a stable way.

### 1.1 Parameter store

Every free scalar in the sketch is a `Param`. The solver reads and writes `val`.

```typescript
// src/core/sketcher/Param.ts

export type hParam = number; // 32-bit integer handle

export class Param {
  constructor(
    public readonly h: hParam,
    public val: number,
    public known: boolean = false,  // true = already solved, don't touch
    public free:  boolean = false,  // true = unconstrained (for DoF display)
    public substd: hParam = 0,      // substitution target (see Phase 3)
  ) {}
}

export class ParamStore {
  private map = new Map<hParam, Param>();
  private nextId = 1;

  add(initialVal: number): hParam {
    const h = this.nextId++;
    this.map.set(h, new Param(h, initialVal));
    return h;
  }

  get(h: hParam): Param {
    const p = this.map.get(h);
    if (!p) throw new Error(`No param ${h}`);
    return p;
  }

  getAll(): Param[] { return [...this.map.values()]; }

  clearTags() { for (const p of this.map.values()) p.known = false; }
}
```

### 1.2 Point entity

A `SketchPoint` owns two `hParam` handles. When two entities share the same `SketchPoint`,
coincidence is structural — not a constraint. This is the single most important design
decision, directly from SolveSpace: shared point handles eliminate entire constraint equations.

```typescript
// src/core/sketcher/SketchPoint.ts

export type hEntity = number;

export class SketchPoint {
  constructor(
    public readonly h: hEntity,
    public readonly px: hParam,  // x coordinate param
    public readonly py: hParam,  // y coordinate param
    public construction: boolean = false,
    public fixed: boolean = false,  // anchor point — params marked known=true
  ) {}

  getNum(params: ParamStore): { x: number; y: number } {
    return { x: params.get(this.px).val, y: params.get(this.py).val };
  }

  forceToNum(x: number, y: number, params: ParamStore) {
    params.get(this.px).val = x;
    params.get(this.py).val = y;
  }
}
```

### 1.3 Geometric entities

Each entity stores an array of `hEntity` point handles — NOT coordinate values.
Connect two lines by giving them the same `hEntity` at their shared endpoint.

```typescript
// src/core/sketcher/SketchEntity.ts

export type SketchEntityType =
  | 'LINE_SEGMENT'
  | 'CIRCLE'
  | 'ARC_OF_CIRCLE'
  | 'CUBIC'
  | 'WORKPLANE';

export interface SketchEntity {
  h: hEntity;
  type: SketchEntityType;
  group: string;             // which feature group this belongs to
  workplane: hEntity;        // reference plane, or FREE_IN_3D sentinel
  point: hEntity[];          // [start, end] for line; [center, start, end] for arc
  normal?: hParam[];         // for workplane: quaternion params [w, vx, vy, vz]
  distance?: hParam;         // for circle: radius param
  construction: boolean;
  style: number;             // style slot (normal/selected/error/etc.)
}
```

### 1.4 Sketch document

```typescript
// src/core/sketcher/SketchDocument.ts

export class SketchDocument {
  readonly params  = new ParamStore();
  readonly points  = new Map<hEntity, SketchPoint>();
  readonly entities = new Map<hEntity, SketchEntity>();
  readonly constraints: ConstraintBase[] = [];

  private nextEntityId = 1;

  addPoint(x: number, y: number, fixed = false): SketchPoint {
    const h  = this.nextEntityId++;
    const px = this.params.add(x);
    const py = this.params.add(y);
    const pt = new SketchPoint(h, px, py, false, fixed);
    if (fixed) {
      this.params.get(px).known = true;
      this.params.get(py).known = true;
    }
    this.points.set(h, pt);
    return pt;
  }

  addLine(startPt: hEntity, endPt: hEntity): SketchEntity {
    const h: hEntity = this.nextEntityId++;
    const ent: SketchEntity = {
      h, type: 'LINE_SEGMENT',
      group: 'default', workplane: 0,
      point: [startPt, endPt],
      construction: false, style: STYLE.NORMAL,
    };
    this.entities.set(h, ent);
    return ent;
  }

  addCircle(centerPt: hEntity, radius: number): SketchEntity {
    const h: hEntity = this.nextEntityId++;
    const rParam = this.params.add(radius);
    const ent: SketchEntity = {
      h, type: 'CIRCLE',
      group: 'default', workplane: 0,
      point: [centerPt],
      distance: rParam,
      construction: false, style: STYLE.NORMAL,
    };
    this.entities.set(h, ent);
    return ent;
  }

  // Connect two entities at a shared point — no coincident constraint needed
  connectAt(entityA: hEntity, ptIndexA: number,
            entityB: hEntity, ptIndexB: number): void {
    const ea = this.entities.get(entityA)!;
    const eb = this.entities.get(entityB)!;
    // Entity B's point at ptIndexB is replaced with entity A's handle
    eb.point[ptIndexB] = ea.point[ptIndexA];
  }
}
```

**Deliverable after Phase 1:** A `SketchDocument` that can hold lines, arcs, and circles
with shared point handles, serializable and deserializable. No solver yet.

---

## Phase 2 — Symbolic expression system

**Goal:** Every constraint generates equations as expression trees. The Jacobian is
computed by automatic differentiation — no constraint type ever needs to manually
write a derivative.

This is the entire contents of SolveSpace's `expr.h` / `expr.cpp`, ported to TypeScript.

### 2.1 Expr node

```typescript
// src/core/sketcher/Expr.ts

export const enum ExprOp {
  PARAM    = 0,
  CONSTANT = 1,
  PLUS  = 10, MINUS  = 11, TIMES  = 12, DIV    = 13,
  NEGATE= 14, SQRT   = 15, SQUARE = 16,
  SIN   = 17, COS    = 18, ASIN   = 19, ACOS   = 20,
}

export class Expr {
  op:  ExprOp;
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
    }
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
      e.op = ExprOp.CONSTANT;
      return e;
    }
    if (fa?.op === ExprOp.CONSTANT && !fb) {
      const e = new Expr(); e.op = ExprOp.CONSTANT; e.a = fa;
      e.val = e.eval(); e.op = ExprOp.CONSTANT; return e;
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

  static fromPoint(pt: SketchPoint, ps: ParamStore): ExprVector {
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

  eval(ps: ParamStore): { x: number; y: number } {
    return { x: this.x.eval(), y: this.y.eval() };
  }
}
```

**Deliverable after Phase 2:** A working symbolic algebra system with automatic
differentiation, constant folding, and pointer-resolved hot-path evaluation.
Write unit tests: verify `partialWrt` against known analytical derivatives for
`sqrt(x²+y²)`, `atan2`, distance formulas.

---

## Phase 3 — Constraint equations

**Goal:** Every constraint type generates one or more `Equation` objects using the
`Expr` API from Phase 2. Adding a new constraint type is 10–30 lines of code.

### 3.1 Equation and constraint base

```typescript
// src/core/sketcher/Constraint.ts

export interface Equation {
  expr: Expr;    // equation = 0 (i.e. f(params) = 0)
  tag:  number;  // used by the solver to track substituted/solved eqs
}

export abstract class ConstraintBase {
  tag = 0;  // solver bookkeeping

  abstract generate(doc: SketchDocument): Equation[];

  protected addEq(eqs: Equation[], expr: Expr): void {
    eqs.push({ expr, tag: 0 });
  }

  // Modify the constraint's stored value so it matches current geometry
  // (used when applying a dimension to already-drawn geometry)
  abstract modifyToSatisfy(doc: SketchDocument): void;
}
```

### 3.2 All constraint types

```typescript
// src/core/sketcher/constraints/index.ts

// ── COINCIDENT ───────────────────────────────────────────────────────────
// Two points at the same location.
// Note: prefer shared hEntity handles. Use this only when connecting
// separately-drawn entities retroactively.
export class Coincident extends ConstraintBase {
  constructor(public ptA: hEntity, public ptB: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const pA = doc.points.get(this.ptA)!;
    const pB = doc.points.get(this.ptB)!;
    const eqs: Equation[] = [];
    this.addEq(eqs, Expr.param(pA.px).minus(Expr.param(pB.px)));
    this.addEq(eqs, Expr.param(pA.py).minus(Expr.param(pB.py)));
    return eqs;
  }

  modifyToSatisfy(_doc: SketchDocument) {}  // structural, nothing to modify
}

// ── HORIZONTAL ───────────────────────────────────────────────────────────
// y1 = y2  → y1 - y2 = 0
export class Horizontal extends ConstraintBase {
  constructor(public entityA: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const e   = doc.entities.get(this.entityA)!;
    const pA  = doc.points.get(e.point[0])!;
    const pB  = doc.points.get(e.point[1])!;
    return [{ expr: Expr.param(pA.py).minus(Expr.param(pB.py)), tag: 0 }];
  }

  modifyToSatisfy(doc: SketchDocument) {
    const e  = doc.entities.get(this.entityA)!;
    const pB = doc.points.get(e.point[1])!;
    const pA = doc.points.get(e.point[0])!;
    // Force B's y to match A's y
    doc.params.get(pB.py).val = doc.params.get(pA.py).val;
  }
}

// ── VERTICAL ─────────────────────────────────────────────────────────────
export class Vertical extends ConstraintBase {
  constructor(public entityA: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const e  = doc.entities.get(this.entityA)!;
    const pA = doc.points.get(e.point[0])!;
    const pB = doc.points.get(e.point[1])!;
    return [{ expr: Expr.param(pA.px).minus(Expr.param(pB.px)), tag: 0 }];
  }

  modifyToSatisfy(doc: SketchDocument) {
    const e  = doc.entities.get(this.entityA)!;
    const pB = doc.points.get(e.point[1])!;
    const pA = doc.points.get(e.point[0])!;
    doc.params.get(pB.px).val = doc.params.get(pA.px).val;
  }
}

// ── PT_PT_DISTANCE (Dimension) ────────────────────────────────────────────
// ||ptB - ptA|| = D
export class PtPtDistance extends ConstraintBase {
  constructor(public ptA: hEntity, public ptB: hEntity, public D: number) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const pA  = doc.points.get(this.ptA)!;
    const pB  = doc.points.get(this.ptB)!;
    const vA  = new ExprVector(Expr.param(pA.px), Expr.param(pA.py));
    const vB  = new ExprVector(Expr.param(pB.px), Expr.param(pB.py));
    const dist = vB.minus(vA).magnitude();
    return [{ expr: dist.minus(Expr.const_(this.D)), tag: 0 }];
  }

  modifyToSatisfy(doc: SketchDocument) {
    const pA = doc.points.get(this.ptA)!;
    const pB = doc.points.get(this.ptB)!;
    const { x: ax, y: ay } = pA.getNum(doc.params);
    const { x: bx, y: by } = pB.getNum(doc.params);
    this.D = Math.hypot(bx - ax, by - ay);
  }
}

// ── PARALLEL ─────────────────────────────────────────────────────────────
// Direction vectors of two lines are parallel: cross(dA, dB) = 0
export class Parallel extends ConstraintBase {
  constructor(public entityA: hEntity, public entityB: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const eA = doc.entities.get(this.entityA)!;
    const eB = doc.entities.get(this.entityB)!;
    const dA = this.lineDir(eA, doc);
    const dB = this.lineDir(eB, doc);
    return [{ expr: dA.cross2d(dB), tag: 0 }];
  }

  private lineDir(e: SketchEntity, doc: SketchDocument): ExprVector {
    const pA = doc.points.get(e.point[0])!;
    const pB = doc.points.get(e.point[1])!;
    return new ExprVector(
      Expr.param(pB.px).minus(Expr.param(pA.px)),
      Expr.param(pB.py).minus(Expr.param(pA.py)),
    );
  }

  modifyToSatisfy(_doc: SketchDocument) {}
}

// ── PERPENDICULAR ─────────────────────────────────────────────────────────
// dot(dA, dB) = 0
export class Perpendicular extends ConstraintBase {
  constructor(public entityA: hEntity, public entityB: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const eA = doc.entities.get(this.entityA)!;
    const eB = doc.entities.get(this.entityB)!;
    const dA = lineDir(eA, doc);
    const dB = lineDir(eB, doc);
    return [{ expr: dA.dot(dB), tag: 0 }];
  }

  modifyToSatisfy(_doc: SketchDocument) {}
}

// ── LINE-CIRCLE TANGENT ───────────────────────────────────────────────────
// dist(center, line) = radius
export class LineTangentCircle extends ConstraintBase {
  constructor(public line: hEntity, public circle: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const ln  = doc.entities.get(this.line)!;
    const cir = doc.entities.get(this.circle)!;
    const ptA = doc.points.get(ln.point[0])!;
    const ptB = doc.points.get(ln.point[1])!;
    const ctr = doc.points.get(cir.point[0])!;
    const r   = Expr.param(cir.distance!);

    // dir of line (unit vector)
    const d  = lineDir(ln, doc);
    const m  = d.magnitude();
    // vector from ptA to center
    const ac = new ExprVector(
      Expr.param(ctr.px).minus(Expr.param(ptA.px)),
      Expr.param(ctr.py).minus(Expr.param(ptA.py)),
    );
    // distance = |cross(ac, d)| / |d|
    const dist = ac.cross2d(d).div(m);

    // dist - r = 0  (or dist + r for the other tangency side)
    return [{ expr: dist.minus(r), tag: 0 }];
  }

  modifyToSatisfy(_doc: SketchDocument) {}
}

// ── ARC-LINE TANGENT ──────────────────────────────────────────────────────
// The arc's tangent vector at the endpoint is parallel to the line.
export class ArcLineTangent extends ConstraintBase {
  constructor(public arc: hEntity, public line: hEntity, public atStart: boolean) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const arcEnt  = doc.entities.get(this.arc)!;
    const lineEnt = doc.entities.get(this.line)!;

    // Arc tangent at start = perpendicular to radius-to-start
    const ctr  = doc.points.get(arcEnt.point[0])!;
    const endPt = doc.points.get(arcEnt.point[this.atStart ? 1 : 2])!;

    // Radial vector from center to endpoint
    const radial = new ExprVector(
      Expr.param(endPt.px).minus(Expr.param(ctr.px)),
      Expr.param(endPt.py).minus(Expr.param(ctr.py)),
    );
    // Tangent = perpendicular to radial: (-ry, rx)
    const tangent = new ExprVector(radial.y.negate(), radial.x);

    // Line direction
    const lineDirVec = lineDir(lineEnt, doc);

    // Tangent × linedir = 0  (parallel condition)
    return [{ expr: tangent.cross2d(lineDirVec), tag: 0 }];
  }

  modifyToSatisfy(_doc: SketchDocument) {}
}

// ── EQUAL LENGTH ─────────────────────────────────────────────────────────
export class EqualLength extends ConstraintBase {
  constructor(public entityA: hEntity, public entityB: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const lenA = lineLength(doc.entities.get(this.entityA)!, doc);
    const lenB = lineLength(doc.entities.get(this.entityB)!, doc);
    return [{ expr: lenA.minus(lenB), tag: 0 }];
  }

  modifyToSatisfy(_doc: SketchDocument) {}
}

// ── EQUAL RADIUS ─────────────────────────────────────────────────────────
export class EqualRadius extends ConstraintBase {
  constructor(public circleA: hEntity, public circleB: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const rA = Expr.param(doc.entities.get(this.circleA)!.distance!);
    const rB = Expr.param(doc.entities.get(this.circleB)!.distance!);
    return [{ expr: rA.minus(rB), tag: 0 }];
  }

  modifyToSatisfy(_doc: SketchDocument) {}
}

// ── SYMMETRIC (about a line) ──────────────────────────────────────────────
// ptA and ptB are symmetric about the midpoint of entityA
export class Symmetric extends ConstraintBase {
  constructor(public ptA: hEntity, public ptB: hEntity, public axisEntity: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const pA   = doc.points.get(this.ptA)!;
    const pB   = doc.points.get(this.ptB)!;
    const axis = doc.entities.get(this.axisEntity)!;
    const aS   = doc.points.get(axis.point[0])!;
    const aE   = doc.points.get(axis.point[1])!;
    // Midpoint of A and B lies on axis line (2 equations)
    // and AB is perpendicular to axis (1 equation)
    // → together: 3 scalar equations for 2D symmetry
    const midX = Expr.param(pA.px).plus(Expr.param(pB.px)).div(Expr.const_(2));
    const midY = Expr.param(pA.py).plus(Expr.param(pB.py)).div(Expr.const_(2));
    const mid  = new ExprVector(midX, midY);
    const axStart = new ExprVector(Expr.param(aS.px), Expr.param(aS.py));
    const axDir   = lineDir(axis, doc);
    // mid lies on axis: cross(mid - axStart, axDir) = 0
    const midRel = mid.minus(axStart);
    const onAxis = midRel.cross2d(axDir);
    // AB perpendicular to axis: dot(AB, axDir) = 0
    const ab = new ExprVector(
      Expr.param(pB.px).minus(Expr.param(pA.px)),
      Expr.param(pB.py).minus(Expr.param(pA.py)),
    );
    const perp = ab.dot(axDir);
    return [
      { expr: onAxis, tag: 0 },
      { expr: perp,   tag: 0 },
    ];
  }

  modifyToSatisfy(_doc: SketchDocument) {}
}

// ── MIDPOINT ─────────────────────────────────────────────────────────────
// pt lies at the midpoint of entityA
export class Midpoint extends ConstraintBase {
  constructor(public pt: hEntity, public entityA: hEntity) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const p   = doc.points.get(this.pt)!;
    const ent = doc.entities.get(this.entityA)!;
    const pS  = doc.points.get(ent.point[0])!;
    const pE  = doc.points.get(ent.point[1])!;
    const midX = Expr.param(pS.px).plus(Expr.param(pE.px)).div(Expr.const_(2));
    const midY = Expr.param(pS.py).plus(Expr.param(pE.py)).div(Expr.const_(2));
    return [
      { expr: Expr.param(p.px).minus(midX), tag: 0 },
      { expr: Expr.param(p.py).minus(midY), tag: 0 },
    ];
  }

  modifyToSatisfy(_doc: SketchDocument) {}
}

// ── WHERE_DRAGGED (temporary drag anchor) ────────────────────────────────
// Pins ptA to (tx, ty) during interactive drag.
// Added on mousedown, removed on mouseup.
export class WhereDragged extends ConstraintBase {
  constructor(public pt: hEntity, public tx: number, public ty: number) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const p = doc.points.get(this.pt)!;
    return [
      { expr: Expr.param(p.px).minus(Expr.const_(this.tx)), tag: 0 },
      { expr: Expr.param(p.py).minus(Expr.const_(this.ty)), tag: 0 },
    ];
  }

  modifyToSatisfy(_doc: SketchDocument) {}
}

// ── ANGLE between two lines ────────────────────────────────────────────
// angle between direction vectors = valA (degrees)
export class Angle extends ConstraintBase {
  constructor(
    public entityA: hEntity,
    public entityB: hEntity,
    public valA: number,  // degrees
  ) { super(); }

  generate(doc: SketchDocument): Equation[] {
    const eA = doc.entities.get(this.entityA)!;
    const eB = doc.entities.get(this.entityB)!;
    const dA = lineDir(eA, doc);
    const dB = lineDir(eB, doc);
    // cos(θ) = dot(dA,dB) / (|dA|*|dB|)
    const cosVal = Expr.const_(Math.cos(this.valA * Math.PI / 180));
    const dot    = dA.dot(dB);
    const mags   = dA.magnitude().times(dB.magnitude());
    return [{ expr: dot.div(mags).minus(cosVal), tag: 0 }];
  }

  modifyToSatisfy(doc: SketchDocument) {
    const eA = doc.entities.get(this.entityA)!;
    const eB = doc.entities.get(this.entityB)!;
    const { x: ax, y: ay } = lineDir(eA, doc).eval(doc.params);
    const { x: bx, y: by } = lineDir(eB, doc).eval(doc.params);
    const cos = (ax*bx + ay*by) / (Math.hypot(ax,ay) * Math.hypot(bx,by));
    this.valA = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────
function lineDir(e: SketchEntity, doc: SketchDocument): ExprVector {
  const pA = doc.points.get(e.point[0])!;
  const pB = doc.points.get(e.point[1])!;
  return new ExprVector(
    Expr.param(pB.px).minus(Expr.param(pA.px)),
    Expr.param(pB.py).minus(Expr.param(pA.py)),
  );
}

function lineLength(e: SketchEntity, doc: SketchDocument): Expr {
  return lineDir(e, doc).magnitude();
}
```

**Deliverable after Phase 3:** All constraint types generate equations. Write tests
that verify `generate()` returns `eval() ≈ 0` for geometry that satisfies the constraint,
and `eval() ≠ 0` for geometry that doesn't.

---

## Phase 4 — Solver core

**Goal:** The three-stage solver from SolveSpace, producing correct DoF count and
error classification as outputs alongside solved parameter values.

```typescript
// src/core/sketcher/System.ts

const MAX_UNKNOWNS    = 1024;
const CONVERGE_TOL    = 1e-10;  // << LENGTH_EPS
const RANK_MAG_TOL    = 1e-4;
const MAX_ITER        = 50;

export const enum SolveResult {
  SOLVED_OKAY        = 0,
  DIDNT_CONVERGE     = 1,
  SINGULAR_JACOBIAN  = 2,  // over-constrained
  TOO_MANY_UNKNOWNS  = 3,
}

export interface SolveOutput {
  result: SolveResult;
  dof: number;                  // degrees of freedom remaining
  redundant: ConstraintBase[];  // constraints to remove to fix over-constraint
  freeParams: hParam[];         // params with no binding constraint
}

export class System {
  // Working copies — built fresh each solve
  private params:    Param[]    = [];
  private equations: Equation[] = [];

  // Jacobian matrix (dense, MAX_UNKNOWNS × MAX_UNKNOWNS)
  private mat = {
    param: new Int32Array(MAX_UNKNOWNS),     // which param each column represents
    eq:    new Array<Equation>(MAX_UNKNOWNS), // which equation each row represents
    m: 0, n: 0,                               // rows, cols
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

  setDragged(params: hParam[]) {
    this.dragged = new Set(params);
  }

  solve(doc: SketchDocument): SolveOutput {
    // Collect all free params and all equations
    this.params    = doc.params.getAll().filter(p => !p.known);
    this.equations = [];
    for (const c of doc.constraints) {
      this.equations.push(...c.generate(doc));
    }

    doc.params.clearTags();

    // ── Stage 1: Substitution ─────────────────────────────────────────
    // Equations of the form "paramA - paramB = 0": substitute A→B everywhere
    this.solveBySubstitution();

    // ── Stage 2: Single-equation pre-solve ───────────────────────────
    // Any equation that references exactly one free param: solve immediately
    const alone: ConstraintBase[] = [];
    let aloneTag = 1;
    for (const eq of this.equations) {
      if (eq.tag !== 0) continue;
      const hp = this.referencedSingleParam(eq.expr);
      if (hp === null) continue;
      const p = doc.params.get(hp);
      if (p.known) continue;  // already solved — rank test will catch inconsistency

      eq.tag = aloneTag;
      p.known = true;
      this.writeAndSolveJacobian([aloneTag]);
      aloneTag++;
    }

    // ── Stage 3: Rank test + full Newton ─────────────────────────────
    this.writeJacobian(0);
    if (this.mat.m > MAX_UNKNOWNS || this.mat.n > MAX_UNKNOWNS) {
      return { result: SolveResult.TOO_MANY_UNKNOWNS, dof: 0, redundant: [], freeParams: [] };
    }

    this.evalJacobian();
    const rank = this.calculateRank();

    if (rank !== this.mat.m) {
      // Over-constrained: find which constraints conflict
      const redundant = this.findRedundant(doc);
      return { result: SolveResult.SINGULAR_JACOBIAN, dof: 0, redundant, freeParams: [] };
    }

    const dof = this.mat.n - this.mat.m;

    if (!this.newtonSolve(0)) {
      return { result: SolveResult.DIDNT_CONVERGE, dof, redundant: [], freeParams: [] };
    }

    // Copy solved values back to the param store
    this.applySolution(doc);

    // Find free params (dof > 0: unconstrained geometry)
    const freeParams = this.findFreeParams(doc);

    return { result: SolveResult.SOLVED_OKAY, dof, redundant: [], freeParams };
  }

  // ── Stage 1 implementation ─────────────────────────────────────────────
  private solveBySubstitution() {
    for (const eq of this.equations) {
      const expr = eq.expr;
      // Pattern: PARAM_A - PARAM_B = 0
      if (expr.op !== ExprOp.MINUS) continue;
      if (expr.a?.op !== ExprOp.PARAM) continue;
      if (expr.b?.op !== ExprOp.PARAM) continue;

      let a = expr.a.param;
      let b = expr.b.param;

      // Prefer substituting the non-dragged parameter
      if (this.dragged.has(a)) { const t = a; a = b; b = t; }

      // Replace all references to 'a' with 'b'
      for (const e2 of this.equations) {
        e2.expr.substitute(a, b);
      }

      eq.tag = -1;  // EQ_SUBSTITUTED
    }
  }

  // ── Stage 2 helper ─────────────────────────────────────────────────────
  // Returns the single hParam this expr references, or null if 0 or >1
  private referencedSingleParam(expr: Expr): hParam | null {
    const used = this.collectParams(expr);
    const free = used.filter(h => !this.isParamKnown(h));
    return free.length === 1 ? free[0] : null;
  }

  private collectParams(expr: Expr, out: hParam[] = []): hParam[] {
    if (expr.op === ExprOp.PARAM && !out.includes(expr.param)) out.push(expr.param);
    if (expr.a) this.collectParams(expr.a, out);
    if (expr.b) this.collectParams(expr.b, out);
    return out;
  }

  // ── Jacobian building ──────────────────────────────────────────────────
  private writeJacobian(tag: number) {
    // Collect free parameters (columns)
    const freeCols: hParam[] = [];
    for (const p of this.params) {
      if (p.known || p.tag !== 0) continue;
      freeCols.push(p.h);
    }
    this.mat.n = freeCols.length;
    freeCols.forEach((h, j) => { this.mat.param[j] = h; });

    // Collect equations with matching tag (rows)
    const rows = this.equations.filter(e => e.tag === tag);
    this.mat.m = rows.length;

    for (let i = 0; i < rows.length; i++) {
      // Resolve params to pointers for fast eval
      const f = rows[i].expr.foldConstants().deepCopyWithPtrs(
        /* paramStore — need to thread this through */ null as any
      );
      const scoreboard = f.paramsUsed();

      for (let j = 0; j < this.mat.n; j++) {
        const h = this.mat.param[j];
        let pd: Expr;
        if ((scoreboard & (1n << BigInt(h % 61))) !== 0n && f.dependsOn(h)) {
          pd = f.partialWrt(h).foldConstants();
        } else {
          pd = Expr.const_(0);
        }
        this.mat.A.sym[i][j] = pd;
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

  // ── Rank via Gram-Schmidt ──────────────────────────────────────────────
  private calculateRank(): number {
    const tol = RANK_MAG_TOL * RANK_MAG_TOL;
    const rowMag = new Float64Array(this.mat.m);
    let rank = 0;

    for (let i = 0; i < this.mat.m; i++) {
      // Subtract projection onto previous rows
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

  // ── Newton–Raphson (Levenberg-Marquardt via least-squares) ─────────────
  private newtonSolve(tag: number): boolean {
    let converged = false;

    // Initial function evaluation
    for (let i = 0; i < this.mat.m; i++) {
      this.mat.B.num[i] = this.mat.B.sym[i].eval();
    }

    for (let iter = 0; iter < MAX_ITER && !converged; iter++) {
      this.evalJacobian();
      if (!this.solveLeastSquares()) return false;

      // Apply Newton step: x_{n+1} = x_n - J^{-1} F(x_n)
      for (let j = 0; j < this.mat.n; j++) {
        const p = this.getParamByColumn(j);
        p.val -= this.mat.X[j];
        if (!isFinite(p.val)) return false;
      }

      // Re-evaluate
      converged = true;
      for (let i = 0; i < this.mat.m; i++) {
        this.mat.B.num[i] = this.mat.B.sym[i].eval();
        if (!isFinite(this.mat.B.num[i])) return false;
        if (Math.abs(this.mat.B.num[i]) > CONVERGE_TOL) converged = false;
      }
    }

    return converged;
  }

  // ── Least-squares: min ||dx||² s.t. J dx = -F ─────────────────────────
  // Scales dragged params to encourage smaller steps on those columns.
  private solveLeastSquares(): boolean {
    // Column scaling: dragged params prefer small changes
    for (let c = 0; c < this.mat.n; c++) {
      const h = this.mat.param[c];
      this.mat.scale[c] = this.dragged.has(h) ? 1 / 20 : 1;
      for (let r = 0; r < this.mat.m; r++) this.mat.A.num[r][c] *= this.mat.scale[c];
    }

    // Form A * A^T
    for (let r = 0; r < this.mat.m; r++) {
      for (let c = 0; c < this.mat.m; c++) {
        let sum = 0;
        for (let k = 0; k < this.mat.n; k++) sum += this.mat.A.num[r][k] * this.mat.A.num[c][k];
        this.mat.AAt[r][c] = sum;
      }
    }

    if (!this.solveLinear(this.mat.Z, this.mat.AAt, this.mat.B.num, this.mat.m)) return false;

    // X = A^T * Z * scale
    for (let c = 0; c < this.mat.n; c++) {
      let sum = 0;
      for (let r = 0; r < this.mat.m; r++) sum += this.mat.A.num[r][c] * this.mat.Z[r];
      this.mat.X[c] = sum * this.mat.scale[c];
    }
    return true;
  }

  // ── Gaussian elimination with partial pivot ───────────────────────────
  private solveLinear(X: Float64Array, A: Float64Array[], B: Float64Array, n: number): boolean {
    // Work on copies
    const Ac = A.map(row => Float64Array.from(row));
    const Bc = Float64Array.from(B);

    for (let i = 0; i < n; i++) {
      let imax = i, max = Math.abs(Ac[i][i]);
      for (let ip = i + 1; ip < n; ip++) {
        if (Math.abs(Ac[ip][i]) > max) { max = Math.abs(Ac[ip][i]); imax = ip; }
      }
      if (max < 1e-20) return false;

      // Swap rows i and imax
      const tmp = Ac[i]; Ac[i] = Ac[imax]; Ac[imax] = tmp;
      const bt = Bc[i]; Bc[i] = Bc[imax]; Bc[imax] = bt;

      for (let ip = i + 1; ip < n; ip++) {
        const f = Ac[ip][i] / Ac[i][i];
        for (let jp = i; jp < n; jp++) Ac[ip][jp] -= f * Ac[i][jp];
        Bc[ip] -= f * Bc[i];
      }
    }

    // Back-substitution
    for (let i = n - 1; i >= 0; i--) {
      if (Math.abs(Ac[i][i]) < 1e-20) return false;
      let s = Bc[i];
      for (let j = i + 1; j < n; j++) s -= X[j] * Ac[i][j];
      X[i] = s / Ac[i][i];
    }
    return true;
  }

  private findRedundant(doc: SketchDocument): ConstraintBase[] {
    // Try removing each constraint one at a time; if rank recovers, it's redundant
    const redundant: ConstraintBase[] = [];
    for (const c of doc.constraints) {
      const saved = this.equations.filter(e => doc.constraints.indexOf(c) >= 0);
      // ... (bisection approach: remove c, re-check rank)
      // Full implementation omitted for brevity — same pattern as SolveSpace
      // FindWhichToRemoveToFixJacobian
    }
    return redundant;
  }

  private findFreeParams(doc: SketchDocument): hParam[] {
    // Any param not referenced by any equation is free (under-constrained)
    const referenced = new Set<hParam>();
    for (const eq of this.equations) this.collectParams(eq.expr).forEach(h => referenced.add(h));
    return this.params.filter(p => !p.known && !referenced.has(p.h)).map(p => p.h);
  }

  private isParamKnown(h: hParam): boolean {
    return this.params.find(p => p.h === h)?.known ?? true;
  }

  private getParamByColumn(j: number): Param {
    return this.params.find(p => p.h === this.mat.param[j])!;
  }

  private writeAndSolveJacobian(tags: number[]) {
    // Build and solve for a single-equation sub-system (Stage 2)
    this.writeJacobian(tags[0]);
    this.evalJacobian();
    this.newtonSolve(tags[0]);
  }

  private applySolution(_doc: SketchDocument) {
    // Parameter values are mutated in-place during Newton; nothing extra needed
  }
}
```

**Deliverable after Phase 4:** `system.solve(doc)` returns `SOLVED_OKAY` with `dof=0`
for a fully-constrained rectangle. Returns `dof=2` for a free-floating line. Returns
`SINGULAR_JACOBIAN` when you add a redundant horizontal+horizontal constraint.

---

## Phase 5 — DoF visualization and constraint badges

**Goal:** The visual feedback system that makes the solver meaningful to the user.
This is what separates a working solver from a usable sketcher.

### 5.1 Style system

```typescript
// src/core/sketcher/SketchStyle.ts

export const STYLE = {
  NORMAL:       1,  // unconstrained entity — white/light gray
  UNDERCONSTRAINED: 2,  // has free params — blue (SolveSpace / CATIA standard)
  FULLYCONSTRAINED: 3,  // dof=0, solved — green
  OVERCONSTRAINED:  4,  // singular Jacobian — red
  CONSTRUCTION: 5,  // construction geometry — darker, dashed
  SELECTED:     6,  // orange highlight
  HOVERED:      7,  // dim orange
  DRAW_ERROR:   8,  // failed regen — red with stipple
} as const;
```

### 5.2 Updating styles from solve output

```typescript
// After each solve:
function applyDoFColors(doc: SketchDocument, result: SolveOutput) {
  const freeSet = new Set(result.freeParams);

  for (const [h, ent] of doc.entities) {
    if (ent.construction) { ent.style = STYLE.CONSTRUCTION; continue; }

    if (result.result === SolveResult.SINGULAR_JACOBIAN) {
      // Check if this entity's params are in the redundant set
      const isRedundant = result.redundant.some(c => constraintAffects(c, h, doc));
      ent.style = isRedundant ? STYLE.OVERCONSTRAINED : STYLE.NORMAL;
      continue;
    }

    // Check if any of this entity's params are free (under-constrained)
    const entityParams = getEntityParams(ent, doc);
    const hasFree = entityParams.some(h => freeSet.has(h));
    ent.style = hasFree ? STYLE.UNDERCONSTRAINED : STYLE.FULLYCONSTRAINED;
  }
}
```

### 5.3 Constraint badge rendering

Each constraint renders a small indicator on the sketch. Defer to the existing
`Viewer.ts` canvas but add a dedicated constraint overlay layer:

| Constraint | Badge |
|---|---|
| Horizontal | `—` |
| Vertical | `\|` |
| Parallel | `=` (two parallel tick marks on lines) |
| Perpendicular | `⊾` |
| Tangent | `◌` |
| Equal length | `=` ticks on each line |
| Midpoint | diamond at midpoint |
| Fixed | padlock |
| Symmetric | `↔` |

**Deliverable after Phase 5:** Three colors visible in the sketch viewport matching
CATIA's under/fully/over-constrained visual language. Constraint badges rendered on
the sketch overlay canvas.

---

## Phase 6 — SmartPick inference and interactive drag

### 6.1 SmartPick during drawing

As the user moves the cursor while drawing a new entity, infer geometric relationships
from the existing sketch and show visual hints without enforcing them:

```typescript
// src/core/sketcher/SmartPick.ts

export interface Inference {
  type: 'horizontal' | 'vertical' | 'parallel' | 'perpendicular'
      | 'coincident' | 'tangent' | 'midpoint';
  snappedPoint?: { x: number; y: number };
  targetEntity?: hEntity;
  renderHint: InferenceHint;  // dashed line from reference to cursor
}

export function computeInferences(
  cursor: { x: number; y: number },
  doc: SketchDocument,
  currentDrawing: Partial<SketchEntity>,
  snapTolerance = 8  // pixels
): Inference[] {
  const inferences: Inference[] = [];

  // Horizontal / vertical snap to existing points
  for (const [, pt] of doc.points) {
    const { x, y } = pt.getNum(doc.params);
    if (Math.abs(cursor.y - y) < snapTolerance) {
      inferences.push({
        type: 'horizontal',
        snappedPoint: { x: cursor.x, y },
        renderHint: { from: { x, y }, to: cursor, style: 'dashed-blue' },
      });
    }
    if (Math.abs(cursor.x - x) < snapTolerance) {
      inferences.push({
        type: 'vertical',
        snappedPoint: { x, y: cursor.y },
        renderHint: { from: { x, y }, to: cursor, style: 'dashed-blue' },
      });
    }
  }
  // ... parallel, perpendicular, tangent inferences
  return inferences;
}
```

### 6.2 Drag with WHERE_DRAGGED + column scaling

```typescript
// In the sketcher mouse handler:

onDragStart(pt: hEntity, x: number, y: number) {
  // Add temporary drag anchor constraint
  const drag = new WhereDragged(pt, x, y);
  this.doc.constraints.push(drag);
  this.activeDrag = drag;

  // Mark dragged params for column scaling
  const p = this.doc.points.get(pt)!;
  this.system.setDragged([p.px, p.py]);
}

onDragMove(x: number, y: number) {
  if (!this.activeDrag) return;
  // Update the anchor position
  this.activeDrag.tx = x;
  this.activeDrag.ty = y;
  // Re-solve — sketch moves to satisfy constraints with dragged point near cursor
  const result = this.system.solve(this.doc);
  this.viewer.updateSketchGeometry(this.doc);
  applyDoFColors(this.doc, result);
}

onDragEnd() {
  if (!this.activeDrag) return;
  // Remove temporary constraint
  const idx = this.doc.constraints.indexOf(this.activeDrag);
  this.doc.constraints.splice(idx, 1);
  this.activeDrag = null;
  this.system.setDragged([]);
  // Final solve
  this.system.solve(this.doc);
}
```

**Deliverable after Phase 6:** Dragging a constrained sketch point moves the geometry
in real time while constraints are maintained. SmartPick shows dashed inference lines
as the user draws.

---

## Phase 7 — Sketcher viewport sub-mode

The sketcher is a **hard mode switch** (from CATIA interaction review): its own event
loop, its own selection rules, its own undo segment.

```typescript
// src/core/sketcher/SketcherMode.ts

export class SketcherMode {
  private doc: SketchDocument;
  private system = new System();
  private activeCommand: SketchCommand | null = null;
  private undoStack: SketchSnapshot[] = [];

  enter(workplane: WorkplaneDefinition, viewer: Viewer, app: App) {
    // Lock viewport to workplane
    viewer.setSketcherPlane(workplane);
    // Replace app's event handlers with sketcher's
    app.pushInputMode(this);
    // Show constraint toolbar, hide 3D gizmos
    app.ui.setSketcherUI(true);
  }

  exit(commit: boolean) {
    if (commit) {
      // Validate: all loops closed, no self-intersection
      const valid = this.validate();
      if (!valid.ok) { app.showError(valid.message); return; }
      // Return the sketch profile to the calling feature (extrude, revolve, etc.)
      this.onCommit?.(this.buildProfile());
    }
    app.popInputMode();
    app.ui.setSketcherUI(false);
    // Entire sketch operation is one undo unit from the 3D perspective
  }

  handleClick(x: number, y: number, snap: SnapResult) {
    if (!this.activeCommand) return;
    this.activeCommand.onPoint(x, y, snap, this.doc);
    this.solveAndRedraw();
  }

  private solveAndRedraw() {
    const result = this.system.solve(this.doc);
    applyDoFColors(this.doc, result);
    this.viewer.updateSketchGeometry(this.doc);
    this.viewer.updateConstraintBadges(this.doc);
    this.app.ui.updateDofDisplay(result.dof);
  }

  undo() {
    const snap = this.undoStack.pop();
    if (snap) this.restoreSnapshot(snap);
  }

  // Snapshot = deep copy of params + constraint list (not geometry objects)
  snapshot(): SketchSnapshot {
    return {
      paramValues: new Map([...this.doc.params.getAll().map(p => [p.h, p.val])]),
      constraints: [...this.doc.constraints],
    };
  }
}
```

**Deliverable after Phase 7:** Full enter/exit sketcher sub-mode. Clicking OK commits
the sketch profile to a feature. Clicking Cancel discards. The 3D history bar adds
one entry for the entire sketch operation.

---

## Phase 8 — Integration with the parametric DAG

```typescript
// src/core/dag/FeatureNode.ts

export interface SketchFeatureNode extends FeatureNode {
  type: 'sketch';
  doc: SketchDocument;    // the sketch with all its constraints
  workplane: WorkplaneDefinition;

  execute(): SketchProfile {
    // Re-solve the sketch (params may have been changed by upstream features)
    const system = new System();
    const result = system.solve(this.doc);
    if (result.result !== SolveResult.SOLVED_OKAY) {
      this.style = STYLE.DRAW_ERROR;
      throw new Error(`Sketch failed to solve: dof=${result.dof}`);
    }
    return this.buildProfile(this.doc);
  }
}
```

When a sketch's workplane moves (because a prior extrude parameter changed), the
sketch's constraint equations reference that workplane's origin parameters. The solver
re-runs automatically because those params changed, recomputing the 2D geometry in
the new plane. The profile feeds the extrude, which re-runs OCC, producing updated 3D geometry.

**Deliverable after Phase 8:** Changing the height of extrude 1 causes sketch 2
(on extrude 1's top face) to re-solve and re-extrude correctly.

---

## Implementation order and test milestones

```
Week 1–2   Phase 1: ParamStore + SketchPoint + SketchEntity + SketchDocument
           Test: serialize/deserialize a rectangle with shared corner points

Week 3     Phase 2: Expr + ExprVector + PartialWrt
           Test: PartialWrt on distance formula matches numerical gradient

Week 4–5   Phase 3: All constraint types
           Test: each constraint generates eval()≈0 for satisfying geometry

Week 6–7   Phase 4: System.solve() — stages 1, 2, 3
           Test: rectangle fully constrained → SOLVED_OKAY, dof=0
           Test: over-constrained → SINGULAR_JACOBIAN
           Test: free line → dof=4

Week 8     Phase 5: DoF colors + constraint badges
           Visual: blue/green/red sketch in viewport

Week 9–10  Phase 6: SmartPick + WHERE_DRAGGED drag
           Interactive: drag a constrained point, sketch updates live

Week 11–12 Phase 7: SketcherMode sub-mode (enter/exit/undo)
           Integration: CMD SKETCH enters sketcher, CMD EXTRUDE picks up the profile

Week 13–14 Phase 8: DAG integration
           Full parametric: edit sketch → extrude updates → boolean updates
```

---

## Key decisions carried from SolveSpace

| Decision | Rationale |
|---|---|
| Shared `hEntity` for coincident points | Eliminates coincident equations; structural correctness |
| Substitution before Newton | Eliminates majority of equations for free on most sketches |
| Single-equation pre-solve before rank test | H/V constraints never hit the full Jacobian |
| Rank via Gram-Schmidt (not SVD) | O(n²) but sufficient; SVD overkill for sketch sizes |
| `WHERE_DRAGGED` as a constraint | Drag integrates cleanly; no special solver path |
| Column scaling for dragged params | The rubber-band feel during constrained drag |
| `foldConstants()` before Newton loop | Removes constant-folding overhead from inner Eval() |
| `deepCopyWithPtrs()` before Newton loop | Replaces Map.get() with direct pointer per Eval() call |
