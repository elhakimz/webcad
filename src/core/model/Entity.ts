
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export abstract class Entity {
  id: string
  layer: string = "0"
  constructor(id: string) {
    this.id = id
  }

  abstract move(dx: number, dy: number): void;
  abstract rotate(baseX: number, baseY: number, angleRad: number): void;
  abstract scale(baseX: number, baseY: number, factor: number): void;
  abstract mirror(p1: { x: number; y: number }, p2: { x: number; y: number }): void;
  abstract getBoundingBox(): BoundingBox;
  abstract clone(newId: string): Entity;
}
