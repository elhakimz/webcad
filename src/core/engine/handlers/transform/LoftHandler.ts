import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Solid3D } from "../../../model/Solid3D";
import { OpenCascadeService } from "../../../io/OpenCascadeService";
import { PersistenceService } from "../../../persistence/PersistenceService";

export class LoftHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'loft_result';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'loft_result' && action.result) {
      const solid = action.result as Solid3D;
      const deleteIds = (action.deleteIds || []) as string[];
      
      // Delete old solids if requested
      for (const id of deleteIds) {
        const entity = doc.getEntity(id);
        if (entity) {
          doc.recordRemove(entity);
          doc.removeEntity(id);
          viewer.removeObject(id);
          await PersistenceService.getInstance().onEntityErased(id, entity);
        }
      }
      
      // Release shapes from worker if deleted
      if (deleteIds.length > 0) {
        try {
          await OpenCascadeService.getInstance().releaseShapes(deleteIds);

        } catch (err) {
          console.error(`[LoftHandler] Failed to release shapes from worker:`, err);
        }
      }
      
      // Add new solid
      addEntity(solid, true, false); // recordHistory=true, useCurrentLayer=false
      
      // Automatic REGEN to clean up residue
      context.syncFromDocument();
      
      return `Loft created.`;
    }
    return undefined;
  }
}
