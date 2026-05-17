import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { OpenCascadeService } from "../../../io/OpenCascadeService";

export class MoveHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'move';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer } = context;

    if (action.action === 'move' && (action.id || action.ids) && action.dx !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      for (const id of ids) {
        const entity = doc.getEntity(id);
        if (entity) {
          const before = entity.clone(entity.id);
          const isSolid3D = (entity as any).type === "Solid3D" || entity.constructor.name === "Solid3D";
          
          if (isSolid3D) {
            try {
              const dx = action.dx!;
              const dy = action.dy!;
              const dz = action.dz || 0;
              
              const geom = await OpenCascadeService.getInstance().transformShape(id, dx, dy, dz);
              
              const solid = entity as any;
              solid.positions = Array.from(geom.attributes.position.array);
              solid.indices = geom.index ? Array.from(geom.index.array) : [];
              solid.faceMapping = geom.userData.faceMapping;
              solid.edgeLines = geom.userData.edgeLines;
              solid.brepSnapshot = geom.userData.brepSnapshot;

              if ('move3D' in entity && typeof (entity as any).move3D === 'function') {
                (entity as any).move3D(dx, dy, dz);
              } else {
                entity.move(dx, dy);
              }
              
              context.addEntity(entity, false, false);
            } catch (err) {
              console.error(`Failed to transform shape in worker for ${id}:`, err);
            }
          } else {
            if (action.dz !== undefined && 'move3D' in entity && typeof (entity as any).move3D === 'function') {
              (entity as any).move3D(action.dx!, action.dy!, action.dz!);
            } else {
              entity.move(action.dx!, action.dy!);
            }
            viewer.moveObject(id, action.dx!, action.dy!, action.dz);
          }
          doc.recordTransform(before, entity);
        }
      }
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] moved.`;
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
