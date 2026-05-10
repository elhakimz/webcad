import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Line } from "../../../model/Line";
import { Arc as ArcEntity } from "../../../model/Arc";
import * as MathUtils from "../../MathUtils";

export class BreakHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'break';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'break' && action.id && action.pick1 && action.pick2) {
      const entity = doc.getEntity(action.id);
      const p1 = action.pick1;
      const p2 = action.pick2;
      
      let broken = false;
      if (entity instanceof Line) {
        const proj1 = MathUtils.projectPointOnLine(p1.x, p1.y, entity.x1, entity.y1, entity.x2, entity.y2);
        const proj2 = MathUtils.projectPointOnLine(p2.x, p2.y, entity.x1, entity.y1, entity.x2, entity.y2);
        if (proj1 && proj2) {
          doc.removeEntity(entity.id);
          viewer.removeObject(entity.id);
          const line1 = new Line(doc.getNextId("L"), entity.x1, entity.y1, proj1.x, proj1.y);
          line1.layer = entity.layer;
          line1.properties = JSON.parse(JSON.stringify(entity.properties));
          addEntity(line1, true, false);
          const line2 = new Line(doc.getNextId("L"), proj2.x, proj2.y, entity.x2, entity.y2);
          line2.layer = entity.layer;
          line2.properties = JSON.parse(JSON.stringify(entity.properties));
          addEntity(line2, true, false);
          broken = true;
        }
      } else if (entity instanceof ArcEntity) {
        const a1 = Math.atan2(p1.y - entity.cy, p1.x - entity.cx);
        const a2 = Math.atan2(p2.y - entity.cy, p2.x - entity.cx);
        doc.removeEntity(entity.id);
        viewer.removeObject(entity.id);
        const arc1 = new ArcEntity(doc.getNextId("A"), entity.cx, entity.cy, entity.r, entity.startAngle, a1, entity.ccw);
        arc1.layer = entity.layer;
        arc1.properties = JSON.parse(JSON.stringify(entity.properties));
        addEntity(arc1, true, false);
        const arc2 = new ArcEntity(doc.getNextId("A"), entity.cx, entity.cy, entity.r, a2, entity.endAngle, entity.ccw);
        arc2.layer = entity.layer;
        arc2.properties = JSON.parse(JSON.stringify(entity.properties));
        addEntity(arc2, true, false);
        broken = true;
      }
      this.cleanup(context);
      return broken ? "Object broken." : "Break supported for Line and Arc.";
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
