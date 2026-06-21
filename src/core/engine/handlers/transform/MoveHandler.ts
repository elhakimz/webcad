import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { OpenCascadeService } from "../../../io/OpenCascadeService";
import { solveDocumentGCS } from "../../../sketcher/GCSBridge";

export class MoveHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'move';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer } = context;

    if (action.action === 'move' && (action.id || action.ids) && action.dx !== undefined) {
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

              solid.updateAbsolutePosition();
              
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
            // Do NOT add to entity/viewer here yet, wait for solver
          }
        }
      }

      // After applying raw movement, solve constraints to honor 'Fix' etc.
      try {
        solveDocumentGCS(doc, doc.constraints);
      } catch (err) {
        console.warn("Solver failed after move:", err);
      }

      // Record transforms for entities that actually changed and sync viewer
      doc.entities.forEach((ent, id) => {
        const before = beforeStates.get(id);
        if (before) {
            const changed = JSON.stringify(before) !== JSON.stringify(ent);
            if (changed) {
                doc.recordTransform(before, ent);
                context.addEntity(ent, false, false);
                
                // TRIGGER ASSOCIATIVE REGEN (Phase 9)
                if (context.checkAssociativeRegen) {
                    context.checkAssociativeRegen(id);
                }
            }
        }
      });

      this.cleanup(context);
      return `Entities moved.`;
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
