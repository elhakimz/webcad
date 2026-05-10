import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Line } from "../../../model/Line";
import * as MathUtils from "../../MathUtils";

export class ChamferHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'chamfer';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'chamfer' && action.id1 && action.id2 && action.dist1 !== undefined && action.dist2 !== undefined && action.pick1 && action.pick2) {
      const e1 = doc.getEntity(action.id1);
      const e2 = doc.getEntity(action.id2);

      if (e1 instanceof Line && e2 instanceof Line) {
        const res = MathUtils.chamferLines(
            {x: e1.x1, y: e1.y1}, {x: e1.x2, y: e1.y2},
            {x: e2.x1, y: e2.y1}, {x: e2.x2, y: e2.y2},
            action.dist1, action.dist2, action.pick1!, action.pick2!
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

            const chamferId = doc.getNextId("L");
            const chamferLine = new Line(chamferId, res.cp1.x, res.cp1.y, res.cp2.x, res.cp2.y);
            chamferLine.layer = e1.layer;
            addEntity(chamferLine, true, false);

            this.cleanup(context);
            return "Chamfer created.";
        }
      }
      this.cleanup(context);
      return "Chamfer only supported between two lines.";
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
