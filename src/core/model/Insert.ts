import { Entity, BoundingBox } from "./Entity";
import { rotatePoint, Point } from "../engine/MathUtils";

export class Insert extends Entity {
  blockName: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // In degrees, following AutoCAD convention for Insert

  constructor(
    id: string, 
    blockName: string, 
    x: number, 
    y: number, 
    scaleX = 1, 
    scaleY = 1, 
    rotation = 0
  ) {
    super(id);
    this.blockName = blockName.toUpperCase();
    this.x = x;
    this.y = y;
    this.scaleX = scaleX;
    this.scaleY = scaleY;
    this.rotation = rotation;
  }

  move(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    const p = rotatePoint(this.x, this.y, baseX, baseY, angleRad);
    this.x = p.x;
    this.y = p.y;
    this.rotation += angleRad * (180 / Math.PI);
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.x = baseX + (this.x - baseX) * factor;
    this.y = baseY + (this.y - baseY) * factor;
    this.scaleX *= factor;
    this.scaleY *= factor;
  }

  mirror(p1: Point, p2: Point) {
      // Insertion point mirror is standard
      // But full block mirroring requires scale inversion or rotation flip
      // For now, mirror the insertion point.
      this.x = this.x; // TODO: Implement full mirror math
      this.y = this.y;
  }

  getBoundingBox(): BoundingBox {
    // For broad-phase selection, we return a small box around insertion point.
    // Ideally, this should query the block definition and transform its cumulative box.
    const size = 1.0; 
    return {
      minX: this.x - size,
      minY: this.y - size,
      maxX: this.x + size,
      maxY: this.y + size
    };
  }

  clone(newId: string): Insert {
    const copy = new Insert(newId, this.blockName, this.x, this.y, this.scaleX, this.scaleY, this.rotation);
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }
}
