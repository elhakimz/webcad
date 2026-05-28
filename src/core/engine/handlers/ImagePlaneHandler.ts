import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { ImagePlane } from "../../model/ImagePlane";

export class ImagePlaneHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'image_plane';
  }

  async handle(action: CommandAction, ctx: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = ctx;
    
    if (!action.basePoint || action.width === undefined || action.height === undefined) {
      return "Missing plane dimensions.";
    }

    const id = doc.getNextId("PLANE");
    const plane = new ImagePlane(
      id,
      action.basePoint.x,
      action.basePoint.y,
      action.width,
      action.height,
      action.rotation || 0,
      action.imageUrl || "",
      action.displayMode || 'FIT',
      action.zoomFactor || 1.0,
      action.opacity !== undefined ? action.opacity : 0.75,
      doc.currentElevation,
      doc.currentThickness
    );

    addEntity(plane);
    return `Plane '${id}' created.`;
  }
}
