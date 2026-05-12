import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Solid3D } from "../../../model/Solid3D";
import { OpenCascadeService } from "../../../io/OpenCascadeService";
import { PersistenceService } from "../../../persistence/PersistenceService";

export class BooleanHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'boolean_result';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'boolean_result' && action.result && action.deleteIds) {
      const solid = action.result as Solid3D;
      const deleteIds = action.deleteIds as string[];
      
      // Delete old solids
      for (const id of deleteIds) {
        const entity = doc.getEntity(id);
        if (entity) {
          doc.recordRemove(entity);
          doc.removeEntity(id);
          viewer.removeObject(id);
          await PersistenceService.getInstance().onEntityErased(id, entity);
        }
      }
      
      // Release shapes from worker
      try {
        await OpenCascadeService.getInstance().releaseShapes(deleteIds);
        console.log(`[BooleanHandler] Released shapes from worker:`, deleteIds);
      } catch (err) {
        console.error(`[BooleanHandler] Failed to release shapes from worker:`, err);
      }
      
      // Add new solid
      addEntity(solid, true, false); // recordHistory=true, useCurrentLayer=false
      
      // Automatic REGEN to clean up residue
      context.syncFromDocument();
      
      return `3D Solid created.`;
    }
    return undefined;
  }
}
