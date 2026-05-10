import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class GridCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { 
    return { type: 'prompt', text: "Grid spacing(X) or [On/Off]:" }; 
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { type: 'action', action: "grid", value: true };
    if (val === "OFF") return { type: 'action', action: "grid", value: false };
    
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
        return { type: 'action', action: "gridSet", spacing: num };
    }
    
    if (val === "") return { type: 'action', action: "gridToggle" };
    return { type: 'prompt', text: "Invalid option. Grid spacing(X) or [On/Off]:" };
  }

  getPrompt() { return "Grid spacing(X) or [On/Off] <Toggle>:"; }
}
