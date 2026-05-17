import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Solid3D } from "../../../model/Solid3D";
import { rebuildSweepGeometry } from "./SweepGeometryUtil";

export class SweepHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'sweep';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'sweep' && action.id1 && action.id2) {
      const profileEntity = doc.getEntity(action.id1);
      const spineEntity = doc.getEntity(action.id2);

      if (!profileEntity || !spineEntity) {
        return "Invalid entities.";
      }

      const isSolid = action.type === 'SOLID';
      const facetres = doc.facetres || 5.0;
      const deflection = 0.1 / facetres;

      try {
        const solidId = doc.getNextId("S3D");
        const geomData = await rebuildSweepGeometry(
          profileEntity,
          spineEntity,
          isSolid,
          facetres,
          deflection,
          solidId,
          action.cornerMode
        );

        const solid = new Solid3D(solidId, geomData.positions, geomData.indices, geomData.faceMapping, geomData.edgeLines);
        solid.brepSnapshot = geomData.brepSnapshot;
        solid.creationParams = {
          type: 'sweep',
          params: { profileId: action.id1, spineId: action.id2, isSolid, cornerMode: action.cornerMode }
        };
        addEntity(solid, true, true);

        viewer.clearHighlight();
        context.syncFromDocument();

        return "Sweep completed.";
      } catch (e: any) {
        return `Sweep failed: ${e.message}`;
      }
    }
  }
}
