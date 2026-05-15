import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { Entity } from "../../model/Entity";

export class ViewHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['zoom', 'pan'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { viewer, terminateActiveCommand } = context;

    if (action.action === 'zoom') {
      if (action.zoomType === 'all' || action.zoomType === 'extents') {
        const entities = context.selectedEntityIds.size > 0 
          ? Array.from(context.selectedEntityIds).map(id => context.doc.getEntity(id)).filter((e): e is Entity => e !== undefined)
          : context.doc.getAllEntities();
        viewer.zoomAll(entities);
        terminateActiveCommand();
        return `Zooming to ${context.selectedEntityIds.size > 0 ? 'selected' : 'all'} entities.`;
      }
      if (action.zoomType === 'window' && action.p1 && action.p2) {
        viewer.zoomWindow(action.p1, action.p2);
        terminateActiveCommand();
        return "Zooming to window.";
      }
      if (action.zoomType === 'scale' && action.factor !== undefined) {
        viewer.zoomScale(action.factor);
        terminateActiveCommand();
        return `Zooming with scale factor ${action.factor}.`;
      }
    }

    return undefined;
  }
}
