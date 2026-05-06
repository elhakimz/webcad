import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";

export class ViewHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['zoom', 'pan'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { viewer, terminateActiveCommand } = context;

    if (action.action === 'zoom') {
      if (action.zoomType === 'all' || action.zoomType === 'extents') {
        viewer.zoomAll(context.doc.getAllEntities());
        terminateActiveCommand();
        return "Zooming to all entities.";
      }
      if (action.zoomType === 'window' && action.p1 && action.p2) {
        viewer.zoomWindow(action.p1, action.p2);
        terminateActiveCommand();
        return "Zooming to window.";
      }
    }

    return undefined;
  }
}
