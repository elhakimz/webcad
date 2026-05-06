import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class GridCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { return "Grid spacing(X) or [On/Off]:"; }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "grid", value: true } as CommandResponse;
    if (val === "OFF") return { action: "grid", value: false } as CommandResponse;
    
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
        return { action: "gridSet", spacing: num } as CommandResponse;
    }
    
    if (val === "") return { action: "gridToggle" } as CommandResponse;
    return "Invalid option. Grid spacing(X) or [On/Off]:";
  }

  getPrompt() { return "Grid spacing(X) or [On/Off] <Toggle>:"; }
}
