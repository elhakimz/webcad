import { Command, CommandAction } from "./types"
import { UnitsConfig } from "../model/Document"

export class JoinCommand implements Command {
  step = 0
  ids: string[] = []

  constructor(selection?: string[]) {
    if (selection && selection.length > 0) {
      this.ids = selection;
      this.step = 1;
    }
  }

  onInput(text: string, id: string, _units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined {
    if (this.step === 0) {
      if (text) {
        this.ids = text.split(",").map(s => s.trim());
      }
      return { action: "join", ids: this.ids } as CommandAction;
    }
    if (this.step === 1) {
      return { action: "join", ids: this.ids } as CommandAction;
    }
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return this.getPrompt();
  }

  getPrompt() {
    return "Select objects to join:";
  }
}
