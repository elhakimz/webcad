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
  public nextId = 1;

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

  load(params: Param[], nextId: number) {
    this.map.clear();
    for (const p of params) {
        this.map.set(p.h, new Param(p.h, p.val, p.known, p.free, p.substd));
    }
    this.nextId = nextId;
  }
}
