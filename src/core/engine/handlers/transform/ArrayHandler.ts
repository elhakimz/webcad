import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Entity } from "../../../model/Entity";

export class ArrayHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'array';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'array' && action.ids && action.arrayType) {
      const { ids, arrayType } = action;
      let totalCreated = 0;

      if (arrayType === 'R') {
        const { rows, cols, rowSpacing, colSpacing } = action;
        for (let r = 0; r < (rows || 1); r++) {
          for (let c = 0; c < (cols || 1); c++) {
            if (r === 0 && c === 0) continue; 

            const dx = c * (colSpacing || 0);
            const dy = r * (rowSpacing || 0);

            ids.forEach(id => {
              const source = doc.getEntity(id);
              if (source) {
                const newId = doc.getNextId(this.getPrefix(source)) + "_ARRAY";
                const copy = source.clone(newId);
                copy.move(dx, dy);
                addEntity(copy, true, false);
                totalCreated++;
              }
            });
          }
        }
      } else if (arrayType === 'P') {
        const { center, count, angleToFill, rotateObjects } = action;
        const baseCenter = center || { x: 0, y: 0 };
        const totalCount = count || 2;
        const totalAngle = (angleToFill || 360) * (Math.PI / 180);
        const stepAngle = totalAngle / totalCount;

        for (let i = 1; i < totalCount; i++) {
          const currentAngle = i * stepAngle;
          ids.forEach(id => {
            const source = doc.getEntity(id);
            if (source) {
              const newId = doc.getNextId(this.getPrefix(source)) + "_ARRAY";
              const copy = source.clone(newId);
              copy.rotate(baseCenter.x, baseCenter.y, currentAngle);
              if (!rotateObjects) {
                  const bbox = copy.getBoundingBox();
                  const cx = (bbox.minX + bbox.maxX) / 2;
                  const cy = (bbox.minY + bbox.maxY) / 2;
                  copy.rotate(cx, cy, -currentAngle);
              }
              addEntity(copy, true, false);
              totalCreated++;
            }
          });
        }
      }
      this.cleanup(context);
      return `Array created: ${totalCreated} new entities.`;
    }
    return undefined;
  }

  private getPrefix(entity: Entity): string {
    const name = entity.constructor.name;
    const map: Record<string, string> = {
      'Line': 'L', 'Circle': 'C', 'Arc': 'A', 'Point': 'PT', 'Polyline': 'PL', 'Text': 'TX', 'Solid': 'SD', 'Trace': 'TR', 'Hatch': 'H', 'Shape': 'SH'
    };
    return map[name] || 'E';
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
