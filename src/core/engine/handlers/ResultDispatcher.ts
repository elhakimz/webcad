import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";

export class ResultDispatcher {
  private handlers: ActionHandler[] = [];

  registerHandler(handler: ActionHandler) {
    this.handlers.push(handler);
  }

  dispatch(action: CommandAction, context: AppContext): CommandResponse | undefined {
    for (const handler of this.handlers) {
      if (handler.canHandle(action)) {
        return handler.handle(action, context);
      }
    }
    return undefined;
  }
}
