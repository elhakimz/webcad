import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";

export class ScaleHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'scale';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'scale' && (action.id || action.ids) && action.factor !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          const before = entity.clone(entity.id);
          entity.scale(action.baseX!, action.baseY!, action.factor!);
          doc.recordTransform(before, entity);
          addEntity(entity, false, false); 
        }
      });
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] scaled.`;
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
