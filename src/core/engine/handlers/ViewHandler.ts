import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";

export class ViewHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'zoom';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { viewer, cmd, doc } = context;

    if (action.zoomType === 'window' && action.p1 && action.p2) {
      viewer.zoomWindow(action.p1, action.p2);
      this.cleanup(context);
      return "Zoomed to window.";
    } else if (action.zoomType === 'all') {
      viewer.zoomAll(doc.getAllEntities());
      this.cleanup(context);
      return "Zoomed to extents.";
    } else if (action.zoomType === 'factor') {
      const factor = action.factor as number;
      viewer.zoomByFactor(factor);
      this.cleanup(context);
      return `Zoomed by ${factor}x.`;
    }

    return undefined;
  }

  private cleanup(context: AppContext) {
    const { viewer, cmd } = context;
    viewer.setPreview(null);
    viewer.setHelpers(null);
    cmd.clearActive();
  }
}
