import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class ExtendCommand implements Command {
  step = 0
  boundaryIds: string[] = []

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.boundaryIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      if (val === "") {
        if (this.boundaryIds.length === 0) return "No boundaries selected. Select boundary edges:";
        this.step = 1;
        return "Select object to extend:";
      }
      this.boundaryIds.push(val);
      return "Select boundary edges:";
    }

    if (this.step === 1) {
      if (val === "") return { action: "finish" };
      return { action: "extend", boundaryIds: [...this.boundaryIds], id: val } as CommandResponse;
    }
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) return "Select boundary edges:";
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return "Select boundary edges:";
    if (this.step === 1) return "Select object to extend:";
    return "";
  }
}
