import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Solid3D } from "../../../model/Solid3D";
import { OpenCascadeService } from "../../../io/OpenCascadeService";

export class SFilletHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'fillet_solid' || action.action === 'fillet_solid_face';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.id && action.radius !== undefined) {
      const entityId = action.id;
      const radius = action.radius as number;

      const entity = doc.getEntity(entityId);
      if (!entity || !(entity instanceof Solid3D)) {
        return "Solid entity not found.";
      }

      try {
        let geometry;
        let msg = "";
        
        if (action.action === 'fillet_solid' && action.value !== undefined) {
          const edgeIndex = action.value as number;
          geometry = await OpenCascadeService.getInstance().filletSolid(entityId, edgeIndex, radius);
          msg = `Fillet applied to edge ${edgeIndex}.`;
        } else if (action.action === 'fillet_solid_face' && action.faceIndex !== undefined) {
          const faceIndex = action.faceIndex;
          geometry = await OpenCascadeService.getInstance().filletSolidFace(entityId, faceIndex, radius);
          msg = `Fillet applied to all edges of face ${faceIndex}.`;
        } else {
          return undefined;
        }
        
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];
        const faceMapping = geometry.userData.faceMapping;
        const edgeLines = geometry.userData.edgeLines;
        
        const newSolid = new Solid3D(entityId, positions, indices, faceMapping, edgeLines);
        newSolid.brepSnapshot = geometry.userData?.brepSnapshot;
        newSolid.layer = entity.layer;
        
        // Update entity in document
        doc.recordTransform(entity, newSolid);
        doc.removeEntity(entityId);
        viewer.removeObject(entityId);
        
        addEntity(newSolid, true, false);
        

        
        if (action.close) {
          return { action: 'close', entity: newSolid } as any;
        }

        return msg;
      } catch (err: any) {
        return `Error applying fillet: ${err.message || err.toString()}`;
      }
    }
    return undefined;
  }
}
