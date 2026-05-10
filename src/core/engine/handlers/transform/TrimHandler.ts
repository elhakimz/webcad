import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Entity } from "../../../model/Entity";
import { Line } from "../../../model/Line";
import { Circle as CircleEntity } from "../../../model/Circle";
import { Arc as ArcEntity } from "../../../model/Arc";
import { Polyline } from "../../../model/Polyline";
import { Ellipse as EllipseEntity } from "../../../model/Ellipse";
import { Point } from "../../MathUtils";
import * as MathUtils from "../../MathUtils";

export class TrimHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'trim';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'trim' && action.id && action.boundaryIds && action.pickPt) {
        const originalTarget = doc.getEntity(action.id);
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
        if (trimmedAnything) { this.cleanup(context); return "Entity trimmed."; }
    }
    return undefined;
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
