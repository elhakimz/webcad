import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Polyline } from "../../../model/Polyline";
import { JoinUtility } from "./JoinUtility";

export class JoinHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'join';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'join' && action.ids) {
      const allEntities = action.ids.map(id => doc.getEntity(id)).filter(e => e !== undefined);
      if (allEntities.length < 1) return "Select entities to join.";

      // 1. Convert all supported entities to Chains
      const initialChains = JoinUtility.buildChains(allEntities);
      if (initialChains.length < 1) return "No joinable entities selected.";

      // 2. Greedy merging algorithm with strict tolerance
      const tol = 1e-10;
      const mergedChains = JoinUtility.mergeChains(initialChains, tol);

      // 3. Validation: All selected joinable entities must form a single continuous chain
      // if endpoints do not meet at same coords, joining is failed and canceled.
      if (initialChains.length > 1 && mergedChains.length > 1) {
        this.cleanup(context);
        return "Entities do not meet at same coordinates. Join canceled.";
      }

      // 4. Apply changes to document
      let joinCount = 0;

      for (const chain of mergedChains) {
        // If multiple entities merged OR if it's a single entity that isn't a Polyline (e.g. Arc conversion)
        const firstSource = doc.getEntity(chain.sourceIds[0]) || allEntities.find(e => e.id === chain.sourceIds[0]);
        const shouldConvert = chain.sourceIds.length > 1 || (firstSource && !(firstSource instanceof Polyline));

        if (shouldConvert) {
          const start = chain.vertices[0];
          const end = chain.vertices[chain.vertices.length - 1];
          let isClosed = false;
          if (JoinUtility.dist(start, end) < tol && chain.vertices.length > 2) {
            isClosed = true;
            chain.vertices.pop(); // Remove duplicate endpoint
          }

          // Start transaction for this merge
          doc.history.startTransaction(doc.constraints);

          // Remove originals
          chain.sourceIds.forEach(id => {
            const ent = doc.getEntity(id);
            if (ent) {
              doc.recordRemove(ent);
              doc.removeEntity(id);
              viewer.removeObject(id);
            }
          });

          // Add new polyline
          const polyId = doc.getNextId("PL");
          const poly = new Polyline(polyId, chain.vertices, isClosed);
          
          // Inherit layer from first source entity if possible
          const firstSource = doc.getEntity(chain.sourceIds[0]) || allEntities.find(e => e.id === chain.sourceIds[0]);
          if (firstSource) {
            poly.layer = firstSource.layer;
            poly.color = firstSource.color;
            poly.linetype = firstSource.linetype;
          }

          doc.recordAdd(poly);
          addEntity(poly, false, false);
          
          doc.history.commitTransaction(doc.constraints);
          joinCount++;
        }
      }

      if (joinCount > 0) {
        this.cleanup(context);
        return `${joinCount} polylines created/updated.`;
      }

      this.cleanup(context);
      return "No entities were joined.";
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
    context.syncFromDocument();
  }
}
