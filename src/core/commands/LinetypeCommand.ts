import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class LinetypeCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return this.getPrompt();
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "?" || val === "LIST") return { action: "linetypeList" } as CommandResponse;
    if (val === "") return "Linetype name (or ?):";
    return { action: "linetypeSet", linetype: val } as CommandResponse;
  }

  getPrompt() {
    return "LINETYPE name (or ?) <CONTINUOUS>:";
  }
}
