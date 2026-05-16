import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Solid3D } from "../../../model/Solid3D";
import { OpenCascadeService } from "../../../io/OpenCascadeService";

export class SChamferHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'chamfer_solid' || action.action === 'chamfer_solid_face';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.id && action.radius !== undefined) {
      const entityId = action.id;
      const distance = action.radius as number; // SChamferCommand sends distance in radius field

      const entity = doc.getEntity(entityId);
      if (!entity || !(entity instanceof Solid3D)) {
        return "Solid entity not found.";
      }

      try {
        let geometry;
        let msg = "";
        
        if (action.action === 'chamfer_solid' && action.value !== undefined) {
          const edgeIndex = action.value as number;
          geometry = await OpenCascadeService.getInstance().chamferSolid(entityId, edgeIndex, distance);
          msg = `Chamfer applied to edge ${edgeIndex}.`;
        } else if (action.action === 'chamfer_solid_face' && action.faceIndex !== undefined) {
          const faceIndex = action.faceIndex;
          geometry = await OpenCascadeService.getInstance().chamferSolidFace(entityId, faceIndex, distance);
          msg = `Chamfer applied to all edges of face ${faceIndex}.`;
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
        return `Error applying chamfer: ${err.message || err.toString()}`;
      }
    }
    return undefined;
  }
}
