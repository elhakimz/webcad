import { Command, CommandResponse } from "./types"

export class PanCommand implements Command {
  onPoint(_x: number, _y: number, _id: string): CommandResponse {
    return this.getPrompt();
  }

  onInput(_text: string, _id: string): CommandResponse | undefined {
    return this.getPrompt();
  }

  getPrompt() {
    return "PAN Drag with left mouse button. Press Enter or ESC to finish.";
  }
}
