import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Solid3D } from "../../../model/Solid3D";
import { OpenCascadeService } from "../../../io/OpenCascadeService";

export class SFilletHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'fillet_solid';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'fillet_solid' && action.id && action.value !== undefined && action.radius !== undefined) {
      const entityId = action.id;
      const edgeIndex = action.value as number;
      const radius = action.radius as number;

      const entity = doc.getEntity(entityId);
      if (!entity || !(entity instanceof Solid3D)) {
        return "Solid entity not found.";
      }

      try {
        const geometry = await OpenCascadeService.getInstance().filletSolid(entityId, edgeIndex, radius);
        
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];
        const faceMapping = geometry.userData.faceMapping;
        const edgeLines = geometry.userData.edgeLines;
        
        const newSolid = new Solid3D(entityId, positions, indices, faceMapping, edgeLines);
        newSolid.layer = entity.layer;
        
        // Update entity in document
        doc.recordTransform(entity, newSolid);
        doc.removeEntity(entityId);
        viewer.removeObject(entityId);
        
        addEntity(newSolid, true, false);
        
        // Automatic REGEN to clean up residue
        context.syncFromDocument();
        
        return `Fillet applied to edge ${edgeIndex}.`;
      } catch (err: any) {
        return `Error applying fillet: ${err.message || err.toString()}`;
      }
    }
    return undefined;
  }
}
