import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";

export class ResultDispatcher {
  private handlers: ActionHandler[] = [];

  registerHandler(handler: ActionHandler) {
    this.handlers.push(handler);
  }

  async dispatch(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    for (const handler of this.handlers) {
      if (handler.canHandle(action)) {
        return await handler.handle(action, context);
      }
    }
    return undefined;
  }
}
