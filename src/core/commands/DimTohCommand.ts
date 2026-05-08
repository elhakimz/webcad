import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class DimTohCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { return "DIMTOH [On/Off]:"; }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "dimtoh", value: true } as CommandResponse;
    if (val === "OFF") return { action: "dimtoh", value: false } as CommandResponse;
    
    if (val === "") return { action: "dimtohToggle" } as CommandResponse;
    return "Invalid option. DIMTOH [On/Off]:";
  }

  getPrompt() { return "DIMTOH [On/Off] <Toggle>:"; }
}
