import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";

export class MoveHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'move';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer } = context;

    if (action.action === 'move' && (action.id || action.ids) && action.dx !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          const before = entity.clone(entity.id);
          entity.move(action.dx!, action.dy!);
          doc.recordTransform(before, entity);
          viewer.moveObject(id, action.dx!, action.dy!);
        }
      });
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] moved.`;
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
