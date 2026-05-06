import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class EraseCommand implements Command {
  step = 0
  targetIds: string[] = []

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (this.step === 0 && val !== "") {
      this.targetIds = [val];
      return { action: "delete", ids: [...this.targetIds] } as CommandResponse;
    }
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) return "Select objects:";
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return "Select objects:";
    return "";
  }
}
