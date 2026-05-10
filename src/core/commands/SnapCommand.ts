import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class SnapCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { 
    return { type: 'prompt', text: "Snap spacing(X) or [On/Off]:" }; 
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { type: 'action', action: "snap", value: true };
    if (val === "OFF") return { type: 'action', action: "snap", value: false };
    
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
        return { type: 'action', action: "snapSet", spacing: num };
    }

    if (val === "") return { type: 'action', action: "snapToggle" };
    return { type: 'prompt', text: "Invalid option. Snap spacing(X) or [On/Off]:" };
  }

  getPrompt() { return "Snap spacing(X) or [On/Off] <Toggle>:"; }
}
