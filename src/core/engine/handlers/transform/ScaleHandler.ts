import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { OpenCascadeService } from "../../../io/OpenCascadeService";

export class ScaleHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'scale';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'scale' && (action.id || action.ids) && action.factor !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      for (const id of ids) {
        const entity = doc.getEntity(id);
        if (entity) {
          const before = entity.clone(entity.id);
          const isSolid3D = (entity as any).type === "Solid3D" || entity.constructor.name === "Solid3D";
          
          if (isSolid3D) {
            try {
              const cx = action.baseX!;
              const cy = action.baseY!;
              const factor = action.factor!;
              
              const geom = await OpenCascadeService.getInstance().scaleShape(id, factor, cx, cy, 0);
              
              const solid = entity as any;
              solid.positions = Array.from(geom.attributes.position.array);
              solid.indices = geom.index ? Array.from(geom.index.array) : [];
              solid.faceMapping = geom.userData.faceMapping;
              solid.edgeLines = geom.userData.edgeLines;
              solid.brepSnapshot = geom.userData.brepSnapshot;

              solid.updateAbsolutePosition();
              
              addEntity(entity, false, false);
            } catch (err) {
              console.error(`Failed to scale shape in worker for ${id}:`, err);
            }
          } else {
            entity.scale(action.baseX!, action.baseY!, action.factor!);
            addEntity(entity, false, false); 
          }
          doc.recordTransform(before, entity);
        }
      }
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] scaled.`;
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
