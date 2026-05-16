import { Command, CommandResponse } from "./types";

export class RegenCommand implements Command {
  onPoint(): CommandResponse {
    return { action: "regen" };
  }

  onInput(): CommandResponse {
    return { action: "regen" };
  }

  getPrompt() {
    return "Regenerating drawing...";
  }
}
