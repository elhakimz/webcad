import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Entity } from "../../../model/Entity";
import { Line } from "../../../model/Line";
import { Circle as CircleEntity } from "../../../model/Circle";
import { Arc as ArcEntity } from "../../../model/Arc";
import { Polyline, PolylineVertex } from "../../../model/Polyline";
import { Point } from "../../MathUtils";
import * as MathUtils from "../../MathUtils";

export class OffsetHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'offset';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'offset' && action.id && action.distance !== undefined && action.sidePt) {
      const source = doc.getEntity(action.id);
      if (source) {
        let offsetEntity: Entity | null = null;
        const newId = doc.getNextId(this.getPrefix(source)) + "_OFFSET";

        if (source instanceof Line) {
          const off = MathUtils.offsetLine(source.x1, source.y1, source.x2, source.y2, action.distance || 0, action.sidePt || {x:0, y:0});
          offsetEntity = new Line(newId, off.x1, off.y1, off.x2, off.y2);
        } else if (source instanceof CircleEntity) {
          const off = MathUtils.offsetCircle(source.cx, source.cy, source.r, action.distance || 0, action.sidePt || {x:0, y:0});
          offsetEntity = new CircleEntity(newId, off.cx, off.cy, off.r);
        } else if (source instanceof ArcEntity) {
            const off = MathUtils.offsetCircle(source.cx, source.cy, source.r, action.distance || 0, action.sidePt || {x:0, y:0});
            offsetEntity = new ArcEntity(newId, off.cx, off.cy, off.r, source.startAngle, source.endAngle, source.ccw);
        } else if (source instanceof Polyline) {
            const originalVertices = source.vertices;
            const numVerts = originalVertices.length;
            const isClosed = source.closed;
            
            if (numVerts < 2) {
                this.cleanup(context);
                return undefined;
            }

            function isAngleBetween(angle: number, start: number, end: number, ccw: boolean): boolean {
                const normalize = (a: number) => (a % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                const a = normalize(angle);
                const s = normalize(start);
                const e = normalize(end);
                
                if (ccw) {
                    if (s <= e) return a >= s && a <= e;
                    return a >= s || a <= e;
                } else {
                    if (s >= e) return a <= s && a >= e;
                    return a <= s || a >= e;
                }
            }

            // 1. Determine orientation (CW/CCW) using signed area
            let area = 0;
            for (let i = 0; i < numVerts; i++) {
                const v1 = originalVertices[i];
                const v2 = originalVertices[(i + 1) % numVerts];
                area += (v1.x * v2.y - v2.x * v1.y);
            }
            const isCCW = area > 0;

            // 2. Determine global side (using closest segment midpoint to sidePt)
            let minDiv = Infinity;
            let closestOffsetLeft = true;
            
            for (let i = 0; i < numVerts - (isClosed ? 0 : 1); i++) {
                const v1 = originalVertices[i];
                const v2 = originalVertices[(i + 1) % numVerts];
                
                const mx = (v1.x + v2.x) / 2;
                const my = (v1.y + v2.y) / 2;
                const d = Math.sqrt((action.sidePt!.x - mx)**2 + (action.sidePt!.y - my)**2);
                
                if (d < minDiv) {
                    minDiv = d;
                    const cross = (v2.x - v1.x) * (action.sidePt!.y - v1.y) - (v2.y - v1.y) * (action.sidePt!.x - v1.x);
                    closestOffsetLeft = cross > 0;
                }
            }
            
            const goOutwards = isCCW ? !closestOffsetLeft : closestOffsetLeft;

            interface LineSegment {
              type: 'line';
              x1: number;
              y1: number;
              x2: number;
              y2: number;
            }

            interface ArcSegment {
              type: 'arc';
              x1: number;
              y1: number;
              x2: number;
              y2: number;
              cx: number;
              cy: number;
              r: number;
              startAngle: number;
              endAngle: number;
              ccw: boolean;
            }

            type OffsetSegment = LineSegment | ArcSegment;

            // 3. Generate offset segments
            const offsetSegments: OffsetSegment[] = [];
            
            for (let i = 0; i < numVerts - (isClosed ? 0 : 1); i++) {
                const v1 = originalVertices[i];
                const v2 = originalVertices[(i + 1) % numVerts];
                
                let segmentOffsetLeft = closestOffsetLeft;
                if (goOutwards) {
                    segmentOffsetLeft = !isCCW;
                } else {
                    segmentOffsetLeft = isCCW;
                }

                if (Math.abs(v1.bulge) < 1e-6) {
                    // Line segment
                    const dx = v2.x - v1.x;
                    const dy = v2.y - v1.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const nx = -dy / len;
                    const ny = dx / len;
                    
                    const dist = action.distance || 0;
                    const sign = segmentOffsetLeft ? 1 : -1;
                    
                    offsetSegments.push({
                        type: 'line',
                        x1: v1.x + nx * dist * sign,
                        y1: v1.y + ny * dist * sign,
                        x2: v2.x + nx * dist * sign,
                        y2: v2.y + ny * dist * sign
                    });
                } else {
                    // Arc segment
                    const arc = MathUtils.bulgeToArc(v1, v2, v1.bulge);
                    if (arc) {
                        const dist = action.distance || 0;
                        const sign = (v1.bulge > 0 === goOutwards) ? 1 : -1;
                        const newR = arc.r + dist * sign;
                        
                        const p1_off = { x: arc.cx + newR * Math.cos(arc.startAngle), y: arc.cy + newR * Math.sin(arc.startAngle) };
                        const p2_off = { x: arc.cx + newR * Math.cos(arc.endAngle), y: arc.cy + newR * Math.sin(arc.endAngle) };
                        
                        offsetSegments.push({
                            type: 'arc',
                            cx: arc.cx,
                            cy: arc.cy,
                            r: newR,
                            startAngle: arc.startAngle,
                            endAngle: arc.endAngle,
                            ccw: arc.ccw,
                            x1: p1_off.x,
                            y1: p1_off.y,
                            x2: p2_off.x,
                            y2: p2_off.y
                        });
                    } else {
                        offsetSegments.push({ type: 'line', x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y });
                    }
                }
            }

            // 4. Compute new vertices by intersecting adjacent offset segments
            const newVertices: PolylineVertex[] = [];
            
            for (let i = 0; i < numVerts; i++) {
                if (!isClosed && i === 0) {
                    if (offsetSegments.length > 0) {
                        newVertices.push({ x: offsetSegments[0].x1, y: offsetSegments[0].y1, bulge: originalVertices[0].bulge });
                    } else {
                        newVertices.push({ ...originalVertices[0] });
                    }
                } else if (!isClosed && i === numVerts - 1) {
                    if (offsetSegments.length > 0) {
                        const lastSeg = offsetSegments[offsetSegments.length - 1];
                        newVertices.push({ x: lastSeg.x2, y: lastSeg.y2, bulge: 0 });
                    } else {
                        newVertices.push({ ...originalVertices[numVerts - 1] });
                    }
                } else {
                    const prevIdx = (i - 1 + offsetSegments.length) % offsetSegments.length;
                    const currIdx = i % offsetSegments.length;
                    
                    const seg1 = offsetSegments[prevIdx];
                    const seg2 = offsetSegments[currIdx];
                    
                    // Calculate cross product of original segments to determine turn direction
                    const v1 = originalVertices[i];
                    const v0 = originalVertices[(i - 1 + numVerts) % numVerts];
                    const v2 = originalVertices[(i + 1) % numVerts];
                    
                    const dx1 = v1.x - v0.x;
                    const dy1 = v1.y - v0.y;
                    const dx2 = v2.x - v1.x;
                    const dy2 = v2.y - v1.y;
                    
                    const cross = dx1 * dy2 - dy1 * dx2;
                    const isConvex = (cross > 0) === goOutwards;
                    
                    const d = Math.sqrt((seg1.x2 - seg2.x1)**2 + (seg1.y2 - seg2.y1)**2);
                    
                    if (d < 1e-3) {
                        // Very close, just use midpoint
                        newVertices.push({ x: (seg1.x2 + seg2.x1)/2, y: (seg1.y2 + seg2.y1)/2, bulge: originalVertices[i].bulge });
                    } else if (isConvex) {
                        // Convex corner: insert miter line (add both points)
                        newVertices.push({ x: seg1.x2, y: seg1.y2, bulge: 0 });
                        newVertices.push({ x: seg2.x1, y: seg2.y1, bulge: originalVertices[i].bulge });
                    } else {
                        // Concave corner: intersect and trim
                        let inter: Point | null = null;
                        
                        if (seg1.type === 'line' && seg2.type === 'line') {
                            inter = MathUtils.getLineLineIntersectionInfinite(
                                {x: seg1.x1, y: seg1.y1}, {x: seg1.x2, y: seg1.y2},
                                {x: seg2.x1, y: seg2.y1}, {x: seg2.x2, y: seg2.y2}
                            );
                        } else if (seg1.type === 'line' && seg2.type === 'arc') {
                            const pts = MathUtils.getLineCircleIntersections(
                                {x: seg1.x1, y: seg1.y1}, {x: seg1.x2, y: seg1.y2},
                                seg2.cx, seg2.cy, seg2.r
                            );
                            inter = pts.find(p => isAngleBetween(Math.atan2(p.y - seg2.cy, p.x - seg2.cx), seg2.startAngle, seg2.endAngle, seg2.ccw)) || pts[0] || null;
                        } else if (seg1.type === 'arc' && seg2.type === 'line') {
                            const pts = MathUtils.getLineCircleIntersections(
                                {x: seg2.x1, y: seg2.y1}, {x: seg2.x2, y: seg2.y2},
                                seg1.cx, seg1.cy, seg1.r
                            );
                            inter = pts.find(p => isAngleBetween(Math.atan2(p.y - seg1.cy, p.x - seg1.cx), seg1.startAngle, seg1.endAngle, seg1.ccw)) || pts[0] || null;
                        } else if (seg1.type === 'arc' && seg2.type === 'arc') {
                            const pts = MathUtils.getCircleCircleIntersections(
                                seg1.cx, seg1.cy, seg1.r,
                                seg2.cx, seg2.cy, seg2.r
                            );
                            inter = pts.find(p => 
                                isAngleBetween(Math.atan2(p.y - seg1.cy, p.x - seg1.cx), seg1.startAngle, seg1.endAngle, seg1.ccw) &&
                                isAngleBetween(Math.atan2(p.y - seg2.cy, p.x - seg2.cx), seg2.startAngle, seg2.endAngle, seg2.ccw)
                            ) || pts[0] || null;
                        }
                        
                        if (inter) {
                            newVertices.push({ x: inter.x, y: inter.y, bulge: originalVertices[i].bulge });
                        } else {
                            newVertices.push({ x: seg2.x1, y: seg2.y1, bulge: originalVertices[i].bulge });
                        }
                    }
                }
            }
            
            offsetEntity = new Polyline(newId, newVertices, isClosed);
        }

        if (offsetEntity) {
          offsetEntity.layer = source.layer;
          addEntity(offsetEntity, true, false);
          this.cleanup(context);
          return "Entity offset created.";
        }
      }
    }
    return undefined;
  }

  private getPrefix(entity: Entity): string {
    const name = entity.constructor.name;
    const map: Record<string, string> = {
      'Line': 'L', 'Circle': 'C', 'Arc': 'A', 'Point': 'PT', 'Polyline': 'PL', 'Text': 'TX', 'Solid': 'SD', 'Trace': 'TR', 'Hatch': 'H', 'Shape': 'SH'
    };
    return map[name] || 'E';
  }

  private cleanup(context: AppContext) {
    const { doc, viewer, selectedEntityIds } = context;
    doc.updateSpatialIndex();
    selectedEntityIds.clear();
    viewer.clearHighlight();
    viewer.setPreview(null);
    viewer.setHelpers(null);
    viewer.setBaseLine(null, null);
    viewer.render();
  }
}
