import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Solid3D } from "../../../model/Solid3D";
import { OpenCascadeService } from "../../../io/OpenCascadeService";

export class ShellHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'shell';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.id1 && action.thickness !== undefined) {
      const entityId = action.id1;
      const thickness = action.thickness as number;
      const faceIndices = action.faceIndices || [];

      const entity = doc.getEntity(entityId);
      if (!entity || !(entity instanceof Solid3D)) {
        return "Solid entity not found.";
      }

      try {
        // Ensure the shape is in the OCC worker cache (may be missing for externally-loaded solids)
        const solidEntity = entity as any;
        if (solidEntity.brepSnapshot) {
          try { await OpenCascadeService.getInstance().importBRep(entityId, solidEntity.brepSnapshot); } catch (_) {}
        }

        const geometry = await OpenCascadeService.getInstance().makeThickSolid(entityId, faceIndices, thickness, (action as any).removeFaces);
        
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
        
        // Append Shell feature node
        newSolid.features.push({
          id: `${entityId}_feat_${Date.now()}`,
          type: "Shell",
          parameters: {
            thickness: thickness,
            faceIndices: faceIndices,
            removeFaces: (action as any).removeFaces !== false
          },
          isActive: true
        });
        
        // Update entity in document
        doc.recordTransform(entity, newSolid);
        doc.removeEntity(entityId);
        viewer.removeObject(entityId);
        
        addEntity(newSolid, true, false);
        

        
        const msg = faceIndices.length > 0 
          ? `Shell created with thickness ${thickness} (removed faces: ${faceIndices.join(', ')}).`
          : `Shell created with thickness ${thickness}.`;
          
        return msg;
      } catch (err: any) {
        return `Error creating shell: ${err.message || err.toString()}`;
      }
    }
    return undefined;
  }
}
