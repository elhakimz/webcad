import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { Entity } from "../../model/Entity";
import { Line } from "../../model/Line";
import { Circle as CircleEntity } from "../../model/Circle";
import { Arc as ArcEntity } from "../../model/Arc";
import { Polyline } from "../../model/Polyline";
import * as MathUtils from "../MathUtils";
import { Point } from "../MathUtils";

export class TransformHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['move', 'rotate', 'scale', 'copy', 'mirror', 'array', 'offset', 'trim', 'extend'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, selectedEntityIds, addEntity } = context;

    if (action.action === 'move' && (action.id || action.ids) && action.dx !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          entity.move(action.dx!, action.dy!);
          viewer.moveObject(id, action.dx!, action.dy!);
        }
      });
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] moved.`;
    }

    if (action.action === 'rotate' && (action.id || action.ids) && action.angle !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          entity.rotate(action.baseX!, action.baseY!, action.angle!);
          addEntity(entity, true, false); 
        }
      });
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] rotated.`;
    }

    if (action.action === 'scale' && (action.id || action.ids) && action.factor !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          entity.scale(action.baseX!, action.baseY!, action.factor!);
          addEntity(entity, true, false); 
        }
      });
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] scaled.`;
    }

    if (action.action === 'copy' && (action.id || action.ids) && action.dx !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      const newIds: string[] = [];
      ids.forEach(id => {
        const source = doc.getEntity(id);
        if (source) {
          const newId = source.id + "_COPY_" + Math.random().toString(36).substr(2, 5);
          const copy = source.clone(newId);
          copy.move(action.dx!, action.dy!);
          addEntity(copy, true, false); 
          newIds.push(newId);
        }
      });
      this.cleanup(context);
      return `Entities copied to [${newIds.join(', ')}].`;
    }

    if (action.action === 'mirror' && action.ids && action.p1 && action.p2 && action.deleteOriginal !== undefined) {
      const { ids, p1, p2, deleteOriginal } = action;
      const newIds: string[] = [];
      
      if (deleteOriginal) {
        ids.forEach(id => {
          const source = doc.getEntity(id);
          if (source) {
            source.mirror(p1, p2);
            addEntity(source, true, false);
          }
        });
      } else {
        ids.forEach(id => {
          const source = doc.getEntity(id);
          if (source) {
            const target = source.clone(source.id + "_MIRROR_" + Math.random().toString(36).substr(2, 5));
            target.mirror(p1, p2);
            addEntity(target, true, false);
            newIds.push(target.id);
          }
        });
      }
      this.cleanup(context);
      return deleteOriginal 
        ? `Entities mirrored and originals deleted.`
        : `Entities mirrored to [${newIds.join(', ')}].`;
    }

    if (action.action === 'array' && action.ids && action.arrayType) {
      const { ids, arrayType } = action;
      let totalCreated = 0;

      if (arrayType === 'R') {
        const { rows, cols, rowSpacing, colSpacing } = action;
        for (let r = 0; r < (rows || 1); r++) {
          for (let c = 0; c < (cols || 1); c++) {
            if (r === 0 && c === 0) continue; 

            const dx = c * (colSpacing || 0);
            const dy = r * (rowSpacing || 0);

            ids.forEach(id => {
              const source = doc.getEntity(id);
              if (source) {
                const newId = doc.getNextId(this.getPrefix(source)) + "_ARRAY";
                const copy = source.clone(newId);
                copy.move(dx, dy);
                addEntity(copy, true, false);
                totalCreated++;
              }
            });
          }
        }
      } else if (arrayType === 'P') {
        const { center, count, angleToFill, rotateObjects } = action;
        const baseCenter = center || { x: 0, y: 0 };
        const totalCount = count || 2;
        const totalAngle = (angleToFill || 360) * (Math.PI / 180);
        const stepAngle = totalAngle / totalCount;

        for (let i = 1; i < totalCount; i++) {
          const currentAngle = i * stepAngle;
          ids.forEach(id => {
            const source = doc.getEntity(id);
            if (source) {
              const newId = doc.getNextId(this.getPrefix(source)) + "_ARRAY";
              const copy = source.clone(newId);
              copy.rotate(baseCenter.x, baseCenter.y, currentAngle);
              if (!rotateObjects) {
                  const bbox = copy.getBoundingBox();
                  const cx = (bbox.minX + bbox.maxX) / 2;
                  const cy = (bbox.minY + bbox.maxY) / 2;
                  copy.rotate(cx, cy, -currentAngle);
              }
              addEntity(copy, true, false);
              totalCreated++;
            }
          });
        }
      }
      this.cleanup(context);
      return `Array created: ${totalCreated} new entities.`;
    }

    if (action.action === 'offset' && action.id && action.distance !== undefined && action.sidePt) {
      const source = doc.getEntity(action.id);
      if (source) {
        let offsetEntity: Entity | null = null;
        const newId = doc.getNextId(this.getPrefix(source)) + "_OFFSET";

        if (source instanceof Line) {
          const off = MathUtils.offsetLine(source.x1, source.y1, source.x2, source.y2, action.distance, action.sidePt);
          offsetEntity = new Line(newId, off.x1, off.y1, off.x2, off.y2);
        } else if (source instanceof CircleEntity) {
          const off = MathUtils.offsetCircle(source.cx, source.cy, source.r, action.distance, action.sidePt);
          offsetEntity = new CircleEntity(newId, off.cx, off.cy, off.r);
        } else if (source instanceof ArcEntity) {
            const off = MathUtils.offsetCircle(source.cx, source.cy, source.r, action.distance, action.sidePt);
            offsetEntity = new ArcEntity(newId, off.cx, off.cy, off.r, source.startAngle, source.endAngle, source.ccw);
        } else if (source instanceof Polyline) {
            const newVertices = source.vertices.map((v, i) => {
                if (i < source.vertices.length - 1 || source.closed) {
                    const v2 = source.vertices[(i + 1) % source.vertices.length];
                    if (Math.abs(v.bulge) < 1e-6) {
                        const off = MathUtils.offsetLine(v.x, v.y, v2.x, v2.y, action.distance, action.sidePt);
                        return { x: off.x1, y: off.y1, bulge: 0 };
                    }
                }
                return { ...v };
            });
            offsetEntity = new Polyline(newId, newVertices, source.closed);
        }

        if (offsetEntity) {
          offsetEntity.layer = source.layer;
          addEntity(offsetEntity, true, false);
          this.cleanup(context);
          return "Entity offset created.";
        }
      }
    }

    if (action.action === 'trim' && action.id && action.boundaryIds && action.pickPt) {
        const target = doc.getEntity(action.id);
        if (target && (target instanceof Line || target instanceof ArcEntity || target instanceof CircleEntity)) {
            const boundaries = action.boundaryIds.map(id => doc.getEntity(id)).filter(Boolean);
            const intersections: Point[] = [];

            boundaries.forEach(b => {
                const pts = MathUtils.getEntityEntityIntersections(target, b);
                intersections.push(...pts);
            });

            const uniqueIntersections: Point[] = [];
            intersections.forEach(p => {
                if (!uniqueIntersections.some(up => MathUtils.distancePointToPoint(p.x, p.y, up.x, up.y) < 1e-4)) {
                    uniqueIntersections.push(p);
                }
            });

            if (uniqueIntersections.length > 0) {
                if (target instanceof Line) {
                    const pts: Point[] = [
                        { x: target.x1, y: target.y1 },
                        ...uniqueIntersections,
                        { x: target.x2, y: target.y2 }
                    ];
                    const dirX = target.x2 - target.x1;
                    const dirY = target.y2 - target.y1;
                    pts.sort((a, b) => {
                        return (a.x - target.x1) * dirX + (a.y - target.y1) * dirY - 
                               ((b.x - target.x1) * dirX + (b.y - target.y1) * dirY);
                    });

                    let removeIdx = -1;
                    let minDist = Infinity;
                    for (let i = 0; i < pts.length - 1; i++) {
                        const d = MathUtils.distancePointToLineSegment(action.pickPt.x, action.pickPt.y, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
                        if (d < minDist) {
                            minDist = d;
                            removeIdx = i;
                        }
                    }

                    if (removeIdx !== -1) {
                        doc.removeEntity(target.id);
                        viewer.removeObject(target.id);

                        for (let i = 0; i < pts.length - 1; i++) {
                            if (i === removeIdx) continue;
                            const newId = doc.getNextId("L");
                            const newLine = new Line(newId, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
                            newLine.layer = target.layer;
                            newLine.properties = JSON.parse(JSON.stringify(target.properties));
                            addEntity(newLine, true, false);
                        }
                        doc.updateSpatialIndex();
                        return "Line trimmed.";
                    }
                } else {
                    const cx = (target as any).cx;
                    const cy = (target as any).cy;
                    const r = (target as any).r;
                    const ccw = (target instanceof ArcEntity) ? target.ccw : true;
                    
                    const normalize = (a: number) => {
                        while (a < 0) a += Math.PI * 2;
                        while (a >= Math.PI * 2) a -= Math.PI * 2;
                        return a;
                    };

                    const s = (target instanceof ArcEntity) ? normalize(target.startAngle) : normalize(Math.atan2(uniqueIntersections[0].y - cy, uniqueIntersections[0].x - cx));
                    const e = (target instanceof ArcEntity) ? normalize(target.endAngle) : s;
                    
                    const intersectionAngles = uniqueIntersections.map(p => normalize(Math.atan2(p.y - cy, p.x - cx)));
                    
                    const validIntersections = (target instanceof CircleEntity) 
                        ? intersectionAngles 
                        : intersectionAngles.filter(a => {
                            if (ccw) return s <= e ? (a > s + 1e-4 && a < e - 1e-4) : (a > s + 1e-4 || a < e - 1e-4);
                            else return e <= s ? (a > e + 1e-4 && a < s - 1e-4) : (a > e + 1e-4 || a < s - 1e-4);
                        });

                    const allAngles = [s, ...validIntersections];
                    if (target instanceof ArcEntity) allAngles.push(e);
                    else if (target instanceof CircleEntity) {
                        allAngles.sort((a, b) => a - b);
                        allAngles.push(allAngles[0]); 
                    }
                    
                    allAngles.sort((a, b) => {
                        let da, db;
                        if (ccw) {
                            da = a - s; if (da < 0) da += Math.PI * 2;
                            db = b - s; if (db < 0) db += Math.PI * 2;
                        } else {
                            da = s - a; if (da < 0) da += Math.PI * 2;
                            db = s - b; if (db < 0) db += Math.PI * 2;
                        }
                        return da - db;
                    });

                    const segments: { s: number, e: number }[] = [];
                    for (let i = 0; i < allAngles.length - 1; i++) {
                        segments.push({ s: allAngles[i], e: allAngles[i+1] });
                    }

                    let removeIdx = -1;
                    let minDist = Infinity;
                    for (let i = 0; i < segments.length; i++) {
                        const seg = segments[i];
                        let diff = seg.e - seg.s;
                        if (ccw && diff < 0) diff += Math.PI * 2;
                        if (!ccw && diff > 0) diff -= Math.PI * 2;
                        const midAngle = normalize(seg.s + diff / 2);
                        const mx = cx + r * Math.cos(midAngle);
                        const my = cy + r * Math.sin(midAngle);
                        const d = Math.sqrt((action.pickPt!.x - mx)**2 + (action.pickPt!.y - my)**2);
                        if (d < minDist) {
                            minDist = d;
                            removeIdx = i;
                        }
                    }

                    if (removeIdx !== -1) {
                        doc.removeEntity(target.id);
                        viewer.removeObject(target.id);
                        for (let i = 0; i < segments.length; i++) {
                            if (i === removeIdx) continue;
                            const newId = doc.getNextId("A");
                            const newArc = new ArcEntity(newId, cx, cy, r, segments[i].s, segments[i].e, ccw);
                            newArc.layer = target.layer;
                            newArc.properties = JSON.parse(JSON.stringify(target.properties));
                            addEntity(newArc, true, false);
                        }
                        doc.updateSpatialIndex();
                        return target instanceof CircleEntity ? "Circle trimmed to arc." : "Arc trimmed.";
                    }
                }
            }
        }
    }

    if (action.action === 'extend' && action.id && action.boundaryIds && action.pickPt) {
        const target = doc.getEntity(action.id);
        if (target && (target instanceof Line || target instanceof ArcEntity)) {
            const boundaries = action.boundaryIds.map(id => doc.getEntity(id)).filter(Boolean);
            
            if (target instanceof Line) {
                let closestPt: Point | null = null;
                let minDist = Infinity;

                const dirX = target.x2 - target.x1;
                const dirY = target.y2 - target.y1;
                const len = Math.sqrt(dirX*dirX + dirY*dirY);
                const ux = dirX / len;
                const uy = dirY / len;

                const d1 = Math.sqrt((action.pickPt.x - target.x1)**2 + (action.pickPt.y - target.y1)**2);
                const d2 = Math.sqrt((action.pickPt.x - target.x2)**2 + (action.pickPt.y - target.y2)**2);
                const isStart = d1 < d2;

                boundaries.forEach(b => {
                    const large = 1000000;
                    const tempLine = isStart 
                        ? new Line("TEMP", target.x1 - ux * large, target.y1 - uy * large, target.x1, target.y1)
                        : new Line("TEMP", target.x2, target.y2, target.x2 + ux * large, target.y2 + uy * large);
                    
                    const pts = MathUtils.getEntityEntityIntersections(tempLine, b);
                    
                    pts.forEach(pt => {
                        const dist = isStart 
                            ? Math.sqrt((pt.x - target.x1)**2 + (pt.y - target.y1)**2)
                            : Math.sqrt((pt.x - target.x2)**2 + (pt.y - target.y2)**2);
                        if (dist < minDist) {
                            minDist = dist;
                            closestPt = pt;
                        }
                    });
                });

                if (closestPt) {
                    if (isStart) {
                        target.x1 = closestPt.x;
                        target.y1 = closestPt.y;
                    } else {
                        target.x2 = closestPt.x;
                        target.y2 = closestPt.y;
                    }
                    addEntity(target, true, false);
                    doc.updateSpatialIndex();
                    return "Line extended.";
                }
            } else if (target instanceof ArcEntity) {
                const normalize = (a: number) => {
                    while (a < 0) a += Math.PI * 2;
                    while (a >= Math.PI * 2) a -= Math.PI * 2;
                    return a;
                };

                const s = normalize(target.startAngle);
                const e = normalize(target.endAngle);
                
                const d1 = Math.sqrt((action.pickPt.x - (target.cx + target.r * Math.cos(s)))**2 + (action.pickPt.y - (target.cy + target.r * Math.sin(s)))**2);
                const d2 = Math.sqrt((action.pickPt.x - (target.cx + target.r * Math.cos(e)))**2 + (action.pickPt.y - (target.cy + target.r * Math.sin(e)))**2);
                const isStart = d1 < d2;

                let closestAngle: number | null = null;
                let minAngularDist = Infinity;

                boundaries.forEach(b => {
                    const circle = new CircleEntity("TEMP", target.cx, target.cy, target.r);
                    const pts = MathUtils.getEntityEntityIntersections(circle, b);
                    
                    pts.forEach(p => {
                        const angle = normalize(Math.atan2(p.y - target.cy, p.x - target.cx));
                        
                        // Is it outside current arc sweep?
                        const alreadyIn = target.ccw 
                            ? (s <= e ? (angle >= s - 1e-4 && angle <= e + 1e-4) : (angle >= s - 1e-4 || angle <= e + 1e-4))
                            : (e <= s ? (angle >= e - 1e-4 && angle <= s + 1e-4) : (angle >= e - 1e-4 || angle <= s + 1e-4));
                        
                        if (!alreadyIn) {
                            let dist: number;
                            if (isStart) {
                                dist = target.ccw ? (s - angle) : (angle - s);
                            } else {
                                dist = target.ccw ? (angle - e) : (e - angle);
                            }
                            while (dist < 0) dist += Math.PI * 2;
                            
                            if (dist < minAngularDist) {
                                minAngularDist = dist;
                                closestAngle = angle;
                            }
                        }
                    });
                });

                if (closestAngle !== null) {
                    if (isStart) target.startAngle = closestAngle;
                    else target.endAngle = closestAngle;
                    
                    addEntity(target, true, false);
                    doc.updateSpatialIndex();
                    return "Arc extended.";
                }
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
