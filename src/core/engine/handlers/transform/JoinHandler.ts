import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Line } from "../../../model/Line";
import { Arc as ArcEntity } from "../../../model/Arc";
import { Polyline } from "../../../model/Polyline";
import * as MathUtils from "../../MathUtils";

export class JoinHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'join';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'join' && action.ids) {
      const entities = action.ids.map(id => doc.getEntity(id)).filter(e => e instanceof Line || e instanceof ArcEntity) as (Line | ArcEntity)[];
      
      const sorted = MathUtils.sortConnected(entities);
      if (sorted) {
        const vertices = [];
        for (const e of sorted) {
          if (e instanceof Line) {
            vertices.push({ x: e.x1, y: e.y1, bulge: 0 });
          } else {
             const bulge = Math.tan((e.endAngle - e.startAngle) / 4);
             vertices.push({ x: e.cx + e.r * Math.cos(e.startAngle), y: e.cy + e.r * Math.sin(e.startAngle), bulge: e.ccw ? -bulge : bulge });
          }
        }
        const last = sorted[sorted.length - 1];
        if (last instanceof Line) vertices.push({ x: last.x2, y: last.y2, bulge: 0 });
        else vertices.push({ x: last.cx + last.r * Math.cos(last.endAngle), y: last.cy + last.r * Math.sin(last.endAngle), bulge: 0 });
        
        entities.forEach(e => { doc.removeEntity(e.id); viewer.removeObject(e.id); });
        const polyId = doc.getNextId("PL");
        const poly = new Polyline(polyId, vertices, false);
        addEntity(poly, true, false);
        
        this.cleanup(context);
        return "Entities joined.";
      }
      this.cleanup(context);
      return "Entities cannot be joined.";
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
