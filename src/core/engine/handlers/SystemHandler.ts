import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { OpenCascadeService } from "../../io/OpenCascadeService";
import { PersistenceService } from "../../persistence/PersistenceService";

export class SystemHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['finish', 'undo', 'redo', 'regen', 'delete', 'close', 'unitsSet'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, terminateActiveCommand } = context;

    if (action.action === 'unitsSet') {
      doc.units.type = action.type as 'decimal' | 'architectural' | 'metric';
      doc.units.precision = action.precision || 4;
      terminateActiveCommand();
      return `Units set to ${doc.units.type} with precision ${doc.units.precision}.`;
    }

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
      await OpenCascadeService.getInstance().rehydrate(doc);
      context.syncFromDocument(); 
      const msg = (action as any)._echo ? `${(action as any)._echo}\nRegenerating drawing...` : "Regenerating drawing...";
      return msg;
    }

    if (action.action === 'delete' && action.ids) {
      const solidIds: string[] = [];
      for (const id of action.ids) {
        const entity = doc.getEntity(id);
        if (entity) {
          doc.recordRemove(entity);
          doc.removeEntity(id);
          viewer.removeObject(id);
          await PersistenceService.getInstance().onEntityErased(id, entity);
          if ((entity as any).type === "Solid3D" || entity.constructor.name === "Solid3D") {
            solidIds.push(id);
          }
        }
      }
      
      if (solidIds.length > 0) {
        try {
          await OpenCascadeService.getInstance().releaseShapes(solidIds);
          console.log(`[SystemHandler] Released shapes from worker:`, solidIds);
        } catch (err) {
          console.error(`[SystemHandler] Failed to release shapes from worker:`, err);
        }
      }
      
      doc.updateSpatialIndex();
      return `Deleted ${action.ids.length} objects.`;
    }

    return undefined;
  }
}
