import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";

export class CenterlineHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'centerline';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'centerline' && action.entities) {
      doc.history.startTransaction(doc.constraints);
      for (const ent of action.entities) {
        addEntity(ent, true, false);
      }
      doc.history.commitTransaction(doc.constraints);
      context.terminateActiveCommand();
      return "Center lines created.";
    }
    return undefined;
  }
}
