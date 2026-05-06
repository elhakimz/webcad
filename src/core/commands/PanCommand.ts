import { Command, CommandResponse } from "./types"

export class PanCommand implements Command {
  onPoint(x: number, y: number, id: string): CommandResponse {
    return "";
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    if (text.toUpperCase() === "EXIT" || text.toUpperCase() === "QUIT" || text === "") {
        return { action: "finish" };
    }
  }

  getPrompt() {
    return "PAN command: Click and drag to pan. Press ENTER or ESC to exit.";
  }
}
