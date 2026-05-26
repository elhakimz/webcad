import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { OpenCascadeService } from "../../../io/OpenCascadeService";
import { solveDocumentConstraints } from "../../SketchSolver";

export class RotateHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'rotate';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'rotate' && (action.id || action.ids) && action.angle !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      
      const beforeStates = new Map<string, any>();
      doc.entities.forEach((ent, id) => {
          beforeStates.set(id, ent.clone(id));
      });

      for (const id of ids) {
        const entity = doc.getEntity(id);
        if (entity) {
          const isSolid3D = (entity as any).type === "Solid3D" || entity.constructor.name === "Solid3D";
          
          if (isSolid3D) {
            try {
              const cx = action.baseX!;
              const cy = action.baseY!;
              const angle = action.angle!;
              
              const geom = await OpenCascadeService.getInstance().rotateShape(id, 0, 0, angle, cx, cy, 0);
              
              const solid = entity as any;
              solid.positions = Array.from(geom.attributes.position.array);
              solid.indices = geom.index ? Array.from(geom.index.array) : [];
              solid.faceMapping = geom.userData.faceMapping;
              solid.edgeLines = geom.userData.edgeLines;
              solid.brepSnapshot = geom.userData.brepSnapshot;

              solid.updateAbsolutePosition();
              
              addEntity(entity, false, false);
            } catch (err) {
              console.error(`Failed to rotate shape in worker for ${id}:`, err);
            }
          } else {
            entity.rotate(action.baseX!, action.baseY!, action.angle!);
            // Wait for solver to update viewer
          }
        }
      }

      // After applying raw rotation, solve constraints to honor 'Fix' etc.
      try {
        solveDocumentConstraints(doc, doc.constraints);
      } catch (err) {
        console.warn("Solver failed after rotate:", err);
      }

      // Record transforms for entities that actually changed and sync viewer
      doc.entities.forEach((ent, id) => {
        const before = beforeStates.get(id);
        if (before) {
            const changed = JSON.stringify(before) !== JSON.stringify(ent);
            if (changed) {
                doc.recordTransform(before, ent);
                addEntity(ent, false, false);
            }
        }
      });

      this.cleanup(context);
      return `Entities rotated.`;
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
