import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { OpenCascadeService } from "../../../io/OpenCascadeService";

export class CopyHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'copy';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'copy' && (action.id || action.ids) && action.dx !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      const newIds: string[] = [];
      
      for (const id of ids) {
        const source = doc.getEntity(id);
        if (source) {
          const newId = doc.getNextId(source.constructor.name === "Solid3D" || (source as any).type === "Solid3D" ? "SL" : "CP");
          const copy = source.clone(newId);
          const isSolid3D = (source as any).type === "Solid3D" || source.constructor.name === "Solid3D";
          
          if (isSolid3D) {
            try {
              const dx = action.dx!;
              const dy = action.dy!;
              const dz = action.dz || 0;
              
              const geom = await OpenCascadeService.getInstance().transformShape(source.id, dx, dy, dz, newId);
              
              const solidCopy = copy as any;
              solidCopy.positions = Array.from(geom.attributes.position.array);
              solidCopy.indices = geom.index ? Array.from(geom.index.array) : [];
              solidCopy.faceMapping = geom.userData.faceMapping;
              solidCopy.edgeLines = geom.userData.edgeLines;
              solidCopy.brepSnapshot = geom.userData.brepSnapshot;
              
              solidCopy.updateAbsolutePosition();
            } catch (err) {
              console.error(`Failed to copy shape in worker for ${id}:`, err);
            }
          } else {
            copy.move(action.dx!, action.dy!);
          }
          
          addEntity(copy, true, false); 
          newIds.push(newId);
        }
      }
      this.cleanup(context);
      return `Entities copied to [${newIds.join(', ')}].`;
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
