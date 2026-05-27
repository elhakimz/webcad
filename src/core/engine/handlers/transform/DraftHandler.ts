import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Solid3D } from "../../../model/Solid3D";
import { OpenCascadeService } from "../../../io/OpenCascadeService";

export class DraftHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'draft_solid';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;
    const act = action as any;

    if (act.id && act.faceIndices && act.neutralFaceIndex !== undefined && act.angle !== undefined) {
      const entityId = act.id;
      const faceIndices = act.faceIndices as number[];
      const neutralFaceIndex = act.neutralFaceIndex as number;
      const angle = act.angle as number;
      const angleRad = (angle * Math.PI) / 180.0;

      const entity = doc.getEntity(entityId);
      if (!entity || !(entity instanceof Solid3D)) {
        return "Solid entity not found.";
      }

      try {
        // Ensure the shape is in the OCC worker cache
        if (entity.brepSnapshot) {
          try { await OpenCascadeService.getInstance().importBRep(entityId, entity.brepSnapshot); } catch (_) {}
        }

        const geometry = await OpenCascadeService.getInstance().draftSolidFaces(
          entityId, 
          faceIndices, 
          neutralFaceIndex, 
          angleRad
        );
        
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];
        const faceMapping = geometry.userData.faceMapping;
        const edgeLines = geometry.userData.edgeLines;
        
        const newSolid = new Solid3D(entityId, positions, indices, faceMapping, edgeLines);
        newSolid.brepSnapshot = geometry.userData?.brepSnapshot;
        newSolid.layer = entity.layer;
        
        // Propagate features and creationParams
        newSolid.creationParams = entity.creationParams;
        if (entity.features) {
          newSolid.features = JSON.parse(JSON.stringify(entity.features));
        }
        
        // Append Draft feature node to history
        newSolid.features.push({
          id: `${entityId}_feat_${Date.now()}`,
          type: "Draft",
          parameters: {
            faceIndices,
            neutralFaceIndex,
            angle
          },
          isActive: true
        });
        
        // Update entity in document
        doc.recordTransform(entity, newSolid);
        doc.removeEntity(entityId);
        viewer.removeObject(entityId);
        
        addEntity(newSolid, true, false);
        
        return `Draft of ${angle.toFixed(1)}° applied to ${faceIndices.length} faces.`;
      } catch (err: any) {
        return `ERROR: Failed to apply draft: ${err.message || err.toString()}`;
      }
    }
    return undefined;
  }
}
