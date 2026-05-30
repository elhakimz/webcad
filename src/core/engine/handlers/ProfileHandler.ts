import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { OpenCascadeService } from "../../io/OpenCascadeService";
import { Polyline } from "../../model/Polyline";
import { GeneratorProgressModal } from "../../../ui/GeneratorProgressModal";

export class ProfileHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === "profile";
  }

  async handle(action: CommandAction, ctx: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = ctx;
    
    if (!action.id || action.faceIndex === undefined || !action.basePoint) {
      return "Profile extraction failed: Missing parameters.";
    }

    const progress = new GeneratorProgressModal("Extracting Profile");
    progress.show();
    progress.update(20, "Analyzing face topology...");

    try {
      const deflection = 0.1 / doc.facetres;
      
      // Ensure the solid is cached in the worker
      const entity = doc.getEntity(action.id);
      if (entity && (entity as any).brepSnapshot) {
        await OpenCascadeService.getInstance().importBRep(entity.id, (entity as any).brepSnapshot, deflection);
      }

      const loops = await OpenCascadeService.getInstance().extractFaceProfile(action.id, action.faceIndex, deflection);
      
      if (loops.length === 0) {
        progress.close();
        return "No boundary wires found for the selected face.";
      }

      progress.update(60, `Generating ${loops.length} polylines...`);

      doc.history.startTransaction();

      const layer = doc.layers.currentLayerName;
      let createdCount = 0;

      for (const loop of loops) {
        // Offset vertices to the placement point
        const vertices = loop.map(pt => ({
          x: pt.x + action.basePoint!.x,
          y: pt.y + action.basePoint!.y,
          bulge: 0
        }));

        const polyId = doc.getNextId("PL");
        const polyline = new Polyline(polyId, vertices, true); // Extracting profiles usually results in closed loops
        polyline.layer = layer;
        
        addEntity(polyline, true, false);
        createdCount++;
      }

      doc.history.commitTransaction();
      progress.update(100, "Done.");
      progress.close();

      return `Extracted ${createdCount} loop(s) as polylines from face ${action.faceIndex} of solid ${action.id}.`;
    } catch (err: any) {
      progress.close();
      return `Profile extraction failed: ${err.message || err}`;
    }
  }
}
