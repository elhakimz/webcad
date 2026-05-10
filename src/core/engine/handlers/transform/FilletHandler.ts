import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Line } from "../../../model/Line";
import { Arc as ArcEntity } from "../../../model/Arc";
import * as MathUtils from "../../MathUtils";

export class FilletHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'fillet';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'fillet' && action.id1 && action.id2 && action.radius !== undefined && action.pick1 && action.pick2) {
      const e1 = doc.getEntity(action.id1);
      const e2 = doc.getEntity(action.id2);

      if (e1 instanceof Line && e2 instanceof Line) {
        const res = MathUtils.filletLines(
            {x: e1.x1, y: e1.y1}, {x: e1.x2, y: e1.y2},
            {x: e2.x1, y: e2.y1}, {x: e2.x2, y: e2.y2},
            action.radius!, action.pick1!, action.pick2!
        );

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
