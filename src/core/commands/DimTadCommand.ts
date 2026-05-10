import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class DimTadCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { 
    return { type: 'prompt', text: "DIMTAD [On/Off]:" }; 
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { type: 'action', action: "dimtad", value: true };
    if (val === "OFF") return { type: 'action', action: "dimtad", value: false };
    
    if (val === "") return { type: 'action', action: "dimtadToggle" };
    return { type: 'prompt', text: "Invalid option. DIMTAD [On/Off]:" };
  }

  getPrompt() { return "DIMTAD [On/Off] <Toggle>:"; }
}
