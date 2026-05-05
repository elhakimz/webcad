import { Command, CommandResponse } from "./types"

export class PanCommand implements Command {
  step = 0
  startX = 0
  startY = 0

  onInput(text: string): CommandResponse | undefined {
    if (this.step === 0) {
      return "Click and drag to pan. Press ESC to cancel, Enter to accept.";
    }
    if (text === "" || text.toUpperCase() === "") {
      this.step = 0
      return { action: "pan", accept: true };
    }
  }

  onPoint(x: number, y: number): CommandResponse {
    return "Click and drag to pan. Press ESC to cancel, Enter to accept.";
  }

  getPrompt() {
    return "PAN - Drag to pan, ESC cancel, Enter accept";
  }
}