export class Scope {
  private values: Map<string, any> = new Map();
  private parent: Scope | null = null;

  constructor(parent: Scope | null = null) {
    this.parent = parent;
  }

  set(name: string, value: any) {
    this.values.set(name, value);
  }

  get(name: string): any {
    if (this.values.has(name)) {
      return this.values.get(name);
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    return undefined; // OpenSCAD returns undef for unknown variables
  }

  extend(): Scope {
    return new Scope(this);
  }
}
