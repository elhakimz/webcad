import { Command, CommandResponse } from "./types"

export class EraseCommand implements Command {
  step = 0

  onInput(text: string): CommandResponse | undefined {
    // If we receive an ID directly (from hit-test in App)
    if (text) {
      return this.finish(text);
    }
  }

  onPoint(): CommandResponse {
    return "Select entity to erase";
  }

  private finish(id: string) {
    this.step = 0;
    return { action: "delete", id } as const;
  }
}
