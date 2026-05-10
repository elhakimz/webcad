import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";

export class StretchHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'stretch';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'stretch' && action.entities) {
      const modifiedCount = action.entities.length;
      action.entities.forEach(modifiedEntity => {
        const original = doc.getEntity(modifiedEntity.id);
        if (original) {
          doc.recordTransform(original.clone(original.id), modifiedEntity);
          addEntity(modifiedEntity, false, false);
        }
      });
      this.cleanup(context);
      return `Stretched ${modifiedCount} entities.`;
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
