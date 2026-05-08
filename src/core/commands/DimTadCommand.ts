import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class DimTadCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { return "DIMTAD [On/Off]:"; }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "dimtad", value: true } as CommandResponse;
    if (val === "OFF") return { action: "dimtad", value: false } as CommandResponse;
    
    if (val === "") return { action: "dimtadToggle" } as CommandResponse;
    return "Invalid option. DIMTAD [On/Off]:";
  }

  getPrompt() { return "DIMTAD [On/Off] <Toggle>:"; }
}
