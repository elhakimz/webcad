import { Entity, BoundingBox, Grip } from "./Entity";
import { rotatePoint, Point } from "../engine/MathUtils";

export class Insert extends Entity {
  blockName: string;
  x: number;
  y: number;
  z: number;
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
    rotation = 0,
    z = 0
  ) {
    super(id);
    this.blockName = blockName.toUpperCase();
    this.x = x;
    this.y = y;
    this.z = z;
    this.scaleX = scaleX;
    this.scaleY = scaleY;
    this.rotation = rotation;
  }

  move(dx: number, dy: number, dz = 0) {
    this.x += dx;
    this.y += dy;
    this.z += dz;
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

  mirror(_p1: Point, _p2: Point) {
      throw new Error("Mirror on Insert not yet supported");
  }

  static getBlockCallback?: (blockName: string) => { entities: Entity[], basePoint: { x: number, y: number } } | null | undefined;

  getBoundingBox(): BoundingBox {
    if (Insert.getBlockCallback) {
      const block = Insert.getBlockCallback(this.blockName);
      if (block && block.entities.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        block.entities.forEach(e => {
          const box = e.getBoundingBox();
          minX = Math.min(minX, box.minX - block.basePoint.x);
          minY = Math.min(minY, box.minY - block.basePoint.y);
          maxX = Math.max(maxX, box.maxX - block.basePoint.x);
          maxY = Math.max(maxY, box.maxY - block.basePoint.y);
        });

        // Apply scale
        let bMinX = minX * this.scaleX;
        let bMaxX = maxX * this.scaleX;
        if (bMinX > bMaxX) {
          const temp = bMinX; bMinX = bMaxX; bMaxX = temp;
        }
        let bMinY = minY * this.scaleY;
        let bMaxY = maxY * this.scaleY;
        if (bMinY > bMaxY) {
          const temp = bMinY; bMinY = bMaxY; bMaxY = temp;
        }

        // Apply rotation to bounding box corners and find new bounding box
        const angleRad = this.rotation * (Math.PI / 180);
        const corners = [
          { x: bMinX, y: bMinY },
          { x: bMaxX, y: bMinY },
          { x: bMinX, y: bMaxY },
          { x: bMaxX, y: bMaxY }
        ];

        let rotMinX = Infinity, rotMinY = Infinity, rotMaxX = -Infinity, rotMaxY = -Infinity;
        corners.forEach(c => {
          // Rotate around (0, 0)
          const rx = c.x * Math.cos(angleRad) - c.y * Math.sin(angleRad);
          const ry = c.x * Math.sin(angleRad) + c.y * Math.cos(angleRad);
          // Shift by insertion point
          const wx = rx + this.x;
          const wy = ry + this.y;
          rotMinX = Math.min(rotMinX, wx);
          rotMinY = Math.min(rotMinY, wy);
          rotMaxX = Math.max(rotMaxX, wx);
          rotMaxY = Math.max(rotMaxY, wy);
        });

        return {
          minX: rotMinX,
          minY: rotMinY,
          maxX: rotMaxX,
          maxY: rotMaxY
        };
      }
    }
    
    // Fallback to small box around insertion point
    const size = 1.0; 
    return {
      minX: this.x - size,
      minY: this.y - size,
      maxX: this.x + size,
      maxY: this.y + size
    };
  }

  clone(newId: string): Insert {
    const copy = new Insert(newId, this.blockName, this.x, this.y, this.scaleX, this.scaleY, this.rotation, this.z);
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }

  getGrips(): Grip[] {
    return [
      { id: 'origin', point: { x: this.x, y: this.y, z: this.z } as any, type: 'center' }
    ];
  }

  moveGrip(gripId: string, newPosition: { x: number; y: number; z?: number }): void {
    if (gripId === 'origin') {
      this.x = newPosition.x;
      this.y = newPosition.y;
      if (newPosition.z !== undefined) this.z = newPosition.z;
    }
  }
}
