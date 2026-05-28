import { Entity, BoundingBox, Grip } from "./Entity";
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils";

export class ImagePlane extends Entity {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
  imageUrl: string;
  displayMode: 'STRETCH' | 'FIT' | 'ZOOM';
  zoomFactor: number;
  opacity: number;

  constructor(
    id: string,
    cx: number,
    cy: number,
    width: number,
    height: number,
    rotation: number = 0,
    imageUrl: string = "",
    displayMode: 'STRETCH' | 'FIT' | 'ZOOM' = 'FIT',
    zoomFactor: number = 1.0,
    opacity: number = 0.75,
    elevation: number = 0,
    thickness: number = 0
  ) {
    super(id);
    this.cx = cx;
    this.cy = cy;
    this.width = width;
    this.height = height;
    this.rotation = rotation;
    this.imageUrl = imageUrl;
    this.displayMode = displayMode;
    this.zoomFactor = zoomFactor;
    this.opacity = opacity;
    this.elevation = elevation;
    this.thickness = thickness;
  }

  move(dx: number, dy: number): void {
    this.cx += dx;
    this.cy += dy;
  }

  rotate(baseX: number, baseY: number, angleRad: number): void {
    const pt = rotatePoint(this.cx, this.cy, baseX, baseY, angleRad);
    this.cx = pt.x;
    this.cy = pt.y;
    this.rotation += angleRad;
  }

  scale(baseX: number, baseY: number, factor: number): void {
    this.cx = baseX + (this.cx - baseX) * factor;
    this.cy = baseY + (this.cy - baseY) * factor;
    this.width *= factor;
    this.height *= factor;
    this.zoomFactor *= factor;
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }): void {
    const pt = reflectPointAcrossLine({ x: this.cx, y: this.cy }, p1, p2);
    this.cx = pt.x;
    this.cy = pt.y;
    // Rotation mirroring is complex, but for a plane we can just flip the rotation
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const mirrorAngle = Math.atan2(dy, dx);
    this.rotation = 2 * mirrorAngle - this.rotation;
  }

  getBoundingBox(): BoundingBox {
    // Simplified bounding box (conservative)
    const r = Math.sqrt(this.width * this.width + this.height * this.height) / 2;
    return {
      minX: this.cx - r,
      minY: this.cy - r,
      maxX: this.cx + r,
      maxY: this.cy + r
    };
  }

  hitTest(px: number, py: number, tolerance: number): boolean {
    // Transform point to local space
    const dx = px - this.cx;
    const dy = py - this.cy;
    const c = Math.cos(-this.rotation);
    const s = Math.sin(-this.rotation);
    const localX = dx * c - dy * s;
    const localY = dx * s + dy * c;

    const hw = this.width / 2 + tolerance;
    const hh = this.height / 2 + tolerance;

    return localX >= -hw && localX <= hw && localY >= -hh && localY <= hh;
  }

  getSnapPoints(): import("../engine/SnapEngine").SnapPoint[] {
    const SnapType = (globalThis as any).SnapType || { ENDPOINT: 0, CENTER: 2 };
    const points = [
      { x: this.cx, y: this.cy, type: SnapType.CENTER }
    ];

    const hw = this.width / 2;
    const hh = this.height / 2;
    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh }
    ];

    corners.forEach(c => {
      const pt = rotatePoint(this.cx + c.x, this.cy + c.y, this.cx, this.cy, this.rotation);
      points.push({ x: pt.x, y: pt.y, type: SnapType.ENDPOINT });
    });

    return points;
  }

  clone(newId: string): ImagePlane {
    const copy = new ImagePlane(
      newId,
      this.cx,
      this.cy,
      this.width,
      this.height,
      this.rotation,
      this.imageUrl,
      this.displayMode,
      this.zoomFactor,
      this.opacity,
      this.elevation,
      this.thickness
    );
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }

  getGrips(): Grip[] {
    const grips: Grip[] = [
      { id: 'center', point: { x: this.cx, y: this.cy }, type: 'center' }
    ];

    const hw = this.width / 2;
    const hh = this.height / 2;
    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh }
    ];

    corners.forEach((c, idx) => {
      const pt = rotatePoint(this.cx + c.x, this.cy + c.y, this.cx, this.cy, this.rotation);
      grips.push({ id: `corner_${idx}`, point: pt, type: 'endpoint' });
    });

    return grips;
  }

  moveGrip(gripId: string, newPosition: { x: number; y: number }): void {
    if (gripId === 'center') {
      this.cx = newPosition.x;
      this.cy = newPosition.y;
    } else if (gripId.startsWith('corner_')) {
        // Complex resizing based on corner drag... for now just move center
        // In a real implementation we would resize width/height and shift center
        const idx = parseInt(gripId.split('_')[1]);
        const hw = this.width / 2;
        const hh = this.height / 2;
        
        // This is a simplified resize that assumes no rotation for now
        // A full implementation would transform newPosition into local space
        if (this.rotation === 0) {
            if (idx === 0) { // Bottom-left
                const dx = newPosition.x - (this.cx - hw);
                const dy = newPosition.y - (this.cy - hh);
                this.width -= dx;
                this.height -= dy;
                this.cx += dx / 2;
                this.cy += dy / 2;
            } else if (idx === 1) { // Bottom-right
                const dx = newPosition.x - (this.cx + hw);
                const dy = newPosition.y - (this.cy - hh);
                this.width += dx;
                this.height -= dy;
                this.cx += dx / 2;
                this.cy += dy / 2;
            } else if (idx === 2) { // Top-right
                const dx = newPosition.x - (this.cx + hw);
                const dy = newPosition.y - (this.cy + hh);
                this.width += dx;
                this.height += dy;
                this.cx += dx / 2;
                this.cy += dy / 2;
            } else if (idx === 3) { // Top-left
                const dx = newPosition.x - (this.cx - hw);
                const dy = newPosition.y - (this.cy + hh);
                this.width -= dx;
                this.height += dy;
                this.cx += dx / 2;
                this.cy += dy / 2;
            }
        } else {
            // If rotated, just move for now
            const dx = newPosition.x - this.cx;
            const dy = newPosition.y - this.cy;
            this.move(dx, dy);
        }
    }
  }
}
