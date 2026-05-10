import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Line } from "../../../model/Line";
import { Arc as ArcEntity } from "../../../model/Arc";
import * as MathUtils from "../../MathUtils";

export class LengthenHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'lengthen';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'lengthen' && action.id && action.mode && action.value !== undefined && action.pickPt) {
      const entity = doc.getEntity(action.id);

      if (entity instanceof Line) {
        const dx = entity.x2 - entity.x1;
        const dy = entity.y2 - entity.y1;
        const currentLength = Math.sqrt(dx * dx + dy * dy);
        if (currentLength < 1e-6) {
          this.cleanup(context);
          return "Cannot lengthen zero-length line.";
        }

        let newLength: number;
        const val = action.value as number;
        switch (action.mode) {
          case 'DELTA':
            newLength = currentLength + val;
            break;
          case 'PERCENT':
            newLength = currentLength * (val / 100);
            break;
          case 'TOTAL':
            newLength = val;
            break;
        }

        if (newLength < 1e-6) {
          this.cleanup(context);
          return "Resulting length too small.";
        }

        const delta = newLength - currentLength;
        const ux = dx / currentLength;
        const uy = dy / currentLength;

        const d1 = Math.sqrt((action.pickPt.x - entity.x1) ** 2 + (action.pickPt.y - entity.y1) ** 2);
        const d2 = Math.sqrt((action.pickPt.x - entity.x2) ** 2 + (action.pickPt.y - entity.y2) ** 2);
        const extendEnd = d2 < d1;

        const before = entity.clone(entity.id);
        if (extendEnd) {
          entity.x2 = entity.x2 + ux * delta;
          entity.y2 = entity.y2 + uy * delta;
        } else {
          entity.x1 = entity.x1 - ux * delta;
          entity.y1 = entity.y1 - uy * delta;
        }

        doc.recordTransform(before, entity);
        addEntity(entity, false, false);
        this.cleanup(context);
        return `Line lengthened to ${newLength.toFixed(2)}.`;
      }

      if (entity instanceof ArcEntity) {
        const startPt = { x: entity.cx + entity.r * Math.cos(entity.startAngle), y: entity.cy + entity.r * Math.sin(entity.startAngle) };
        const endPt = { x: entity.cx + entity.r * Math.cos(entity.endAngle), y: entity.cy + entity.r * Math.sin(entity.endAngle) };

        let sweepAngle = entity.endAngle - entity.startAngle;
        if (entity.ccw && sweepAngle < 0) sweepAngle += Math.PI * 2;
        if (!entity.ccw && sweepAngle > 0) sweepAngle -= Math.PI * 2;
        
        const currentArcLength = Math.abs(entity.r * sweepAngle);
        if (currentArcLength < 1e-6) {
          this.cleanup(context);
          return "Cannot lengthen zero-length arc.";
        }

        let newArcLength: number;
        const val = action.value as number;
        switch (action.mode) {
          case 'DELTA':
            newArcLength = currentArcLength + val;
            break;
          case 'PERCENT':
            newArcLength = currentArcLength * (val / 100);
            break;
          case 'TOTAL':
            newArcLength = val;
            break;
        }

        if (newArcLength < 1e-6) {
          this.cleanup(context);
          return "Resulting arc length too small.";
        }

        const deltaAngle = newArcLength / entity.r - Math.abs(sweepAngle);
        const sign = entity.ccw ? 1 : -1;

        const d1 = Math.sqrt((action.pickPt.x - startPt.x) ** 2 + (action.pickPt.y - startPt.y) ** 2);
        const d2 = Math.sqrt((action.pickPt.x - endPt.x) ** 2 + (action.pickPt.y - endPt.y) ** 2);
        const extendEnd = d2 < d1;

        const before = entity.clone(entity.id);
        if (extendEnd) {
          entity.endAngle = entity.endAngle + sign * deltaAngle;
        } else {
          entity.startAngle = entity.startAngle - sign * deltaAngle;
        }

        doc.recordTransform(before, entity);
        addEntity(entity, false, false);
        this.cleanup(context);
        return `Arc lengthened to ${newArcLength.toFixed(2)}.`;
      }

      this.cleanup(context);
      return "Lengthen not supported for this entity type.";
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
