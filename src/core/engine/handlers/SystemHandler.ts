import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";

export class SystemHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['finish', 'undo', 'redo', 'regen', 'delete', 'close'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, terminateActiveCommand } = context;

    if (action.action === 'finish' || action.action === 'close') {
      terminateActiveCommand();
      return "Command finished.";
    }

    if (action.action === 'undo') {
      if (doc.canUndo()) {
        doc.undo();
        context.syncFromDocument(); 
        return "Undo performed.";
      }
      return "Nothing to undo.";
    }

    if (action.action === 'redo') {
      if (doc.canRedo()) {
        doc.redo();
        context.syncFromDocument(); 
        return "Redo performed.";
      }
      return "Nothing to redo.";
    }

    if (action.action === 'regen') {
      context.syncFromDocument(); 
      return "Regenerating drawing...";
    }

    if (action.action === 'delete' && action.ids) {
      action.ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          doc.recordRemove(entity);
          doc.removeEntity(id);
          viewer.removeObject(id);
        }
      });
      doc.updateSpatialIndex();
      return `Deleted ${action.ids.length} objects.`;
    }

    return undefined;
  }
}
