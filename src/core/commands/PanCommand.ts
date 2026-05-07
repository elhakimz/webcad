import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class PanCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return this.getPrompt();
  }

  onInput(_text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    return this.getPrompt();
  }

  getPrompt() {
    return "";
  }
}
