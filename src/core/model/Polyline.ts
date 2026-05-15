
import { Entity, BoundingBox } from "./Entity";
import { rotatePoint, reflectPointAcrossLine, bulgeToArc } from "../engine/MathUtils"

export interface PolylineVertex {
  x: number;
  y: number;
  bulge: number;
}

export class Polyline extends Entity {
  vertices: PolylineVertex[];
  closed: boolean;
  center?: { x: number; y: number };

  constructor(id: string, vertices: PolylineVertex[], closed: boolean = false, elevation = 0, thickness = 0) {
    super(id);
    this.vertices = vertices;
    this.closed = closed;
    this.elevation = elevation;
    this.thickness = thickness;
  }

  move(dx: number, dy: number) {
    this.vertices.forEach(v => {
      v.x += dx;
      v.y += dy;
    });
    if (this.center) {
      this.center.x += dx;
      this.center.y += dy;
    }
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    this.vertices.forEach(v => {
      const p = rotatePoint(v.x, v.y, baseX, baseY, angleRad);
      v.x = p.x;
      v.y = p.y;
    });
    if (this.center) {
      const p = rotatePoint(this.center.x, this.center.y, baseX, baseY, angleRad);
      this.center.x = p.x;
      this.center.y = p.y;
    }
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.vertices.forEach(v => {
      v.x = baseX + (v.x - baseX) * factor;
      v.y = baseY + (v.y - baseY) * factor;
    });
    if (this.center) {
      this.center.x = baseX + (this.center.x - baseX) * factor;
      this.center.y = baseY + (this.center.y - baseY) * factor;
    }
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    this.vertices.forEach(v => {
      const reflected = reflectPointAcrossLine({ x: v.x, y: v.y }, p1, p2);
      v.x = reflected.x;
      v.y = reflected.y;
      v.bulge = -v.bulge;
    });
    if (this.center) {
      const reflected = reflectPointAcrossLine(this.center, p1, p2);
      this.center.x = reflected.x;
      this.center.y = reflected.y;
    }
  }

  getBoundingBox(): BoundingBox {
    if (this.vertices.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.vertices.forEach(v => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });
    // Note: This doesn't account for arc segments (bulges) yet, 
    // but for broad-phase AABB, vertex extents are often enough 
    // unless the arc goes far beyond the chord.
    return { minX, minY, maxX, maxY };
  }

  clone(newId: string): Polyline {
    const copy = new Polyline(newId, this.vertices.map(v => ({ ...v })), this.closed, this.elevation, this.thickness);
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    if (this.center) {
      copy.center = { ...this.center };
    }
    return copy;
  }

  getGrips(): import("./Entity").Grip[] {
    const grips: import("./Entity").Grip[] = [];
    
    // Vertex grips
    this.vertices.forEach((v, i) => {
      grips.push({ id: `vertex_${i}`, point: { x: v.x, y: v.y }, type: 'endpoint' });
    });
    
    const addSegmentGrips = (v1: PolylineVertex, v2: PolylineVertex, i: number) => {
      if (Math.abs(v1.bulge) > 1e-6) {
        const arc = bulgeToArc(v1, v2, v1.bulge);
        if (arc) {
          let diff = arc.endAngle - arc.startAngle;
          if (arc.ccw) {
            while (diff < 0) diff += Math.PI * 2;
            while (diff >= Math.PI * 2) diff -= Math.PI * 2;
          } else {
            while (diff > 0) diff -= Math.PI * 2;
            while (diff <= -Math.PI * 2) diff += Math.PI * 2;
          }
          const midAngle = arc.startAngle + diff / 2;
          grips.push({ 
            id: `midpoint_${i}`, 
            point: { x: arc.cx + arc.r * Math.cos(midAngle), y: arc.cy + arc.r * Math.sin(midAngle) }, 
            type: 'midpoint' 
          });
          grips.push({ 
            id: `center_${i}`, 
            point: { x: arc.cx, y: arc.cy }, 
            type: 'center' 
          });
          return;
        }
      }
      grips.push({ 
        id: `midpoint_${i}`, 
        point: { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 }, 
        type: 'midpoint' 
      });
    };

    // Midpoint & Center grips
    for (let i = 0; i < this.vertices.length - 1; i++) {
      addSegmentGrips(this.vertices[i], this.vertices[i + 1], i);
    }
    
    // If closed, add grips for the closing segment
    if (this.closed && this.vertices.length > 2) {
      addSegmentGrips(this.vertices[this.vertices.length - 1], this.vertices[0], this.vertices.length - 1);
    }
    
    return grips;
  }

  moveGrip(gripId: string, newPosition: { x: number; y: number }): void {
    if (gripId.startsWith('vertex_')) {
      const index = parseInt(gripId.split('_')[1]);
      if (index >= 0 && index < this.vertices.length) {
        this.vertices[index].x = newPosition.x;
        this.vertices[index].y = newPosition.y;
      }
    } else if (gripId.startsWith('midpoint_') || gripId.startsWith('center_')) {
      const index = parseInt(gripId.split('_')[1]);
      if (index >= 0 && index < this.vertices.length) {
        const v1 = this.vertices[index];
        const v2 = (index === this.vertices.length - 1 && this.closed) ? this.vertices[0] : this.vertices[index + 1];
        
        if (v2) {
          let refX = (v1.x + v2.x) / 2;
          let refY = (v1.y + v2.y) / 2;

          if (Math.abs(v1.bulge) > 1e-6) {
            const arc = bulgeToArc(v1, v2, v1.bulge);
            if (arc) {
              if (gripId.startsWith('center_')) {
                refX = arc.cx;
                refY = arc.cy;
              } else {
                let diff = arc.endAngle - arc.startAngle;
                if (arc.ccw) {
                  while (diff < 0) diff += Math.PI * 2;
                  while (diff >= Math.PI * 2) diff -= Math.PI * 2;
                } else {
                  while (diff > 0) diff -= Math.PI * 2;
                  while (diff <= -Math.PI * 2) diff += Math.PI * 2;
                }
                const midAngle = arc.startAngle + diff / 2;
                refX = arc.cx + arc.r * Math.cos(midAngle);
                refY = arc.cy + arc.r * Math.sin(midAngle);
              }
            }
          }

          const dx = newPosition.x - refX;
          const dy = newPosition.y - refY;
          
          v1.x += dx;
          v1.y += dy;
          v2.x += dx;
          v2.y += dy;
        }
      }
    }
  }
}

