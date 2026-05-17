import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Insert } from "../../../model/Insert";
import { OpenCascadeService } from "../../../io/OpenCascadeService";

export class MirrorHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'mirror';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'mirror' && action.ids && action.p1 && action.p2 && action.deleteOriginal !== undefined) {
      const { ids, p1, p2, deleteOriginal } = action;
      const newIds: string[] = [];
      
      // Pre-validate selection to avoid partial mutations
      for (const id of ids) {
        const entity = doc.getEntity(id);
        if (entity && entity instanceof Insert) {
          throw new Error("Mirror on Insert not yet supported — deselect block references and try again.");
        }
      }
      
      if (deleteOriginal) {
        for (const id of ids) {
          const source = doc.getEntity(id);
          if (source) {
            const before = source.clone(source.id);
            const isSolid3D = (source as any).type === "Solid3D" || source.constructor.name === "Solid3D";
            
            if (isSolid3D) {
              try {
                const geom = await OpenCascadeService.getInstance().mirrorShape(id, p1, p2);
                const solid = source as any;
                solid.positions = Array.from(geom.attributes.position.array);
                solid.indices = geom.index ? Array.from(geom.index.array) : [];
                solid.faceMapping = geom.userData.faceMapping;
                solid.edgeLines = geom.userData.edgeLines;
                solid.brepSnapshot = geom.userData.brepSnapshot;
                
                source.mirror(p1, p2);
              } catch (err) {
                console.error(`Failed to mirror shape in worker for ${id}:`, err);
              }
            } else {
              source.mirror(p1, p2);
            }
            
            doc.recordTransform(before, source);
            addEntity(source, false, false);
          }
        }
      } else {
        for (const id of ids) {
          const source = doc.getEntity(id);
          if (source) {
            const targetId = doc.getNextId(source.constructor.name === "Solid3D" || (source as any).type === "Solid3D" ? "SL" : "MR");
            const target = source.clone(targetId);
            const isSolid3D = (source as any).type === "Solid3D" || source.constructor.name === "Solid3D";
            
            if (isSolid3D) {
              try {
                const geom = await OpenCascadeService.getInstance().mirrorShape(id, p1, p2, targetId);
                const solidTarget = target as any;
                solidTarget.positions = Array.from(geom.attributes.position.array);
                solidTarget.indices = geom.index ? Array.from(geom.index.array) : [];
                solidTarget.faceMapping = geom.userData.faceMapping;
                solidTarget.edgeLines = geom.userData.edgeLines;
                solidTarget.brepSnapshot = geom.userData.brepSnapshot;
                
                target.mirror(p1, p2);
              } catch (err) {
                console.error(`Failed to mirror shape in worker for ${id}:`, err);
              }
            } else {
              target.mirror(p1, p2);
            }
            
            addEntity(target, true, false);
            newIds.push(target.id);
          }
        }
      }
      this.cleanup(context);
      return deleteOriginal 
        ? `Entities mirrored and originals deleted.`
        : `Entities mirrored to [${newIds.join(', ')}].`;
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
