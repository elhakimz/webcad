import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Entity } from "../../../model/Entity";
import { Line } from "../../../model/Line";
import { Circle as CircleEntity } from "../../../model/Circle";
import { Arc as ArcEntity } from "../../../model/Arc";
import { Ellipse as EllipseEntity } from "../../../model/Ellipse";
import { Point } from "../../MathUtils";
import * as MathUtils from "../../MathUtils";

export class ExtendHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'extend';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'extend' && action.id && action.boundaryIds && action.pickPt) {
        const target = doc.getEntity(action.id);
        if (target && (target instanceof Line || target instanceof ArcEntity || target instanceof EllipseEntity)) {
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
            } else if (target instanceof EllipseEntity) {
                const normalize = (a: number) => {
                    while (a < 0) a += Math.PI * 2;
                    while (a >= Math.PI * 2) a -= Math.PI * 2;
                    return a;
                };

                const s = normalize(target.startAngle);
                const e = normalize(target.endAngle);
                
                const rotation = Math.atan2(target.majorY, target.majorX);
                const majorR = Math.sqrt(target.majorX * target.majorX + target.majorY * target.majorY);
                const minorR = majorR * target.ratio;

                const getPt = (angle: number) => {
                    const tx = majorR * Math.cos(angle);
                    const ty = minorR * Math.sin(angle);
                    const rx = tx * Math.cos(rotation) - ty * Math.sin(rotation);
                    const ry = tx * Math.sin(rotation) + ty * Math.cos(rotation);
                    return { x: target.cx + rx, y: target.cy + ry };
                };

                const sPt = getPt(s);
                const ePt = getPt(e);

                const d1 = Math.sqrt((action.pickPt.x - sPt.x)**2 + (action.pickPt.y - sPt.y)**2);
                const d2 = Math.sqrt((action.pickPt.x - ePt.x)**2 + (action.pickPt.y - ePt.y)**2);
                const isStart = d1 < d2;

                let closestAngle: number | null = null;
                let minAngularDist = Infinity;

                boundaries.forEach(b => {
                    const tempEllipse = new EllipseEntity("TEMP", target.cx, target.cy, target.majorX, target.majorY, target.ratio, 0, Math.PI * 2, true);
                    const pts = MathUtils.getEntityEntityIntersections(tempEllipse, b);
                    
                    pts.forEach(p => {
                        const angle = normalize(MathUtils.getEllipsePointAngle(p.x, p.y, target.cx, target.cy, target.majorX, target.majorY, target.ratio));
                        
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
                    return "Ellipse extended.";
                }
            }
        }
    }
    return undefined;
  }
}
