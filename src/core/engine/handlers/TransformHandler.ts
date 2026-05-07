import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { Entity } from "../../model/Entity";
import { Line } from "../../model/Line";
import { Circle as CircleEntity } from "../../model/Circle";
import { Arc as ArcEntity } from "../../model/Arc";
import { Polyline } from "../../model/Polyline";
import { Ellipse as EllipseEntity } from "../../model/Ellipse";
import * as MathUtils from "../MathUtils";
import { Point } from "../MathUtils";

export class TransformHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['move', 'rotate', 'scale', 'copy', 'mirror', 'array', 'offset', 'trim', 'extend', 'fillet'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'fillet' && action.id1 && action.id2 && action.radius !== undefined && action.pick1 && action.pick2) {
      console.log('FILLET handler - radius:', action.radius);
      const e1 = doc.getEntity(action.id1);
      const e2 = doc.getEntity(action.id2);

      if (e1 instanceof Line && e2 instanceof Line) {
        const res = MathUtils.filletLines(
            {x: e1.x1, y: e1.y1}, {x: e1.x2, y: e1.y2},
            {x: e2.x1, y: e2.y1}, {x: e2.x2, y: e2.y2},
            action.radius!, action.pick1!, action.pick2!
        );
        console.log('FILLET math result:', res);

        if (res) {
            const before1 = e1.clone(e1.id);
            const before2 = e2.clone(e2.id);

            const inter = MathUtils.getLineLineIntersectionInfinite({x: e1.x1, y: e1.y1}, {x: e1.x2, y: e1.y2}, {x: e2.x1, y: e2.y1}, {x: e2.x2, y: e2.y2});
            if (inter) {
                const d1a = MathUtils.distancePointToPoint(e1.x1, e1.y1, inter.x, inter.y);
                const d1b = MathUtils.distancePointToPoint(e1.x2, e1.y2, inter.x, inter.y);
                if (d1a < d1b) { e1.x1 = res.tp1.x; e1.y1 = res.tp1.y; }
                else { e1.x2 = res.tp1.x; e1.y2 = res.tp1.y; }

                const d2a = MathUtils.distancePointToPoint(e2.x1, e2.y1, inter.x, inter.y);
                const d2b = MathUtils.distancePointToPoint(e2.x2, e2.y2, inter.x, inter.y);
                if (d2a < d2b) { e2.x1 = res.tp2.x; e2.y1 = res.tp2.y; }
                else { e2.x2 = res.tp2.x; e2.y2 = res.tp2.y; }
            }

            doc.recordTransform(before1, e1);
            doc.recordTransform(before2, e2);
            addEntity(e1, false, false);
            addEntity(e2, false, false);

            if (action.radius! > 0) {
                const arcId = doc.getNextId("A");
                const arc = new ArcEntity(arcId, res.cx, res.cy, res.radius, res.startAngle, res.endAngle, res.ccw);
                arc.layer = e1.layer;
                addEntity(arc, true, false);
            }

            this.cleanup(context);
            return "Fillet created.";
        }
      }
      this.cleanup(context);
      return "Fillet only supported between two lines.";
    }

    if (action.action === 'move' && (action.id || action.ids) && action.dx !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          const before = entity.clone(entity.id);
          entity.move(action.dx!, action.dy!);
          doc.recordTransform(before, entity);
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
          const before = entity.clone(entity.id);
          entity.rotate(action.baseX!, action.baseY!, action.angle!);
          doc.recordTransform(before, entity);
          addEntity(entity, false, false); 
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
          const before = entity.clone(entity.id);
          entity.scale(action.baseX!, action.baseY!, action.factor!);
          doc.recordTransform(before, entity);
          addEntity(entity, false, false); 
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
            const before = source.clone(source.id);
            source.mirror(p1, p2);
            doc.recordTransform(before, source);
            addEntity(source, false, false);
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
          const off = MathUtils.offsetLine(source.x1, source.y1, source.x2, source.y2, action.distance || 0, action.sidePt || {x:0, y:0});
          offsetEntity = new Line(newId, off.x1, off.y1, off.x2, off.y2);
        } else if (source instanceof CircleEntity) {
          const off = MathUtils.offsetCircle(source.cx, source.cy, source.r, action.distance || 0, action.sidePt || {x:0, y:0});
          offsetEntity = new CircleEntity(newId, off.cx, off.cy, off.r);
        } else if (source instanceof ArcEntity) {
            const off = MathUtils.offsetCircle(source.cx, source.cy, source.r, action.distance || 0, action.sidePt || {x:0, y:0});
            offsetEntity = new ArcEntity(newId, off.cx, off.cy, off.r, source.startAngle, source.endAngle, source.ccw);
        } else if (source instanceof Polyline) {
            const newVertices = source.vertices.map((v, i) => {
                if (i < source.vertices.length - 1 || source.closed) {
                    const v2 = source.vertices[(i + 1) % source.vertices.length];
                    if (Math.abs(v.bulge) < 1e-6) {
                        const off = MathUtils.offsetLine(v.x, v.y, v2.x, v2.y, action.distance || 0, action.sidePt || {x:0, y:0});
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
        console.log("[TRIM DEBUG] === TRIM START ===");
        console.log("[TRIM DEBUG] Target ID:", action.id);
        const originalTarget = doc.getEntity(action.id);
        console.log("[TRIM DEBUG] Target entity:", originalTarget?.constructor.name, originalTarget?.id);
        console.log("[TRIM DEBUG] Boundary IDs:", action.boundaryIds);
        console.log("[TRIM DEBUG] Pick point:", action.pickPt);
        console.log("[TRIM DEBUG] Boundary entities:", action.boundaryIds.map(id => {
            const e = doc.getEntity(id);
            return e ? `${e.constructor.name}:${e.id}` : `NOT FOUND:${id}`;
        }));
        if (!originalTarget) return undefined;
        
        const targets: Entity[] = [];
        if (originalTarget instanceof Polyline) {
            for (let i = 0; i < originalTarget.vertices.length - (originalTarget.closed ? 0 : 1); i++) {
                const v1 = originalTarget.vertices[i];
                const v2 = originalTarget.vertices[(i + 1) % originalTarget.vertices.length];
                const segId = doc.getNextId(Math.abs(v1.bulge) < 1e-6 ? "L" : "A");
                let seg: Entity;
                if (Math.abs(v1.bulge) < 1e-6) {
                    seg = new Line(segId, v1.x, v1.y, v2.x, v2.y);
                } else {
                    const arc = MathUtils.bulgeToArc(v1, v2, v1.bulge)!;
                    seg = new ArcEntity(segId, arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, arc.ccw);
                }
                seg.layer = originalTarget.layer;
                seg.properties = JSON.parse(JSON.stringify(originalTarget.properties));
                targets.push(seg);
            }
        } else {
            targets.push(originalTarget);
        }

        let trimmedAnything = false;
        const boundaries = action.boundaryIds.map(bid => doc.getEntity(bid)).filter(Boolean) as Entity[];
        
        console.log("[TRIM DEBUG] targets count:", targets.length);
        console.log("[TRIM DEBUG] targets:", targets.map(t => t.constructor.name));

        for (const t of targets) {
            if (originalTarget instanceof Polyline) {
                let dist = Infinity;
                if (t instanceof Line) dist = MathUtils.distancePointToLineSegment(action.pickPt.x, action.pickPt.y, t.x1, t.y1, t.x2, t.y2);
                else if (t instanceof ArcEntity) dist = MathUtils.distancePointToArc(action.pickPt.x, action.pickPt.y, t.cx, t.cy, t.r, t.startAngle, t.endAngle, t.ccw);
                if (dist > 10 / viewer.camera.zoom) continue; 
            }

            const intersections = [];
            for (const b of boundaries) {
                intersections.push(...MathUtils.getEntityEntityIntersections(t, b));
            }

            const uniqueIntersections: Point[] = [];
            intersections.forEach(p => {
                if (!uniqueIntersections.some(up => MathUtils.distancePointToPoint(p.x, p.y, up.x, up.y) < 1e-4)) uniqueIntersections.push(p);
            });

            console.log("[TRIM DEBUG] Target:", t.constructor.name, "Intersections found:", uniqueIntersections.length);
            if (uniqueIntersections.length > 0) {
                if (t instanceof Line) {
                    const pts = [{ x: t.x1, y: t.y1 }, ...uniqueIntersections, { x: t.x2, y: t.y2 }];
                    const dirX = t.x2 - t.x1, dirY = t.y2 - t.y1;
                    pts.sort((a, b) => (a.x - t.x1) * dirX + (a.y - t.y1) * dirY - ((b.x - t.x1) * dirX + (b.y - t.y1) * dirY));

                    let removeIdx = -1, minDist = Infinity;
                    for (let i = 0; i < pts.length - 1; i++) {
                        const d = MathUtils.distancePointToLineSegment(action.pickPt.x, action.pickPt.y, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
                        if (d < minDist) { minDist = d; removeIdx = i; }
                    }

                    if (removeIdx !== -1) {
                        doc.removeEntity(originalTarget.id);
                        viewer.removeObject(originalTarget.id);
                        if (originalTarget instanceof Polyline) {
                            targets.forEach(seg => { if (seg !== t) addEntity(seg, true, false); });
                        }
                        for (let i = 0; i < pts.length - 1; i++) {
                            if (i === removeIdx) continue;
                            const newLine = new Line(doc.getNextId("L"), pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
                            newLine.layer = t.layer;
                            newLine.properties = JSON.parse(JSON.stringify(t.properties));
                            addEntity(newLine, true, false);
                        }
                        trimmedAnything = true;
                    }
                } else if (t instanceof ArcEntity || t instanceof CircleEntity) {
                    const cx = (t as ArcEntity).cx || (t as CircleEntity).cx;
                    const cy = (t as ArcEntity).cy || (t as CircleEntity).cy;
                    const r = (t as ArcEntity).r || (t as CircleEntity).r;
                    const ccw = (t instanceof ArcEntity) ? t.ccw : true;
                    const normalize = (a: number) => { while (a < 0) a += Math.PI * 2; while (a >= Math.PI * 2) a -= Math.PI * 2; return a; };
                    const s = (t instanceof ArcEntity) ? normalize(t.startAngle) : normalize(Math.atan2(uniqueIntersections[0].y - cy, uniqueIntersections[0].x - cx));
                    const e = (t instanceof ArcEntity) ? normalize(t.endAngle) : s;
                    const intersectionAngles = uniqueIntersections.map(p => normalize(Math.atan2(p.y - cy, p.x - cx)));
                    const validIntersections = (t instanceof CircleEntity) ? intersectionAngles : intersectionAngles.filter(a => ccw ? (s <= e ? (a > s + 1e-4 && a < e - 1e-4) : (a > s + 1e-4 || a < e - 1e-4)) : (e <= s ? (a > e + 1e-4 && a < s - 1e-4) : (a > e + 1e-4 || a < s - 1e-4)));
                    const allAngles = [s, ...validIntersections];
                    if (t instanceof ArcEntity) allAngles.push(e);
                    else { allAngles.sort((a, b) => a - b); allAngles.push(allAngles[0]); }
                    allAngles.sort((a, b) => { let da, db; if (ccw) { da = a - s; if (da < 0) da += Math.PI * 2; db = b - s; if (db < 0) db += Math.PI * 2; } else { da = s - a; if (da < 0) da += Math.PI * 2; db = s - b; if (db < 0) db += Math.PI * 2; } return da - db; });
                    const segments = [];
                    for (let i = 0; i < allAngles.length - 1; i++) segments.push({ s: allAngles[i], e: allAngles[i+1] });
                    let removeIdx = -1, minDist = Infinity;
                    for (let i = 0; i < segments.length; i++) {
                        const seg = segments[i]; let diff = seg.e - seg.s;
                        if (ccw && diff < 0) diff += Math.PI * 2; if (!ccw && diff > 0) diff -= Math.PI * 2;
                        const midAngle = normalize(seg.s + diff / 2);
                        const d = Math.sqrt((action.pickPt.x - (cx + r * Math.cos(midAngle)))**2 + (action.pickPt.y - (cy + r * Math.sin(midAngle)))**2);
                        if (d < minDist) { minDist = d; removeIdx = i; }
                    }
                    if (removeIdx !== -1) {
                        doc.removeEntity(originalTarget.id);
                        viewer.removeObject(originalTarget.id);
                        if (originalTarget instanceof Polyline) {
                            targets.forEach(seg => { if (seg !== t) addEntity(seg, true, false); });
                        }
                        for (let i = 0; i < segments.length; i++) {
                            if (i === removeIdx) continue;
                            const newArc = new ArcEntity(doc.getNextId("A"), cx, cy, r, segments[i].s, segments[i].e, ccw);
                            newArc.layer = t.layer;
                            newArc.properties = JSON.parse(JSON.stringify(t.properties));
                            addEntity(newArc, true, false);
                        }
                        trimmedAnything = true;
                    }
                } else if (t instanceof EllipseEntity) {
                    const { cx, cy, majorX, majorY, ratio, startAngle, endAngle, ccw } = t;
                    const normalize = (a: number) => { while (a < 0) a += Math.PI * 2; while (a >= Math.PI * 2) a -= Math.PI * 2; return a; };
                    
                    const intersectionAngles = uniqueIntersections.map(p => {
                        const ang = MathUtils.getEllipsePointAngle(p.x, p.y, cx, cy, majorX, majorY, ratio);
                        return normalize(ang);
                    });
                    
                    let s = normalize(startAngle);
                    let e = normalize(endAngle);
                    
                    if (Math.abs(s - e) < 0.01) {
                        s = 0;
                        e = Math.PI * 2;
                    }
                    
                    const validIntersections = intersectionAngles.filter(a => {
                        if (ccw) {
                            return s <= e ? (a > s + 1e-4 && a < e - 1e-4) : (a > s + 1e-4 || a < e - 1e-4);
                        } else {
                            return e <= s ? (a > e + 1e-4 && a < s - 1e-4) : (a > e + 1e-4 || a < s - 1e-4);
                        }
                    });

                    const allAngles = [s, ...validIntersections, e];
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

                    const segments = [];
                    for (let i = 0; i < allAngles.length - 1; i++) {
                        segments.push({ s: allAngles[i], e: allAngles[i+1] });
                    }

                    let removeIdx = -1, minDist = Infinity;
                    const rotation = Math.atan2(majorY, majorX);
                    const majorR = Math.sqrt(majorX * majorX + majorY * majorY);
                    const minorR = majorR * ratio;

                    for (let i = 0; i < segments.length; i++) {
                        const seg = segments[i];
                        let diff = seg.e - seg.s;
                        if (ccw && diff < 0) diff += Math.PI * 2;
                        if (!ccw && diff > 0) diff -= Math.PI * 2;
                        const midAngle = normalize(seg.s + diff / 2);
                        
                        const tx = majorR * Math.cos(midAngle);
                        const ty = minorR * Math.sin(midAngle);
                        const rx = tx * Math.cos(rotation) - ty * Math.sin(rotation);
                        const ry = tx * Math.sin(rotation) + ty * Math.cos(rotation);
                        const mx = cx + rx;
                        const my = cy + ry;

                        const d = Math.sqrt((action.pickPt.x - mx)**2 + (action.pickPt.y - my)**2);
                        if (d < minDist) { minDist = d; removeIdx = i; }
                    }

                    if (removeIdx !== -1) {
                        doc.removeEntity(originalTarget.id);
                        viewer.removeObject(originalTarget.id);
                        for (let i = 0; i < segments.length; i++) {
                            if (i === removeIdx) continue;
                            const newEllipse = new EllipseEntity(doc.getNextId("E"), cx, cy, majorX, majorY, ratio, segments[i].s, segments[i].e, ccw);
                            newEllipse.layer = t.layer;
                            newEllipse.properties = JSON.parse(JSON.stringify(t.properties));
                            addEntity(newEllipse, true, false);
                        }
                        trimmedAnything = true;
                    }
                }
            }
            if (trimmedAnything) break;
        }

        console.log("[TRIM DEBUG] trimmedAnything:", trimmedAnything);
        if (trimmedAnything) { this.cleanup(context); return "Entity trimmed."; }
    }

    if (action.action === 'extend' && action.id && action.boundaryIds && action.pickPt) {
        const target = doc.getEntity(action.id);
        if (target && (target instanceof Line || target instanceof ArcEntity)) {
            const boundaries = action.boundaryIds.map(id => doc.getEntity(id)).filter(Boolean) as Entity[];
            
            if (target instanceof Line) {
                let closestPt: {x:number, y:number} | null = null;
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
                    const before = target.clone(target.id);
                    const lineTarget = target as Line;
                    const point = closestPt as Point;
                    if (isStart) {
                        lineTarget.x1 = point.x;
                        lineTarget.y1 = point.y;
                    } else {
                        lineTarget.x2 = point.x;
                        lineTarget.y2 = point.y;
                    }
                    doc.recordTransform(before, target);
                    addEntity(target, false, false);
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
                    const before = target.clone(target.id);
                    if (isStart) target.startAngle = closestAngle;
                    else target.endAngle = closestAngle;
                    
                    doc.recordTransform(before, target);
                    addEntity(target, false, false);
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
