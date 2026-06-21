import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { OpenCascadeService } from "../../../io/OpenCascadeService";
import { Solid3D } from "../../../model/Solid3D";
import { solveDocumentGCS } from "../../../sketcher/GCSBridge";

export class ScaleHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'scale';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'scale' && (action.id || action.ids) && action.factor !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);

      const beforeStates = new Map<string, any>();
      doc.entities.forEach((ent, id) => {
          beforeStates.set(id, ent.clone(id));
      });

      for (const id of ids) {
        const entity = doc.getEntity(id);
        if (entity) {
          if (entity instanceof Solid3D) {
            try {
              const cx = action.baseX!;
              const cy = action.baseY!;
              const factor = action.factor!;
              
              const geom = await OpenCascadeService.getInstance().scaleShape(id, factor, cx, cy, 0);
              
              const solid = entity as Solid3D;
              solid.positions = Array.from(geom.attributes.position.array);
              solid.indices = geom.index ? Array.from(geom.index.array) : [];
              solid.faceMapping = geom.userData.faceMapping;
              solid.edgeLines = geom.userData.edgeLines;
              solid.brepSnapshot = geom.userData.brepSnapshot;

              solid.updateAbsolutePosition();
              
              solid.ensureFeaturesFromCreationParams();
              solid.features.push({
                id: `${id}_feat_${Date.now()}`,
                type: "Scale",
                parameters: {
                  factor: factor,
                  baseX: cx,
                  baseY: cy,
                  baseZ: 0
                },
                isActive: true
              });
              
              addEntity(entity, false, false);
            } catch (err) {
              console.error(`Failed to scale shape in worker for ${id}:`, err);
            }
          } else {
            entity.scale(action.baseX!, action.baseY!, action.factor!);
          }
        }
      }

      // After applying raw scale, solve constraints to honor 'Fix' etc.
      try {
        solveDocumentGCS(doc, doc.constraints);
      } catch (err) {
        console.warn("Solver failed after scale:", err);
      }


      // Record transforms for entities that actually changed and sync viewer
      doc.entities.forEach((ent, id) => {
        const before = beforeStates.get(id);
        if (before) {
            const changed = JSON.stringify(before) !== JSON.stringify(ent);
            if (changed) {
                doc.recordTransform(before, ent);
                addEntity(ent, false, false);
                
                // TRIGGER ASSOCIATIVE REGEN (Phase 9)
                if (context.checkAssociativeRegen) {
                    context.checkAssociativeRegen(id);
                }
            }
        }
      });

      this.cleanup(context);
      return `Entities scaled.`;
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
