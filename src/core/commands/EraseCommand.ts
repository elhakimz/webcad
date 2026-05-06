import { Command, CommandResponse } from "./types"

export class EraseCommand implements Command {
  step = 0
  ids: string[] = []

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.ids = ids;
    }
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    // If we receive an ID directly (from hit-test in App)
    if (text) {
      return this.finish(text);
    }
  }

  onPoint(x: number, y: number, id: string): CommandResponse {
    return "Select entity to erase";
  }

  private finish(id: string) {
    this.step = 0;
    return { action: "delete", id } as const;
  }

  getPrompt() {
    return "Select entity to erase:";
  }
}
