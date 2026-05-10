import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";

export class RotateHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'rotate';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'rotate' && (action.id || action.ids) && action.angle !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          const before = entity.clone(entity.id);
          entity.rotate(action.baseX!, action.baseY!, action.angle!);
          doc.recordTransform(before, entity);
          addEntity(entity, false, false); 
        }
      });
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] rotated.`;
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
