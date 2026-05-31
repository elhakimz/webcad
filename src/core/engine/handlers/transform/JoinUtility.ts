import { Entity } from "../../../model/Entity";
import { Line } from "../../../model/Line";
import { Arc as ArcEntity } from "../../../model/Arc";
import { Polyline, PolylineVertex } from "../../../model/Polyline";

export interface Chain {
  vertices: PolylineVertex[];
  sourceIds: string[];
}

export class JoinUtility {
  static normalizeAngle(a: number): number {
    return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  static dist(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  }

  static reverseVertices(vertices: PolylineVertex[]): PolylineVertex[] {
    const reversed = vertices.map(v => ({ ...v })).reverse();
    const n = vertices.length;
    for (let i = 0; i < n - 1; i++) {
      reversed[i].bulge = -vertices[n - 2 - i].bulge;
    }
    reversed[n - 1].bulge = 0;
    return reversed;
  }

  /**
   * Converts multiple entities into intermediate "Chains" of vertices.
   */
  static buildChains(entities: Entity[]): Chain[] {
    return entities.map(e => {
      if (e instanceof Line) {
        return {
          vertices: [
            { x: e.x1, y: e.y1, bulge: 0 },
            { x: e.x2, y: e.y2, bulge: 0 }
          ],
          sourceIds: [e.id]
        };
      } else if (e instanceof ArcEntity) {
        const includedAngle = e.ccw
          ? this.normalizeAngle(e.endAngle - e.startAngle)
          : this.normalizeAngle(e.startAngle - e.endAngle);
        const bulge = (e.ccw ? 1 : -1) * Math.tan(includedAngle / 4);
        const startX = e.cx + e.r * Math.cos(e.startAngle);
        const startY = e.cy + e.r * Math.sin(e.startAngle);
        const endX = e.cx + e.r * Math.cos(e.endAngle);
        const endY = e.cy + e.r * Math.sin(e.endAngle);
        return {
          vertices: [
            { x: startX, y: startY, bulge: bulge },
            { x: endX, y: endY, bulge: 0 }
          ],
          sourceIds: [e.id]
        };
      } else if (e instanceof Polyline) {
        if (e.closed) {
          return {
            vertices: [...e.vertices.map(v => ({ ...v })), { ...e.vertices[0], bulge: 0 }],
            sourceIds: [e.id]
          };
        }
        return {
          vertices: e.vertices.map(v => ({ ...v })),
          sourceIds: [e.id]
        };
      }
      return null;
    }).filter((c): c is Chain => c !== null);
  }

  /**
   * Greedily merges chains together based on endpoint proximity.
   */
  static mergeChains(chains: Chain[], tolerance: number = 1e-3): Chain[] {
    const result = [...chains];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const c1 = result[i];
          const c2 = result[j];

          const p1s = c1.vertices[0];
          const p1e = c1.vertices[c1.vertices.length - 1];
          const p2s = c2.vertices[0];
          const p2e = c2.vertices[c2.vertices.length - 1];

          let merged = false;

          // Try all 4 endpoint combinations
          if (this.dist(p1e, p2s) < tolerance) {
            c1.vertices[c1.vertices.length - 1].bulge = c2.vertices[0].bulge;
            c1.vertices.push(...c2.vertices.slice(1));
            c1.sourceIds.push(...c2.sourceIds);
            merged = true;
          } else if (this.dist(p1e, p2e) < tolerance) {
            const rev = this.reverseVertices(c2.vertices);
            c1.vertices[c1.vertices.length - 1].bulge = rev[0].bulge;
            c1.vertices.push(...rev.slice(1));
            c1.sourceIds.push(...c2.sourceIds);
            merged = true;
          } else if (this.dist(p1s, p2e) < tolerance) {
            c2.vertices[c2.vertices.length - 1].bulge = c1.vertices[0].bulge;
            c1.vertices.unshift(...c2.vertices.slice(0, -1));
            c1.sourceIds.unshift(...c2.sourceIds);
            merged = true;
          } else if (this.dist(p1s, p2s) < tolerance) {
            const rev = this.reverseVertices(c2.vertices);
            rev[rev.length - 1].bulge = c1.vertices[0].bulge;
            c1.vertices.unshift(...rev.slice(0, -1));
            c1.sourceIds.unshift(...c2.sourceIds);
            merged = true;
          }

          if (merged) {
            result.splice(j, 1);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    return result;
  }
}
