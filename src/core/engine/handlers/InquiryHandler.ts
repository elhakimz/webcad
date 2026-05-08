import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { FormatUtils } from "../FormatUtils";
import { distancePointToPoint } from "../MathUtils";
import { Line } from "../../model/Line";
import { Circle } from "../../model/Circle";

export class InquiryHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['id', 'dist', 'area', 'list'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, terminateActiveCommand } = context;

    if (action.action === 'id') {
      const pt = action.pick1!;
      terminateActiveCommand();
      return FormatUtils.formatPoint(pt.x, pt.y, doc.units, "Point");
    }

    if (action.action === 'dist') {
      const p1 = action.pick1!;
      const p2 = action.pick2!;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = distancePointToPoint(p1.x, p1.y, p2.x, p2.y);
      const angle = Math.atan2(dy, dx);
      terminateActiveCommand();
      return `Distance = ${FormatUtils.formatValue(dist, doc.units)}, Angle = ${FormatUtils.formatAngle(angle, 1)}\nDelta X = ${FormatUtils.formatValue(dx, doc.units)}, Delta Y = ${FormatUtils.formatValue(dy, doc.units)}`;
    }

    if (action.action === 'area') {
      const area = action.value as number;
      const perimeter = action.distance as number;
      terminateActiveCommand();
      return `Area = ${area.toFixed(doc.units.precision)}, Perimeter = ${FormatUtils.formatValue(perimeter, doc.units)}`;
    }

    if (action.action === 'list') {
      const entity = action.entity!;
      terminateActiveCommand();
      let res = `Entity: ${entity.constructor.name}\nLayer: ${entity.layer}\nID: ${entity.id}`;
      
      if (entity instanceof Line) {
        const dist = distancePointToPoint(entity.x1, entity.y1, entity.x2, entity.y2);
        res += `\nStart: (${FormatUtils.formatValue(entity.x1, doc.units)}, ${FormatUtils.formatValue(entity.y1, doc.units)})`;
        res += `\nEnd: (${FormatUtils.formatValue(entity.x2, doc.units)}, ${FormatUtils.formatValue(entity.y2, doc.units)})`;
        res += `\nLength: ${FormatUtils.formatValue(dist, doc.units)}`;
      } else if (entity instanceof Circle) {
        res += `\nCenter: (${FormatUtils.formatValue(entity.cx, doc.units)}, ${FormatUtils.formatValue(entity.cy, doc.units)})`;
        res += `\nRadius: ${FormatUtils.formatValue(entity.r, doc.units)}`;
        res += `\nArea: ${FormatUtils.formatValue(Math.PI * entity.r * entity.r, doc.units)}`;
      }
      
      return res;
    }

    return undefined;
  }
}
