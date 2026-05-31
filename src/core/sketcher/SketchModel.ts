// src/core/sketcher/SketchModel.ts
import { ParamStore } from "./Param";
import { SketchPoint, hEntity } from "./SketchPoint";
import { SketchEntity, SketchEntityType } from "./SketchEntity";
import { ConstraintBase } from "./Constraint";
import { STYLE } from "./SketchStyle";

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

  // Connect two entities at a shared point — no coincident constraint needed
  connectAt(entityA: hEntity, ptIndexA: number,
            entityB: hEntity, ptIndexB: number): void {
    const ea = this.entities.get(entityA)!;
    const eb = this.entities.get(entityB)!;
    // Entity B's point at ptIndexB is replaced with entity A's handle
    eb.point[ptIndexB] = ea.point[ptIndexA];
  }

  getProfilePoints(): { x: number; y: number }[] {
    // Basic implementation for Phase 1
    const pts: { x: number; y: number }[] = [];
    for (const ent of this.entities.values()) {
        if (ent.type === 'LINE_SEGMENT') {
            const p1 = this.points.get(ent.point[0])?.getNum(this.params);
            const p2 = this.points.get(ent.point[1])?.getNum(this.params);
            if (p1) pts.push(p1);
            if (p2) pts.push(p2);
        }
    }
    return pts;
  }

  serialize(): string {
    return JSON.stringify({
      params: this.params.getAll(),
      points: Array.from(this.points.entries()),
      entities: Array.from(this.entities.entries()),
      constraints: this.constraints,
      nextId: this.nextEntityId
    });
  }

  static deserialize(data: string): SketchModel {
    const obj = JSON.parse(data);
    const model = new SketchModel();
    // Complex re-hydration would go here
    // For now, minimal implementation to satisfy Reevaluator
    return model;
  }
}
