import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class OrthoCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { return "ORTHO [On/Off]:"; }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "ortho", value: true };
    if (val === "OFF") return { action: "ortho", value: false };
    if (val === "") return { action: "orthoToggle" };
    return "Invalid option. ORTHO [On/Off]:";
  }

  getPrompt() { return "ORTHO [On/Off] <Toggle>:"; }
}
