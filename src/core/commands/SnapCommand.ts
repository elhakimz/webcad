import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class SnapCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { return "Snap spacing(X) or [On/Off]:"; }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "snap", value: true } as CommandResponse;
    if (val === "OFF") return { action: "snap", value: false } as CommandResponse;
    
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
        return { action: "snapSet", spacing: num } as CommandResponse;
    }

    if (val === "") return { action: "snapToggle" } as CommandResponse;
    return "Invalid option. Snap spacing(X) or [On/Off]:";
  }

  getPrompt() { return "Snap spacing(X) or [On/Off] <Toggle>:"; }
}
