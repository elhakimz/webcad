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
          if (action.dz !== undefined && 'move3D' in entity && typeof (entity as any).move3D === 'function') {
            (entity as any).move3D(action.dx!, action.dy!, action.dz!);
            // Sync with OpenCascade worker if it's a Solid3D
            if ((entity as any).type === "Solid3D" || entity.constructor.name === "Solid3D") {
              try {
                await OpenCascadeService.getInstance().transformShape(id, action.dx!, action.dy!, action.dz!);
              } catch (err) {
                console.error(`Failed to transform shape in worker for ${id}:`, err);
              }
            }
          } else {
            entity.move(action.dx!, action.dy!);
          }
          doc.recordTransform(before, entity);
          viewer.moveObject(id, action.dx!, action.dy!, action.dz);
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
