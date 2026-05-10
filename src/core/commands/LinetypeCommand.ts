import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class LinetypeCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return { type: 'prompt', text: this.getPrompt() };
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "?" || val === "LIST") return { type: 'action', action: "linetypeList" };
    if (val === "") return { type: 'prompt', text: "Linetype name (or ?):" };
    return { type: 'action', action: "linetypeSet", linetype: val };
  }

  getPrompt() {
    return "LINETYPE name (or ?) <CONTINUOUS>:";
  }
}
