import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";

export class CopyHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'copy';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'copy' && (action.id || action.ids) && action.dx !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      const newIds: string[] = [];
      ids.forEach(id => {
        const source = doc.getEntity(id);
        if (source) {
          const newId = source.id + "_COPY_" + Math.random().toString(36).substr(2, 5);
          const copy = source.clone(newId);
          copy.move(action.dx!, action.dy!);
          addEntity(copy, true, false); 
          newIds.push(newId);
        }
      });
      this.cleanup(context);
      return `Entities copied to [${newIds.join(', ')}].`;
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
