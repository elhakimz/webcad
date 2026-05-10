import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class DimTohCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { 
    return { type: 'prompt', text: "DIMTOH [On/Off]:" }; 
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { type: 'action', action: "dimtoh", value: true };
    if (val === "OFF") return { type: 'action', action: "dimtoh", value: false };
    
    if (val === "") return { type: 'action', action: "dimtohToggle" };
    return { type: 'prompt', text: "Invalid option. DIMTOH [On/Off]:" };
  }

  getPrompt() { return "DIMTOH [On/Off] <Toggle>:"; }
}
