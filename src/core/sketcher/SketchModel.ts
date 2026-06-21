// src/core/sketcher/SketchModel.ts
import {hParam, ParamStore} from "./Param";
import { SketchPoint, hEntity } from "./SketchPoint";
import { SketchEntity } from "./SketchEntity";
import { STYLE } from "./SketchStyle";
import { ConstraintFactory } from "./constraints/ConstraintFactory";
import {ConstraintBase} from "./Constraint";

export type SketchDocument = SketchModel;

export class SketchModel {
  readonly params  = new ParamStore();
  readonly points  = new Map<hEntity, SketchPoint>();
  readonly entities = new Map<hEntity, SketchEntity>();
  readonly constraints: ConstraintBase[] = [];

  private nextEntityId = 1;

  addPoint(x: number, y: number, fixed = false): SketchPoint {
    const h  = this.nextEntityId++;
    const px = this.params.add(x);
    const py = this.params.add(y);
    const pt = new SketchPoint(h, px, py, false, fixed);
    if (fixed) {
      this.params.get(px).known = true;
      this.params.get(py).known = true;
    }
    this.points.set(h, pt);
    return pt;
  }

  addLine(startPt: hEntity, endPt: hEntity): SketchEntity {
    const h: hEntity = this.nextEntityId++;
    const ent: SketchEntity = {
      h, type: 'LINE_SEGMENT',
      group: 'default', workplane: 0,
      point: [startPt, endPt],
      construction: false, style: STYLE.NORMAL,
    };
    this.entities.set(h, ent);
    return ent;
  }

  addCircle(centerPt: hEntity, radius: number): SketchEntity {
    const h: hEntity = this.nextEntityId++;
    const rParam = this.params.add(radius);
    const ent: SketchEntity = {
      h, type: 'CIRCLE',
      group: 'default', workplane: 0,
      point: [centerPt],
      distance: rParam,
      construction: false, style: STYLE.NORMAL,
    };
    this.entities.set(h, ent);
    return ent;
  }

  addArc(centerPt: hEntity, startPt: hEntity, endPt: hEntity, radius: number): SketchEntity {
    const h: hEntity = this.nextEntityId++;
    const rParam = this.params.add(radius);
    const ent: SketchEntity = {
      h, type: 'ARC_OF_CIRCLE',
      group: 'default', workplane: 0,
      point: [centerPt, startPt, endPt],
      distance: rParam,
      construction: false, style: STYLE.NORMAL,
    };
    this.entities.set(h, ent);
    return ent;
  }

  addWorkplane(originPt: hEntity, normalParams: hParam[]): SketchEntity {
    const h: hEntity = this.nextEntityId++;
    const ent: SketchEntity = {
      h, type: 'WORKPLANE',
      group: 'default', workplane: 0,
      point: [originPt],
      normal: normalParams,
      construction: false, style: STYLE.NORMAL,
    };
    this.entities.set(h, ent);
    return ent;
  }

  // Connect two entities at a shared point — no coincident constraint needed
  connectAt(entityA: hEntity, ptIndexA: number,
            entityB: hEntity, ptIndexB: number): void {
    const ea = this.entities.get(entityA)!;
    const eb = this.entities.get(entityB)!;
    // Entity B's point at ptIndexB is replaced with entity A's handle
    eb.point[ptIndexB] = ea.point[ptIndexA];
  }

  getProfilePoints(): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (const ent of this.entities.values()) {
        if (ent.type === 'LINE_SEGMENT') {
            const p1 = this.points.get(ent.point[0])?.getNum(this.params);
            const p2 = this.points.get(ent.point[1])?.getNum(this.params);
            if (p1) pts.push(p1);
            if (p2) pts.push(p2);
        } else if (ent.type === 'CIRCLE') {
            const center = this.points.get(ent.point[0])?.getNum(this.params);
            const r = this.params.get(ent.distance!).val;
            if (center) {
                for (let i = 0; i <= 64; i++) {
                    const ang = (i / 64) * Math.PI * 2;
                    pts.push({ x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) });
                }
            }
        } else if (ent.type === 'ARC_OF_CIRCLE') {
            const center = this.points.get(ent.point[0])?.getNum(this.params);
            const start  = this.points.get(ent.point[1])?.getNum(this.params);
            const end    = this.points.get(ent.point[2])?.getNum(this.params);
            const r      = this.params.get(ent.distance!).val;
            
            if (center && start && end) {
                const startAng = Math.atan2(start.y - center.y, start.x - center.x);
                let endAng     = Math.atan2(end.y - center.y, end.x - center.x);
                if (endAng <= startAng) endAng += Math.PI * 2;
                
                for (let i = 0; i <= 32; i++) {
                    const ang = startAng + (endAng - startAng) * (i / 32);
                    pts.push({ x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) });
                }
            }
        }
    }
    return pts;
  }

  serialize(): string {
    return JSON.stringify({
      params: this.params.getAll(),
      nextParamId: this.params.nextId,
      points: Array.from(this.points.entries()),
      entities: Array.from(this.entities.entries()),
      constraints: this.constraints,
      nextEntityId: this.nextEntityId
    });
  }

  static deserialize(data: string): SketchModel {
    const obj = JSON.parse(data);
    const model = new SketchModel();
    
    if (obj.params) {
        model.params.load(obj.params, obj.nextParamId || 1);
    }
    
    if (obj.points) {
        for (const [h, p] of obj.points) {
            model.points.set(h, new SketchPoint(p.h, p.px, p.py, p.construction, p.fixed));
        }
    }
    
    if (obj.entities) {
        for (const [h, e] of obj.entities) {
            model.entities.set(h, { ...e });
        }
    }
    
    model.nextEntityId = obj.nextEntityId || 1;
    
    if (obj.constraints) {
        for (const cData of obj.constraints) {
            const c = ConstraintFactory.create(cData);
            if (c) model.constraints.push(c);
        }
    }
    
    return model;
  }
}
